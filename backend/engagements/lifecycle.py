"""
The client lifecycle after a request is submitted (docs/BUSINESS_RULES.md §3):

  proposal ⇄ counter (≤ 3 versions, 14-day expiry) → contract (e-signature)
  → deposit (5-day window, reminders on days 2 and 4) → development
  → client review ⇄ changes → final payment → production → maintenance → closed

Every function here is a state change: it checks who may act, locks the
rows it changes, records the move in the audit log and tells the other side.
Views call these; nothing else should assign statuses.
"""

import re
from datetime import timedelta

from django.db import transaction
from django.db.models import Max
from django.utils import timezone
from rest_framework.exceptions import PermissionDenied, ValidationError

from audit.service import client_ip, record
from billing import invoices
from billing.models import Charge, Payment, PaymentProof
from content.models import CarePlan, SiteSettings
from fx import service as fx
from notifications.events import notify_address, notify_client, notify_studio_event

from .capacity import accepting
from .contract import money, render
from .models import Contract, Engagement, Message, Milestone, ProjectRequest, Proposal, Reaction, Revision, WaitlistEntry

R = ProjectRequest.Status
P = Proposal.Status
E = Engagement.Status

SMALL = {"DZD": 60_000, "EUR": 400, "USD": 400}
FIXED_PRICE_SERVICES = ("product-films",)
LARGE = {"DZD": 500_000, "EUR": 3_500, "USD": 3_500}


def _path(req: ProjectRequest, tab: str = "") -> str:
    """The project in the client space, opened on the tab the news is about."""
    return f"/portal/requests/{req.reference}" + (f"?tab={tab}" if tab else "")


def _studio_path(req: ProjectRequest, tab: str = "") -> str:
    return f"/studio/requests/{req.reference}" + (f"?tab={tab}" if tab else "")


def _require_developer(user):
    if not user.is_developer:
        raise PermissionDenied()


def _require_client(user, req: ProjectRequest):
    if req.client_id != user.id:
        raise PermissionDenied()


# ── Requests ──────────────────────────────────────────────────────────────

def submit_draft(request, req: ProjectRequest) -> ProjectRequest:
    from .services import submit_request

    _require_client(request.user, req)
    if req.status != R.DRAFT:
        raise ValidationError({"status": "Only a draft can be submitted."})
    missing = {f: "This field is required." for f in ("title", "objectives") if not getattr(req, f).strip()}
    if missing:
        raise ValidationError(missing)
    if not request.user.email_verified_at:
        raise ValidationError({"email": "Confirm your e-mail first.", "code": "email_unverified"})
    # Never refused: a full studio queues it (engagements/queue.py).
    from .queue import join_on_submit

    req.status = R.SUBMITTED
    join_on_submit(req)
    return submit_request(request, req)


# ── Proposals and negotiation ─────────────────────────────────────────────

LABELS = {
    "en": ("Deposit", "Main milestone", "Final payment"),
    "fr": ("Acompte", "Étape principale", "Solde"),
}


def default_schedule(price: int, currency: str, rush: bool, lang: str = "en") -> list[dict]:
    """§3.7: 40 % deposit; 50 % for small or Rush jobs; 40/30/30 for large ones."""
    deposit, milestone, final = LABELS.get(lang, LABELS["en"])
    if price >= LARGE.get(currency, LARGE["EUR"]):
        return [{"label": deposit, "percent": 40}, {"label": milestone, "percent": 30}, {"label": final, "percent": 30}]
    share = 50 if rush or price < SMALL.get(currency, SMALL["EUR"]) else 40
    return [{"label": deposit, "percent": share}, {"label": final, "percent": 100 - share}]


def _validate_schedule(schedule: list[dict]):
    if not schedule or sum(int(x.get("percent", 0)) for x in schedule) != 100:
        raise ValidationError({"schedule": "The payment schedule must add up to 100 %."})


def send_offer(request, req_id: int, data: dict) -> Proposal:
    _require_developer(request.user)
    with transaction.atomic():
        req = ProjectRequest.objects.select_for_update().select_related("client").get(pk=req_id)
        if req.status not in (R.SUBMITTED, R.IN_REVIEW, R.CLARIFICATION, R.PROPOSAL_SENT):
            raise ValidationError({"status": f"A proposal cannot be sent while the request is '{req.status}'."})
        count = req.proposals.count()
        if count >= Proposal.MAX_VERSIONS:
            raise ValidationError({"version": "Three versions were already exchanged; this negotiation is closed."})
        plan: CarePlan = data["plan"]
        rush = (req.options or {}).get("speed") == "rush"
        # Product films are quoted per minute: a fixed price unless Younes opens it.
        negotiable = data.get("negotiable")
        if negotiable is None:
            negotiable = not (req.service and req.service.slug in FIXED_PRICE_SERVICES)
        if count + 1 >= Proposal.MAX_VERSIONS:
            negotiable = False
        schedule = data.get("schedule") or default_schedule(data["price"], data["currency"], rush, req.language)
        _validate_schedule(schedule)
        # Any open version (an earlier offer or the client's counter) is replaced.
        req.proposals.filter(status=P.SENT).update(status=P.SUPERSEDED, responded_at=timezone.now())
        proposal = Proposal.objects.create(
            request=req, version=count + 1, kind=Proposal.Kind.OFFER, author=request.user,
            title=data.get("title") or req.title, scope=data["scope"], deliverables=data.get("deliverables", ""),
            exclusions=data.get("exclusions", ""), note=data.get("note", ""),
            price=data["price"], currency=data["currency"], plan=plan, plan_name=plan.name_en,
            maintenance_days=plan.maintenance_days, revision_rounds=plan.revision_rounds, reply_hours=plan.reply_hours,
            deposit_percent=schedule[0]["percent"], schedule=schedule, timeline_days=data["timeline_days"],
            milestones=data.get("milestones") or [], nda=data.get("nda", req.wants_nda), allow_cash=bool(data.get("allow_cash")),
            negotiable=negotiable,
            expires_at=timezone.now() + timedelta(days=Proposal.VALID_DAYS),
        )
        req.status = R.PROPOSAL_SENT
        req.save(update_fields=["status", "updated_at"])
        record(request, "proposal.sent", req, version=proposal.version, price=proposal.price, currency=proposal.currency)
    notify_client("proposal_sent", req.client, _path(req), title=req.title, price=money(proposal.price, proposal.currency))
    return proposal


def respond(request, proposal_id: int, action: str, price: int | None = None, note: str = "") -> Proposal:
    """accept / decline / counter. Clients answer offers; Younes answers counters."""
    user = request.user
    with transaction.atomic():
        proposal = Proposal.objects.select_for_update().select_related("request__client", "plan").get(pk=proposal_id)
        req = ProjectRequest.objects.select_for_update().get(pk=proposal.request_id)
        is_offer = proposal.kind == Proposal.Kind.OFFER
        if is_offer:
            _require_client(user, req)
        else:
            _require_developer(user)
        if proposal.status != P.SENT:
            raise ValidationError({"status": "This version was already answered."})
        if proposal.expires_at < timezone.now():
            raise ValidationError({"status": "This proposal has expired."})

        now = timezone.now()
        if action == "accept":
            proposal.status, proposal.responded_at = P.ACCEPTED, now
            proposal.save(update_fields=["status", "responded_at"])
            req.status = R.ACCEPTED
            req.save(update_fields=["status", "updated_at"])
            body, digest = render(proposal, req.language)
            Contract.objects.create(proposal=proposal, request=req, language=req.language, body=body, sha256=digest)
            record(request, "proposal.accepted", req, version=proposal.version)
        elif action == "decline":
            proposal.status, proposal.responded_at = P.DECLINED, now
            proposal.save(update_fields=["status", "responded_at"])
            req.status, req.status_note = R.DECLINED, note.strip()
            req.save(update_fields=["status", "status_note", "updated_at"])
            record(request, "proposal.declined", req, version=proposal.version, note=note)
        elif action == "counter":
            if not is_offer:
                raise ValidationError({"action": "Answer a counter-offer with a new offer instead."})
            if not proposal.negotiable or req.proposals.count() >= Proposal.MAX_VERSIONS:
                raise ValidationError({"action": "This is the final offer: accept or decline it."})
            if not price or price <= 0:
                raise ValidationError({"price": "Enter the price you propose."})
            proposal.status, proposal.responded_at = P.COUNTERED, now
            proposal.save(update_fields=["status", "responded_at"])
            counter = Proposal.objects.get(pk=proposal.pk)
            counter.pk, counter.id = None, None
            counter._state.adding = True  # save() must INSERT a new version
            counter.version, counter.kind, counter.author = proposal.version + 1, Proposal.Kind.COUNTER, user
            counter.status, counter.price, counter.note, counter.negotiable = P.SENT, price, note.strip(), True
            counter.responded_at, counter.expires_at = None, now + timedelta(days=Proposal.VALID_DAYS)
            counter.save()
            record(request, "proposal.countered", req, version=counter.version, price=price)
            proposal = counter
        else:
            raise ValidationError({"action": "Unknown action."})

    client = req.client
    price_text = money(proposal.price, proposal.currency)
    if action == "accept":
        notify_client("contract_ready", client, _path(req, "contract"), title=req.title, price=price_text)
        if is_offer:
            notify_studio_event("studio_accepted", _studio_path(req), ref=req.reference, price=price_text, client=client.full_name, title=req.title)
    elif action == "decline" and is_offer:
        notify_studio_event("studio_declined", _studio_path(req), ref=req.reference, client=client.full_name, title=req.title, note=note)
    elif action == "counter":
        notify_studio_event("studio_counter", _studio_path(req), ref=req.reference, price=price_text, client=client.full_name, title=req.title, note=note)
    return proposal


def _expire_proposal(proposal: Proposal):
    proposal.status = P.EXPIRED
    proposal.save(update_fields=["status"])
    req = proposal.request
    if req.status == R.PROPOSAL_SENT:
        req.status = R.EXPIRED
        req.save(update_fields=["status", "updated_at"])
    notify_client("proposal_expired", req.client, _path(req), title=req.title)


# ── Contract → engagement ─────────────────────────────────────────────────

def sign_contract(request, contract_id: int, signed_name: str, agree: bool) -> Engagement:
    with transaction.atomic():
        contract = Contract.objects.select_for_update().select_related("proposal", "request__client").get(pk=contract_id)
        req = contract.request
        _require_client(request.user, req)
        if contract.status != Contract.Status.PENDING:
            raise ValidationError({"status": "This contract is not waiting for a signature."})
        if not agree:
            raise ValidationError({"agree": "Tick the box to agree to the contract."})
        if len(signed_name.strip()) < 3:
            raise ValidationError({"signed_name": "Type your full name to sign."})
        now = timezone.now()
        contract.status, contract.signer, contract.signed_name, contract.signed_at = Contract.Status.SIGNED, request.user, signed_name.strip(), now
        contract.ip, contract.user_agent = client_ip(request), request.META.get("HTTP_USER_AGENT", "")[:255]
        contract.save()
        engagement = _open_engagement(contract)
        record(request, "contract.signed", req, sha256=contract.sha256, name=contract.signed_name)
    deposit = engagement.charges.first()
    client = req.client
    notify_studio_event("studio_signed", _studio_path(req, "payments"), ref=req.reference, client=client.full_name, title=req.title)
    notify_client("payment_due", client, _path(req, "payments"), label=deposit.label, title=req.title, amount=money(deposit.amount, deposit.currency))
    return engagement


def _open_engagement(contract: Contract) -> Engagement:
    p = contract.proposal
    engagement = Engagement.objects.create(
        request=contract.request, contract=contract, client=contract.request.client, title=p.title, price=p.price,
        currency=p.currency, plan_name=p.plan_name, maintenance_days=p.maintenance_days,
        revision_rounds=p.revision_rounds, timeline_days=p.timeline_days, nda=p.nda,
    )
    now, paid_so_far, last = timezone.now(), 0, len(p.schedule) - 1
    for i, item in enumerate(p.schedule):
        amount = round(p.price * item["percent"] / 100) if i < last else p.price - paid_so_far
        paid_so_far += amount
        kind = Charge.Kind.DEPOSIT if i == 0 else Charge.Kind.BALANCE if i == last else Charge.Kind.MILESTONE
        Charge.objects.create(
            engagement=engagement, order=i, kind=kind, label=item["label"], percent=item["percent"], amount=amount,
            currency=p.currency, status=Charge.Status.DUE if i == 0 else Charge.Status.SCHEDULED,
            due_from=now if i == 0 else None, due_at=now + timedelta(days=Charge.PAYMENT_WINDOW_DAYS) if i == 0 else None,
        )
    return engagement


# ── Payments ──────────────────────────────────────────────────────────────

def _make_due(charge: Charge, announce: bool = True):
    """Due now, with the usual window. Unannounced (the client chose to pay early): no e-mail, no reminders."""
    now = timezone.now()
    charge.status, charge.due_from, charge.due_at = Charge.Status.DUE, now, now + timedelta(days=Charge.PAYMENT_WINDOW_DAYS)
    charge.reminders_sent = 0 if announce else len(Charge.REMINDER_DAYS)
    charge.save(update_fields=["status", "due_from", "due_at", "reminders_sent"])
    if announce:
        req = charge.engagement.request
        notify_client("payment_due", req.client, _path(req, "payments"), label=charge.label, title=req.title, amount=money(charge.amount, charge.currency))


def request_charge(request, charge_id: int) -> Charge:
    """
    Younes asks for a scheduled payment now, whenever the work is far enough
    along (midway, in production). Whatever is left is asked automatically
    when the work is ready for review.
    """
    _require_developer(request.user)
    with transaction.atomic():
        charge = Charge.objects.select_for_update().select_related("engagement__request__client").get(pk=charge_id)
        if charge.status != Charge.Status.SCHEDULED:
            raise ValidationError({"status": "This payment is not scheduled."})
        if charge.engagement.status not in Engagement.STARTED:
            raise ValidationError({"status": "The deposit comes first."})
        _make_due(charge)
        record(request, "charge.requested", charge.engagement.request, charge=charge.label)
    return charge


def pay_early(request, charge_id: int) -> Charge:
    """The client settles a scheduled part before it is asked for: it opens for payment now."""
    with transaction.atomic():
        charge = Charge.objects.select_for_update().select_related("engagement__request__client").get(pk=charge_id)
        _require_client(request.user, charge.engagement.request)
        if charge.status == Charge.Status.DUE:
            return charge
        if not charge.can_pay_early():
            raise ValidationError({"status": "This payment can't be paid yet."})
        _make_due(charge, announce=False)
        record(request, "charge.opened_early", charge.engagement.request, charge=charge.label)
    return charge


# ── Extra costs and optional offers (outside the contract total) ─────────

def add_extra(request, engagement_id: int, label: str, amount: int, currency: str, description: str = "", optional: bool = False) -> Charge:
    """
    A cost the contract doesn't cover (AI credits, an API, hosting, a feature
    asked for along the way). Required: due now. Optional: an offer the client
    accepts (then pays) or declines. Either way a card lands in the chat.
    """
    _require_developer(request.user)
    label, description = label.strip(), description.strip()
    if not label:
        raise ValidationError({"label": "Name the cost."})
    if amount <= 0:
        raise ValidationError({"amount": "Enter the amount."})
    with transaction.atomic():
        eng = Engagement.objects.select_for_update().select_related("request__client").get(pk=engagement_id)
        if eng.status not in Engagement.STARTED:
            raise ValidationError({"status": "Extras open once the deposit is paid, until the project is closed."})
        order = (eng.charges.aggregate(last=Max("order"))["last"] or 0) + 1
        charge = Charge.objects.create(
            engagement=eng, order=order, kind=Charge.Kind.EXTRA, label=label[:80], description=description,
            optional=optional, amount=amount, currency=currency,
            status=Charge.Status.PROPOSED if optional else Charge.Status.SCHEDULED,
        )
        if not optional:
            _make_due(charge, announce=False)
        req = eng.request
        message = Message.objects.create(request=req, sender=request.user, kind=Message.Kind.CHARGE, charge=charge, body=description)
        record(request, "extra.offered" if optional else "extra.added", req, label=charge.label, amount=amount, currency=currency)
    _announce(message)
    price = money(amount, currency)
    if optional:
        notify_client("offer_proposed", req.client, _path(req, "payments"), title=req.title, label=charge.label, amount=price)
    else:
        why = description.splitlines()[0][:120] if description else charge.label
        notify_client("extra_due", req.client, _path(req, "payments"), title=req.title, label=charge.label, amount=price, why=why)
    return charge


def answer_offer(request, charge_id: int, accept: bool) -> Charge:
    with transaction.atomic():
        charge = Charge.objects.select_for_update().select_related("engagement__request__client").get(pk=charge_id)
        req = charge.engagement.request
        _require_client(request.user, req)
        if charge.status != Charge.Status.PROPOSED:
            raise ValidationError({"status": "This offer was already answered."})
        charge.answered_at = timezone.now()
        if accept:
            charge.save(update_fields=["answered_at"])
            _make_due(charge, announce=False)
        else:
            charge.status = Charge.Status.DECLINED
            charge.save(update_fields=["status", "answered_at"])
        record(request, "extra.accepted" if accept else "extra.declined", req, label=charge.label)
    notify_studio_event("studio_offer_answer", _studio_path(req, "payments"), ref=req.reference, client=req.client.full_name,
                        answer="accepted" if accept else "declined", label=charge.label, amount=money(charge.amount, charge.currency))
    return charge


def withdraw_extra(request, charge_id: int) -> Charge:
    """Younes takes back an extra or an offer that isn't paid (nor being paid)."""
    _require_developer(request.user)
    with transaction.atomic():
        charge = Charge.objects.select_for_update().select_related("engagement__request").get(pk=charge_id)
        if not charge.is_extra or charge.status not in (Charge.Status.PROPOSED, Charge.Status.DUE):
            raise ValidationError({"status": "Only an unpaid extra can be withdrawn."})
        if (charge.payments.filter(status=Payment.Status.PENDING).exists()
                or charge.proofs.filter(status=PaymentProof.Status.PENDING).exists()):
            raise ValidationError({"status": "A payment for it is in progress: check it first."})
        charge.status = Charge.Status.VOID
        charge.save(update_fields=["status"])
        record(request, "extra.withdrawn", charge.engagement.request, label=charge.label)
    return charge


def mark_paid(request, charge: Charge, payment: Payment) -> Charge:
    """A charge is settled and invoiced. Called inside a transaction with the charge locked."""
    now = timezone.now()
    charge.status, charge.paid_at = Charge.Status.PAID, now
    charge.save(update_fields=["status", "paid_at"])
    invoice = invoices.issue(charge, payment)
    eng = Engagement.objects.select_for_update().select_related("request__client").get(pk=charge.engagement_id)
    req = eng.request
    if charge.kind == Charge.Kind.DEPOSIT and eng.status == E.AWAITING_DEPOSIT:
        eng.status, eng.started_at = E.IN_DEVELOPMENT, now
        eng.deadline = (now + timedelta(days=eng.timeline_days)).date()
        eng.save(update_fields=["status", "started_at", "deadline", "updated_at"])
        day = 0
        for i, m in enumerate(eng.contract.proposal.milestones):
            day += int(m.get("days", 0))
            Milestone.objects.create(
                engagement=eng, order=i, title=m["title"], due_date=(now + timedelta(days=day)).date(),
                status=Milestone.Status.ACTIVE if i == 0 else Milestone.Status.PLANNED,
            )
        notify_client("project_started", req.client, _path(req, "progress"), title=req.title, deadline=eng.deadline.isoformat())
    record(request, "charge.paid", req, charge=charge.label, amount=charge.amount, provider=payment.provider, invoice=invoice.number)
    notify_client("payment_received", req.client, _path(req, "payments"), invoice_id=invoice.pk, amount=money(charge.amount, charge.currency),
                  title=req.title, label=charge.label, number=invoice.number)
    return charge


def record_cash(request, charge_id: int) -> Charge:
    _require_developer(request.user)
    with transaction.atomic():
        charge = Charge.objects.select_for_update().get(pk=charge_id)
        if charge.status != Charge.Status.DUE:
            raise ValidationError({"status": "Only a due payment can be recorded."})
        payment = Payment.objects.create(
            charge=charge, provider=Payment.Provider.CASH, amount=charge.amount, currency=charge.currency,
            status=Payment.Status.PAID, confirmed_by=request.user, paid_at=timezone.now(),
        )
        return mark_paid(request, charge, payment)


def submit_proof(request, charge_id: int, method: str, upload=None, upload_name: str = "", **fields) -> PaymentProof:
    with transaction.atomic():
        charge = Charge.objects.select_for_update().select_related("engagement__request__client").get(pk=charge_id)
        req = charge.engagement.request
        _require_client(request.user, req)
        if charge.status != Charge.Status.DUE:
            raise ValidationError({"status": "This payment is not due."})
        crypto = {}
        if method == PaymentProof.Method.CASH and not charge.engagement.contract.proposal.allow_cash:
            raise ValidationError({"method": "Cash by hand isn't offered for this project."})
        if method == PaymentProof.Method.USDT:
            crypto = _usdt_quote(charge, fields.get("tx_hash", ""))
        elif method != PaymentProof.Method.CASH and upload is None:
            raise ValidationError({"receipt": "Add a photo or PDF of the receipt."})
        proof = PaymentProof.objects.create(
            charge=charge, client=request.user, method=method, receipt=upload, receipt_name=upload_name,
            payer_name=fields.get("payer_name", ""), transfer_reference=fields.get("transfer_reference", ""),
            note=fields.get("note", ""), **crypto,
        )
        record(request, "proof.submitted", req, charge=charge.label, method=method)
    notify_studio_event("studio_proof", _studio_path(req, "payments"), ref=req.reference, client=req.client.full_name,
                        method=proof.get_method_display(), label=charge.label, amount=money(charge.amount, charge.currency))
    return proof


TX_HASH = re.compile(r"^0x[0-9a-fA-F]{64}$")


def _usdt_quote(charge: Charge, tx_hash: str) -> dict:
    """USDT on BEP20: a valid, unused transaction hash, and the amount it should carry."""
    if not SiteSettings.load().usdt_bep20_address:
        raise ValidationError({"method": "USDT payments are not open yet."})
    tx_hash = tx_hash.strip()
    if not TX_HASH.match(tx_hash):
        raise ValidationError({"tx_hash": "Paste the transaction hash: 0x followed by 64 characters."})
    if PaymentProof.objects.filter(tx_hash__iexact=tx_hash).exclude(status=PaymentProof.Status.REJECTED).exists():
        raise ValidationError({"tx_hash": "This transaction was already used for a payment."})
    rates = fx.current()
    return {"tx_hash": tx_hash.lower(), "crypto_amount": fx.to_usdt(charge.amount, charge.currency, rates), "crypto_rate": rates["USDT"]}


def review_proof(request, proof_id: int, approve: bool, note: str = "") -> PaymentProof:
    _require_developer(request.user)
    with transaction.atomic():
        proof = PaymentProof.objects.select_for_update().select_related("charge__engagement__request__client").get(pk=proof_id)
        if proof.status != PaymentProof.Status.PENDING:
            raise ValidationError({"status": "This receipt was already reviewed."})
        if not approve and not note.strip():
            raise ValidationError({"note": "Say why, so the client can fix it."})
        charge = Charge.objects.select_for_update().get(pk=proof.charge_id)
        proof.reviewer, proof.reviewed_at, proof.review_note = request.user, timezone.now(), note.strip()
        if approve:
            if charge.status != Charge.Status.DUE:
                raise ValidationError({"status": "This payment is no longer due."})
            payment = Payment.objects.create(
                charge=charge, provider=proof.method, amount=charge.amount, currency=charge.currency,
                status=Payment.Status.PAID, confirmed_by=request.user, paid_at=timezone.now(), provider_ref=proof.tx_hash,
                payload={"usdt": str(proof.crypto_amount), "rate": str(proof.crypto_rate)} if proof.tx_hash else {},
            )
            proof.status, proof.payment = PaymentProof.Status.APPROVED, payment
            proof.save()
            mark_paid(request, charge, payment)
        else:
            proof.status = PaymentProof.Status.REJECTED
            proof.save()
            req = charge.engagement.request
            record(request, "proof.rejected", req, note=note)
            notify_client("proof_rejected", req.client, _path(req, "payments"), label=charge.label, note=note.strip())
    return proof


# ── Development, review, launch ───────────────────────────────────────────

MAX_EXTENSION_DAYS = 365


def engagement_action(request, engagement_id: int, action: str, note: str = "", days: int = 0) -> Engagement:
    """
    Moves of the project, and the things either side does on it without
    moving it (a target of None): an extra revision round, a longer
    maintenance, a problem reported on the live project.
    """
    user = request.user
    message = None
    with transaction.atomic():
        eng = Engagement.objects.select_for_update().select_related("request__client").get(pk=engagement_id)
        req = eng.request
        dev_moves = {
            "ready_for_review": ({E.IN_DEVELOPMENT}, E.CLIENT_REVIEW),
            "hold": ({E.IN_DEVELOPMENT, E.CLIENT_REVIEW}, E.ON_HOLD),
            "resume": ({E.ON_HOLD}, E.IN_DEVELOPMENT),
            "go_live": ({E.AWAITING_BALANCE}, E.LIVE),
            "cancel": ({E.AWAITING_DEPOSIT, E.IN_DEVELOPMENT, E.CLIENT_REVIEW, E.ON_HOLD}, E.CANCELLED),
            "close": ({E.LIVE}, E.CLOSED),
            "grant_revision": (set(Engagement.STARTED), None),
            # A closed project comes back into maintenance.
            "extend_maintenance": ({E.LIVE, E.CLOSED}, E.LIVE),
        }
        client_moves = {
            "approve": ({E.CLIENT_REVIEW}, E.AWAITING_BALANCE),
            "request_changes": ({E.CLIENT_REVIEW}, E.IN_DEVELOPMENT),
            "report_issue": ({E.LIVE}, None),
        }
        moves = dev_moves if user.is_developer else client_moves
        if not user.is_developer:
            _require_client(user, req)
        if action not in moves:
            raise PermissionDenied()
        allowed_from, target = moves[action]
        if eng.status not in allowed_from:
            raise ValidationError({"action": f"Not possible while the project is '{eng.status}'."})
        if action in ("request_changes", "report_issue") and not note.strip():
            raise ValidationError({"note": "Describe the changes you need." if action == "request_changes" else "Describe the problem."})
        if action == "request_changes" and eng.revisions_used >= eng.revision_rounds:
            raise ValidationError({"action": "All revision rounds in your plan are used. Ask for a change request in the conversation."})
        if action == "go_live" and eng.charges.filter(status__in=Charge.OPEN).exists():
            raise ValidationError({"action": "Every payment must be settled before going live."})
        if action == "extend_maintenance" and not 1 <= days <= MAX_EXTENSION_DAYS:
            raise ValidationError({"days": f"Between 1 and {MAX_EXTENSION_DAYS} days."})

        now = timezone.now()
        if target:
            eng.status = target
        if action == "request_changes":
            eng.revisions_used += 1
            Revision.objects.create(engagement=eng, number=eng.revisions_used, note=note.strip())
        elif action == "grant_revision":
            eng.revision_rounds += 1
            eng.revisions_granted += 1
        elif action == "go_live":
            eng.production_at, eng.maintenance_ends_at = now, now + timedelta(days=eng.maintenance_days)
        elif action == "extend_maintenance":
            eng.maintenance_ends_at = max(eng.maintenance_ends_at or now, now) + timedelta(days=days)
            eng.closed_at = None
        elif action == "close":
            eng.closed_at = now
        elif action == "cancel":
            eng.charges.filter(status__in=[*Charge.OPEN, Charge.Status.PROPOSED]).update(status=Charge.Status.VOID)
        elif action == "report_issue":
            message = Message.objects.create(request=req, sender=user, kind=Message.Kind.ISSUE, body=note.strip())
        eng.save()
        if action in ("ready_for_review", "approve"):
            # Finalisation: whatever is left of the contract is asked for now
            # (on approval too, for work sent for review before this rule).
            for charge in eng.charges.filter(status=Charge.Status.SCHEDULED, kind__in=Charge.CONTRACT_KINDS):
                _make_due(charge)
        record(request, f"engagement.{action}", req, note=note.strip(), **({"days": days} if days else {}))

    client = req.client
    if message:
        _announce(message)
    if action == "ready_for_review":
        notify_client("review_ready", client, _path(req, "progress"), title=req.title)
    elif action == "grant_revision":
        notify_client("revision_granted", client, _path(req, "progress"), title=req.title, left=eng.revision_rounds - eng.revisions_used)
    elif action == "extend_maintenance":
        notify_client("maintenance_extended", client, _path(req), title=req.title, until=eng.maintenance_ends_at.date().isoformat())
    elif action == "close":
        notify_client("project_closed", client, _path(req), title=req.title)
    elif action == "report_issue":
        notify_studio_event("studio_issue", _studio_path(req, "messages"), ref=req.reference, client=client.full_name, note=note.strip())
    elif action == "go_live":
        notify_client("project_live", client, _path(req), title=req.title, until=eng.maintenance_ends_at.date().isoformat())
        notify_client("review_invite", client, _path(req), title=req.title)
        if not eng.nda:
            from content.portfolio import draft_case_study

            draft_case_study(eng)
    elif action == "request_changes":
        notify_studio_event("studio_changes", _studio_path(req, "progress"), ref=req.reference, client=client.full_name, note=note.strip())
    elif action == "approve":
        notify_studio_event("studio_approved", _studio_path(req, "progress"), ref=req.reference, client=client.full_name, what=req.title)
    return eng


def review_milestone(request, milestone_id: int, approve: bool, note: str = "") -> Milestone:
    with transaction.atomic():
        milestone = Milestone.objects.select_for_update().select_related("engagement__request__client").get(pk=milestone_id)
        eng = Engagement.objects.select_for_update().select_related("request__client").get(pk=milestone.engagement_id)
        _require_client(request.user, eng.request)
        if milestone.status != Milestone.Status.REVIEW:
            raise ValidationError({"status": "This milestone is not waiting for review."})
        if not approve and not note.strip():
            raise ValidationError({"note": "Describe the changes you need."})
        if not approve and eng.revisions_used >= eng.revision_rounds:
            raise ValidationError({"decision": "All revision rounds in your plan are used. Ask for a change request in the conversation."})
        milestone.client_note = note.strip()
        if approve:
            milestone.status, milestone.approved_at = Milestone.Status.APPROVED, timezone.now()
            nxt = eng.milestones.filter(order__gt=milestone.order, status=Milestone.Status.PLANNED).first()
            if nxt:
                nxt.status = Milestone.Status.ACTIVE
                nxt.save(update_fields=["status"])
        else:
            milestone.status = Milestone.Status.CHANGES
            eng.revisions_used += 1
            eng.save(update_fields=["revisions_used", "updated_at"])
            Revision.objects.create(engagement=eng, number=eng.revisions_used, milestone=milestone, note=note.strip())
        milestone.save()
        record(request, "milestone.approved" if approve else "milestone.changes", eng.request, milestone=milestone.title)
    req = eng.request
    if approve:
        notify_studio_event("studio_approved", _studio_path(req, "progress"), ref=req.reference, client=req.client.full_name, what=milestone.title)
    else:
        notify_studio_event("studio_changes", _studio_path(req, "progress"), ref=req.reference, client=req.client.full_name, note=note.strip())
    return milestone


def set_milestone_status(request, milestone_id: int, status: str) -> Milestone:
    """Younes moves a milestone (active / review). Asking for review alerts the client."""
    _require_developer(request.user)
    if status not in (Milestone.Status.ACTIVE, Milestone.Status.REVIEW, Milestone.Status.PLANNED):
        raise ValidationError({"status": "Use the client's review to approve a milestone."})
    milestone = Milestone.objects.select_related("engagement__request__client").get(pk=milestone_id)
    milestone.status = status
    milestone.save(update_fields=["status"])
    req = milestone.engagement.request
    record(request, "milestone.status", req, milestone=milestone.title, status=status)
    if status == Milestone.Status.REVIEW:
        notify_client("milestone_review", req.client, _path(req, "progress"), milestone=milestone.title)
    return milestone


# ── Conversation ──────────────────────────────────────────────────────────

def _announce(message: Message):
    """Both sides' open conversations show it at once."""
    from live.service import message_posted

    message_posted(message)


def post_message(request, req: ProjectRequest, body: str, attachment=None, reply_to: int | None = None) -> Message:
    user = request.user
    if not user.is_developer:
        _require_client(user, req)
    if req.status == R.DRAFT:
        raise ValidationError({"body": "Send the request first."})
    if not body.strip() and attachment is None:
        raise ValidationError({"body": "Write a message or attach a file."})
    quoted = None
    if reply_to:
        quoted = req.messages.filter(pk=reply_to).first()
        if quoted is None:
            raise ValidationError({"reply_to": "That message isn't in this conversation."})
    message = Message.objects.create(request=req, sender=user, body=body.strip(), attachment=attachment, reply_to=quoted)
    _announce(message)
    preview = (body.strip()[:140] or ("Voice note" if attachment and attachment.is_voice else "File")).replace("\n", " ")
    if user.is_developer:
        notify_client("new_message", req.client, _path(req, "messages"), title=req.title, sender="Younes", preview=preview)
    else:
        notify_studio_event("studio_message", _studio_path(req, "messages"), ref=req.reference, client=req.client.full_name, preview=preview)
    return message


def react(request, message: Message, emoji: str) -> Message:
    """One emoji per person per message: the same one again takes it back, another replaces it."""
    user = request.user
    req = message.request
    if not user.is_developer:
        _require_client(user, req)
    if emoji not in Reaction.EMOJI:
        raise ValidationError({"emoji": "Pick one of the reactions offered."})
    mine = message.reactions.filter(user=user).first()
    if mine and mine.emoji == emoji:
        mine.delete()
    elif mine:
        mine.emoji = emoji
        mine.save(update_fields=["emoji"])
    else:
        Reaction.objects.create(message=message, user=user, emoji=emoji)
    from live.service import push, user_group, STUDIO

    push([user_group(req.client_id), STUDIO], {"type": "message", "request": req.pk, "reference": req.reference, "id": message.pk,
                                              "sender": message.sender_id, "reaction": True})
    return message


# ── Timers (run every few minutes: manage.py lifecycle_tick / Celery beat) ─

def tick(now=None) -> dict:
    now = now or timezone.now()
    counts = {"proposals_expired": 0, "reminders": 0, "deposits_expired": 0, "closed": 0, "waitlist": 0, "review_reminders": 0}

    # Card and PayPal payments whose notice never came are asked about first,
    # so a deposit paid in the last minutes is settled before its window is checked.
    from billing import online

    counts["payments_checked"] = online.sweep(now)

    for proposal in Proposal.objects.filter(status=P.SENT, expires_at__lt=now).select_related("request__client"):
        with transaction.atomic():
            _expire_proposal(proposal)
        counts["proposals_expired"] += 1

    for charge in Charge.objects.filter(status=Charge.Status.DUE).select_related("engagement__request__client"):
        req = charge.engagement.request
        if charge.due_at and charge.due_at < now and charge.kind == Charge.Kind.DEPOSIT and not online.in_flight(charge, now):
            with transaction.atomic():
                charge.status = Charge.Status.EXPIRED
                charge.save(update_fields=["status"])
                Engagement.objects.filter(pk=charge.engagement_id).update(status=E.EXPIRED)
                ProjectRequest.objects.filter(pk=req.pk).update(status=R.EXPIRED)
                charge.engagement.charges.filter(status=Charge.Status.SCHEDULED).update(status=Charge.Status.VOID)
            notify_client("deposit_expired", req.client, _path(req), title=req.title)
            notify_studio_event("studio_deposit_expired", _studio_path(req), ref=req.reference, title=req.title)
            counts["deposits_expired"] += 1
            continue
        if charge.due_from:
            elapsed = (now - charge.due_from).days
            due_reminders = sum(1 for d in Charge.REMINDER_DAYS if elapsed >= d)
            if due_reminders > charge.reminders_sent:
                Charge.objects.filter(pk=charge.pk).update(reminders_sent=due_reminders)
                notify_client("payment_reminder", req.client, _path(req, "payments"), label=charge.label, title=req.title,
                              amount=money(charge.amount, charge.currency), due=charge.due_at.date().isoformat())
                counts["reminders"] += 1

    for eng in Engagement.objects.filter(status=E.LIVE, maintenance_ends_at__lt=now).select_related("request__client"):
        Engagement.objects.filter(pk=eng.pk).update(status=E.CLOSED, closed_at=now)
        notify_client("project_closed", eng.client, _path(eng.request), title=eng.title)
        counts["closed"] += 1

    # Unanswered for a day: a nudge to the studio (once per request).
    for req in ProjectRequest.objects.filter(status=R.SUBMITTED, review_reminded_at__isnull=True,
                                             created_at__lt=now - timedelta(hours=24)).select_related("client"):
        ProjectRequest.objects.filter(pk=req.pk).update(review_reminded_at=now)
        notify_studio_event("studio_review_due", _studio_path(req), ref=req.reference, title=req.title,
                            client=req.client.full_name, hours=int((now - req.created_at).total_seconds() // 3600))
        counts["review_reminders"] += 1

    from .queue import advance

    counts["queue_released"] = advance()

    if accepting():
        for entry in WaitlistEntry.objects.filter(notified_at__isnull=True):
            notify_address("waitlist_open", entry.email, entry.full_name, entry.language, "/start")
            WaitlistEntry.objects.filter(pk=entry.pk).update(notified_at=now)
            counts["waitlist"] += 1
    return counts
