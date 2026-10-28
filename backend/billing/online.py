"""
Paying a due charge online (BUSINESS_RULES.md §3.7, §5): by card through
Chargily for a DZD charge, or through PayPal in USD or EUR. A DZD charge paid
through PayPal is quoted in US dollars at the live street rate, rounded up to
the cent (as USDT is), and that quote is locked into the payment when the
order is made: PayPal must then take exactly that amount.

The provider's signed notice settles a payment; the payer coming back only
moves the page. Coming back, the PayPal popup's approval and the lifecycle
tick also ask the provider directly, and every path ends in `settle`, so a
charge is settled once whichever arrives first.
"""

import logging
from datetime import timedelta
from decimal import ROUND_UP, Decimal, InvalidOperation

from django.conf import settings
from django.core.cache import cache
from django.db import transaction
from django.utils import timezone
from rest_framework.exceptions import PermissionDenied, ValidationError

from audit.service import record
from fx import service as fx
from notifications.events import notify_studio_event
from notifications.service import site_url, user_lang

from . import chargily, paypal
from .models import Charge, Payment

logger = logging.getLogger("originforge.payments")

CHARGILY, PAYPAL = Payment.Provider.CHARGILY, Payment.Provider.PAYPAL
ONLINE = (CHARGILY, PAYPAL)
PENDING = Payment.Status.PENDING
CENT = Decimal("0.01")
# A page opened minutes ago is reused rather than a second one made (a double click, a reload).
REUSE_FOR = timedelta(minutes=20)
# The provider's notice usually lands before the payer is back: give it this long first,
# then ask at most this often while the return page waits.
NOTICE_GRACE = timedelta(seconds=8)
RECHECK = timedelta(seconds=10)
# A page never finished: nothing was taken. PayPal keeps an unapproved order about 3 hours.
GIVE_UP_AFTER = timedelta(hours=6)
# The deposit window does not close on someone who is on the payment page right now.
IN_FLIGHT = timedelta(hours=1)


def quote(charge: Charge, provider: str) -> tuple[Decimal, str] | None:
    """What the provider is asked for, or None when it can't take this charge."""
    if provider == CHARGILY:
        return (Decimal(charge.amount), "DZD") if chargily.configured() and charge.currency == "DZD" else None
    if provider == PAYPAL and paypal.configured():
        if charge.currency in ("USD", "EUR"):
            return Decimal(charge.amount).quantize(CENT), charge.currency
        return fx.convert(charge.amount, charge.currency, "USD").quantize(CENT, rounding=ROUND_UP), "USD"
    return None


def options(charge: Charge) -> dict:
    """The online methods open for a due charge, with what each would take, for the payment panel."""
    if charge.status != Charge.Status.DUE:
        return {}
    out = {}
    card = quote(charge, CHARGILY)
    if card:
        out["chargily"] = {"amount": int(card[0]), "currency": "DZD"}
    pp = quote(charge, PAYPAL)
    if pp:
        out["paypal"] = {"amount": str(pp[0]), "currency": pp[1], "client_id": settings.PAYPAL_CLIENT_ID}
        if pp[1] != charge.currency:
            rates, st = fx.current(), fx.status()
            out["paypal"]["conversion"] = {
                "rate": str(Decimal(rates[pp[1]]).quantize(CENT)), "source": st["source"],
                "updated_at": st["updated_at"].isoformat() if st["updated_at"] else None,
            }
    return out


def page_of(payment: Payment) -> str:
    """Where the payer lands afterwards: the project, which then follows this payment."""
    req = payment.charge.engagement.request
    return site_url(f"/{user_lang(req.client)}/portal/requests/{req.reference}?payment={payment.pk}")


def start(request, charge_id: int, provider: str) -> Payment:
    """Open the provider's page (Chargily) or order (PayPal) for a due charge of the signed-in client."""
    if provider not in ONLINE:
        raise ValidationError({"provider": "Choose card or PayPal."})
    with transaction.atomic():
        charge = Charge.objects.select_for_update().select_related("engagement__request__client").get(pk=charge_id)
        req = charge.engagement.request
        if req.client_id != request.user.id:
            raise PermissionDenied("Only the client pays their project.")
        if charge.status != Charge.Status.DUE:
            raise ValidationError({"status": "This payment is not due."})
        q = quote(charge, provider)
        if q is None:
            raise ValidationError({"provider": "This method isn't available for this payment."})
        recent = (charge.payments.filter(provider=provider, status=PENDING, created_at__gte=timezone.now() - REUSE_FOR)
                  .exclude(checkout_url="").exclude(provider_ref="").first())
        if recent and (recent.provider_amount, recent.provider_currency) == q:
            return recent
        payment = Payment.objects.create(charge=charge, provider=provider, amount=charge.amount, currency=charge.currency,
                                         provider_amount=q[0], provider_currency=q[1])

    # Outside the lock: the provider can take seconds to answer.
    lang = user_lang(req.client)
    description = f"{req.reference} · {charge.label}"
    try:
        if provider == CHARGILY:
            checkout = chargily.create_checkout(
                amount=int(q[0]), success_url=page_of(payment), failure_url=page_of(payment),
                webhook_endpoint=site_url("/webhooks/chargily/"), description=description, locale=lang,
                metadata={"payment": payment.pk, "charge": charge.pk, "reference": req.reference},
            )
            ref, url = str(checkout["id"]), str(checkout.get("checkout_url") or "")
        else:
            order = paypal.create_order(
                payment_id=payment.pk, amount=f"{q[0]:.2f}", currency=q[1], reference=req.reference, description=description,
                return_url=site_url("/api/payments/paypal/return/"), cancel_url=site_url("/api/payments/paypal/cancel/"), locale=lang,
            )
            ref, url = str(order["id"]), paypal.approve_url(order)
    except (chargily.ChargilyError, paypal.PayPalError, KeyError) as exc:
        Payment.objects.filter(pk=payment.pk).update(status=Payment.Status.FAILED, detail=str(exc)[:300])
        raise ValidationError({"provider": "The payment page didn't open. Try again in a moment, or pay another way."})
    if not ref or not url:
        Payment.objects.filter(pk=payment.pk).update(status=Payment.Status.FAILED, detail="No payment page in the answer")
        raise ValidationError({"provider": "The payment page didn't open. Try again in a moment, or pay another way."})
    Payment.objects.filter(pk=payment.pk).update(provider_ref=ref, checkout_url=url)
    payment.provider_ref, payment.checkout_url = ref, url
    record(request, "payment.started", req, charge=charge.label, provider=provider,
           amount=f"{payment.provider_amount} {payment.provider_currency}")
    return payment


def _attention(payment: Payment, note: str):
    req = payment.charge.engagement.request
    logger.warning("Payment %s needs a look: %s", payment.pk, note)
    notify_studio_event("studio_payment_attention", f"/studio/requests/{req.reference}", ref=req.reference, note=note)


def settle(payment_id: int, outcome: str, data: dict | None = None, *, detail: str = "") -> Payment:
    """
    The one way an online payment changes: paid, pending (held by the
    provider), failed, canceled, expired, refunded. Safe to repeat: a paid
    payment only ever moves on to refunded, and a charge is marked paid once.
    """
    from engagements.contract import money
    from engagements.lifecycle import mark_paid

    with transaction.atomic():
        payment = Payment.objects.select_for_update().select_related("charge__engagement__request__client").get(pk=payment_id)
        if data:
            payment.payload = {**payment.payload, "last": data}
        if detail:
            payment.detail = detail[:300]
        done = payment.status in (Payment.Status.PAID, Payment.Status.REFUNDED)
        if outcome == "refunded" and payment.status == Payment.Status.PAID:
            payment.status = Payment.Status.REFUNDED
            payment.save()
            _attention(payment, f"{payment.get_provider_display()} reports a refund or reversal of {payment.provider_amount} {payment.provider_currency}. The charge is still marked paid: check it.")
            return payment
        if done or outcome == "pending":
            payment.save()
            return payment
        if outcome != "paid":
            payment.status = {"failed": Payment.Status.FAILED, "canceled": Payment.Status.CANCELED,
                              "refunded": Payment.Status.REFUNDED}.get(outcome, Payment.Status.EXPIRED)
            payment.save()
            return payment

        charge = Charge.objects.select_for_update().get(pk=payment.charge_id)
        payment.status, payment.paid_at = Payment.Status.PAID, timezone.now()
        payment.save()
        req = charge.engagement.request
        paid = f"{payment.provider_amount} {payment.provider_currency}"
        if charge.status == Charge.Status.DUE:
            mark_paid(None, charge, payment)
            notify_studio_event("studio_paid_online", f"/studio/requests/{req.reference}", ref=req.reference, client=req.client.full_name,
                                label=charge.label, amount=money(charge.amount, charge.currency), method=f"{payment.get_provider_display()} ({paid})")
        else:
            # Paid another way meanwhile, or after the window closed: the money is in, the charge was not due.
            _attention(payment, f"{req.client.full_name} paid {paid} by {payment.get_provider_display()} for \"{charge.label}\", which is {charge.get_status_display().lower()}. Refund it or apply it.")
    return payment


def _amount_ok(payment: Payment, value, currency, *, at_least: bool) -> bool:
    try:
        got = Decimal(str(value)).quantize(CENT)
    except (InvalidOperation, TypeError):
        return False
    if str(currency or "").upper() != payment.provider_currency:
        return False
    return got >= payment.provider_amount if at_least else got == payment.provider_amount


def from_chargily(checkout: dict, outcome: str | None = None) -> Payment | None:
    """A Chargily checkout, from its notice or from asking: settle the payment it belongs to."""
    payment = Payment.objects.filter(provider=CHARGILY, provider_ref=str(checkout.get("id") or "")).first()
    if payment is None:
        logger.error("Chargily checkout %s has no payment here", checkout.get("id"))
        return None
    outcome = outcome or chargily.STATUS.get(str(checkout.get("status") or ""))
    if outcome is None:  # pending, processing
        return payment
    # The payer may add Chargily's fee on top; never less than the charge.
    if outcome == "paid" and not _amount_ok(payment, checkout.get("amount"), checkout.get("currency"), at_least=True):
        settle(payment.pk, "pending", checkout, detail="Chargily reported another amount")
        _attention(payment, f"Chargily reported {checkout.get('amount')} {checkout.get('currency')} for a {payment.provider_amount} DZD payment.")
        return payment
    return settle(payment.pk, outcome, checkout)


def from_paypal(order: dict) -> Payment | None:
    """A PayPal order, as PayPal reports it now: capture it once approved, then settle what it says."""
    payment = Payment.objects.filter(provider=PAYPAL, provider_ref=str(order.get("id") or "")).first()
    if payment is None:
        logger.error("PayPal order %s has no payment here", order.get("id"))
        return None
    if order.get("status") == "APPROVED":
        if payment.status != PENDING:
            return payment  # already settled (or refused): never capture again
        # One capture at a time per payment: the popup, the notice, the return
        # page and the tick can all arrive together, and PayPal counts each try.
        lock = f"paypal-capture:{payment.pk}"
        if not cache.add(lock, 1, 30):
            return payment
        try:
            order = paypal.capture(order["id"], payment.pk)
        except paypal.PayPalError as exc:
            # 409: the same capture is still running at PayPal; it reports soon.
            if exc.status_code == 409:
                return payment
            # Any other 4xx is PayPal's answer, not a hiccup (a refused card, a
            # compliance hold, too many tries): the payment failed, and retrying
            # would only use up the order's attempts.
            if exc.status_code and 400 <= exc.status_code < 500 and exc.status_code not in (401, 429):
                return settle(payment.pk, "failed", exc.payload, detail=f"PayPal refused it: {exc.issue or exc.status_code}")
            raise
        finally:
            cache.delete(lock)
    cap = paypal.first_capture(order)
    status = cap.get("status")
    if order.get("status") == "COMPLETED" and status == "COMPLETED":
        amount = cap.get("amount") or {}
        if not _amount_ok(payment, amount.get("value"), amount.get("currency_code"), at_least=False):
            settle(payment.pk, "pending", order, detail="PayPal captured another amount")
            _attention(payment, f"PayPal captured {amount.get('value')} {amount.get('currency_code')} for a {payment.provider_amount} {payment.provider_currency} order.")
            return payment
        return settle(payment.pk, "paid", order)
    if status == "PENDING":
        # Taken but held by PayPal (a review, or a currency the account doesn't hold yet).
        reason = (cap.get("status_details") or {}).get("reason") or "PENDING"
        return settle(payment.pk, "pending", order, detail=f"PayPal is holding it: {reason}")
    if status in ("DECLINED", "FAILED"):
        return settle(payment.pk, "failed", order, detail=f"PayPal: {status}")
    if order.get("status") == "VOIDED":
        return settle(payment.pk, "canceled", order)
    return payment


def reconcile(payment: Payment, *, force: bool = False) -> Payment:
    """Ask the provider about a payment still pending (its notice is late, or lost)."""
    if payment.provider not in ONLINE or payment.status != PENDING or not payment.provider_ref:
        return payment
    now = timezone.now()
    if not force and (now - payment.created_at < NOTICE_GRACE or (payment.checked_at and now - payment.checked_at < RECHECK)):
        return payment
    Payment.objects.filter(pk=payment.pk).update(checked_at=now)
    try:
        if payment.provider == CHARGILY:
            from_chargily(chargily.retrieve_checkout(payment.provider_ref))
        else:
            from_paypal(paypal.get_order(payment.provider_ref))
    except (chargily.ChargilyError, paypal.PayPalError) as exc:
        logger.warning("Could not ask %s about payment %s: %s", payment.provider, payment.pk, exc)
    payment.refresh_from_db()
    # Never finished and nothing held: nothing was taken.
    if payment.status == PENDING and not payment.detail and now - payment.created_at > GIVE_UP_AFTER:
        payment = settle(payment.pk, "expired")
    return payment


def sweep(now=None) -> int:
    """From the lifecycle tick: every online payment still open after a few minutes is asked about."""
    now = now or timezone.now()
    rows = Payment.objects.filter(provider__in=ONLINE, status=PENDING, created_at__lt=now - timedelta(minutes=5)).exclude(provider_ref="")
    count = 0
    for payment in rows.order_by("created_at")[:50]:
        reconcile(payment, force=True)
        count += 1
    return count


def in_flight(charge: Charge, now=None) -> bool:
    now = now or timezone.now()
    return charge.payments.filter(provider__in=ONLINE, status=PENDING, created_at__gte=now - IN_FLIGHT).exists()
