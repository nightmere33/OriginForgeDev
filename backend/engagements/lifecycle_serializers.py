from django.utils import timezone
from rest_framework import serializers

from accounts.serializers import avatar_url
from billing.models import Charge, Invoice, Payment, PaymentProof
from content.models import CarePlan
from fx import service as fx

from .models import Contract, Engagement, Message, Milestone, ProgressUpdate, Proposal, Revision, Task
from .serializers import AttachmentSerializer


def _lines(text: str) -> list[str]:
    return [line.strip() for line in (text or "").splitlines() if line.strip()]


class ProposalSerializer(serializers.ModelSerializer):
    from_client = serializers.SerializerMethodField()
    deliverables = serializers.SerializerMethodField()
    exclusions = serializers.SerializerMethodField()
    can_respond = serializers.SerializerMethodField()
    can_counter = serializers.SerializerMethodField()

    class Meta:
        model = Proposal
        fields = (
            "id", "version", "kind", "status", "from_client", "title", "scope", "deliverables", "exclusions", "note",
            "price", "currency", "plan_name", "maintenance_days", "revision_rounds", "reply_hours", "deposit_percent",
            "schedule", "timeline_days", "milestones", "nda", "allow_cash", "negotiable", "deposit_days", "expires_at",
            "responded_at", "created_at", "can_respond", "can_counter",
        )

    def get_from_client(self, obj) -> bool:
        return obj.kind == Proposal.Kind.COUNTER

    def get_deliverables(self, obj):
        return _lines(obj.deliverables)

    def get_exclusions(self, obj):
        return _lines(obj.exclusions)

    def get_can_respond(self, obj) -> bool:
        user = self.context["request"].user
        if obj.status != Proposal.Status.SENT:
            return False
        return user.is_developer if obj.kind == Proposal.Kind.COUNTER else obj.request.client_id == user.id

    def get_can_counter(self, obj) -> bool:
        return (self.get_can_respond(obj) and obj.kind == Proposal.Kind.OFFER and obj.negotiable
                and obj.request.proposals.count() < Proposal.MAX_VERSIONS)


class ProposalCreateSerializer(serializers.Serializer):
    title = serializers.CharField(max_length=160, required=False, allow_blank=True)
    scope = serializers.CharField()
    deliverables = serializers.CharField(required=False, allow_blank=True, default="")
    exclusions = serializers.CharField(required=False, allow_blank=True, default="")
    note = serializers.CharField(required=False, allow_blank=True, default="")
    price = serializers.IntegerField(min_value=1)
    currency = serializers.ChoiceField(choices=["DZD", "EUR", "USD"])
    plan = serializers.SlugRelatedField(slug_field="code", queryset=CarePlan.objects.filter(active=True))
    timeline_days = serializers.IntegerField(min_value=1, max_value=730)
    schedule = serializers.ListField(child=serializers.DictField(), required=False)
    milestones = serializers.ListField(child=serializers.DictField(), required=False)
    nda = serializers.BooleanField(required=False)
    allow_cash = serializers.BooleanField(required=False, default=False)
    # Left out: product films are a fixed price, everything else is open to a counter-offer.
    negotiable = serializers.BooleanField(required=False, allow_null=True, default=None)
    # Days to pay the deposit after signing; 0 = asked later (its turn in the queue).
    deposit_days = serializers.IntegerField(min_value=0, max_value=90, required=False, default=5)

    def validate_milestones(self, value):
        for m in value:
            if not str(m.get("title", "")).strip() or int(m.get("days", 0)) < 1:
                raise serializers.ValidationError("Each milestone needs a title and a number of days.")
        return [{"title": str(m["title"]).strip()[:160], "days": int(m["days"])} for m in value]

    def validate_schedule(self, value):
        try:
            return [{"label": str(x["label"])[:80], "percent": int(x["percent"])} for x in value]
        except (KeyError, ValueError, TypeError):
            raise serializers.ValidationError("Each payment needs a label and a percent.")


class RespondSerializer(serializers.Serializer):
    action = serializers.ChoiceField(choices=["accept", "decline", "counter"])
    price = serializers.IntegerField(required=False, min_value=1)
    note = serializers.CharField(required=False, allow_blank=True, default="", max_length=2000)


class ContractSerializer(serializers.ModelSerializer):
    class Meta:
        model = Contract
        fields = ("id", "status", "language", "body", "sha256", "signed_name", "signed_at", "created_at")


class SignSerializer(serializers.Serializer):
    signed_name = serializers.CharField(max_length=150)
    agree = serializers.BooleanField()


class ProofSerializer(serializers.ModelSerializer):
    receipt_url = serializers.SerializerMethodField()

    class Meta:
        model = PaymentProof
        fields = ("id", "method", "status", "payer_name", "transfer_reference", "tx_hash", "crypto_amount", "crypto_rate",
                  "explorer_url", "note", "review_note", "created_at", "receipt_url", "receipt_name")

    def get_receipt_url(self, obj):
        return f"/api/files/receipts/{obj.id}/" if obj.receipt else None


class OnlinePaymentSerializer(serializers.ModelSerializer):
    class Meta:
        model = Payment
        fields = ("id", "provider", "status", "provider_amount", "provider_currency", "detail", "created_at", "paid_at")


class InvoiceSerializer(serializers.ModelSerializer):
    url = serializers.SerializerMethodField()
    reference = serializers.CharField(source="charge.engagement.request.reference", read_only=True)

    class Meta:
        model = Invoice
        fields = ("id", "number", "issued_at", "label", "amount", "currency", "method", "emailed_at", "reference", "url")

    def get_url(self, obj) -> str:
        return f"/api/invoices/{obj.id}/pdf/"


class ChargeSerializer(serializers.ModelSerializer):
    proofs = ProofSerializer(many=True, read_only=True)
    overdue = serializers.SerializerMethodField()
    usdt_amount = serializers.SerializerMethodField()
    online = serializers.SerializerMethodField()
    payments = serializers.SerializerMethodField()
    paid_by = serializers.SerializerMethodField()
    can_pay_early = serializers.SerializerMethodField()
    invoice = serializers.SerializerMethodField()

    class Meta:
        model = Charge
        fields = ("id", "kind", "label", "description", "optional", "extends_days", "percent", "amount", "currency", "status", "due_at",
                  "paid_at", "answered_at", "created_at", "overdue", "usdt_amount", "online", "payments", "paid_by",
                  "can_pay_early", "invoice", "proofs")

    def get_can_pay_early(self, obj) -> bool:
        return obj.can_pay_early()

    def get_invoice(self, obj) -> dict | None:
        invoice = next(iter(obj.invoices.all()), None)
        return InvoiceSerializer(invoice).data if invoice else None

    def get_online(self, obj) -> dict:
        from billing.online import options

        return options(obj)

    def get_payments(self, obj) -> list:
        """Card and PayPal attempts, newest first (the ones that never opened a page left out)."""
        rows = [p for p in obj.payments.all() if p.provider in ("chargily", "paypal") and p.provider_ref]
        return OnlinePaymentSerializer(sorted(rows, key=lambda p: p.created_at, reverse=True)[:5], many=True).data

    def get_paid_by(self, obj) -> str | None:
        paid = next((p for p in obj.payments.all() if p.status == "paid"), None)
        return paid.provider if paid else None

    def get_usdt_amount(self, obj) -> str | None:
        """Live USDT equivalent while it is due; the proof locks the quote in."""
        return str(fx.to_usdt(obj.amount, obj.currency)) if obj.status == Charge.Status.DUE else None

    def get_overdue(self, obj) -> bool:
        return obj.status == Charge.Status.DUE and bool(obj.due_at) and obj.due_at < timezone.now()


class TaskSerializer(serializers.ModelSerializer):
    class Meta:
        model = Task
        fields = ("id", "milestone", "order", "title", "status", "eta", "done_at")
        read_only_fields = ("done_at",)


class MilestoneSerializer(serializers.ModelSerializer):
    class Meta:
        model = Milestone
        fields = ("id", "order", "title", "description", "due_date", "status", "client_note", "approved_at")
        read_only_fields = ("status", "client_note", "approved_at")


class UpdateSerializer(serializers.ModelSerializer):
    attachments = AttachmentSerializer(many=True, read_only=True)

    class Meta:
        model = ProgressUpdate
        fields = ("id", "title", "body", "attachments", "created_at")


class RevisionSerializer(serializers.ModelSerializer):
    milestone = serializers.CharField(source="milestone.title", default=None, read_only=True)

    class Meta:
        model = Revision
        fields = ("id", "number", "milestone", "note", "created_at")


class EngagementSerializer(serializers.ModelSerializer):
    charges = ChargeSerializer(many=True, read_only=True)
    milestones = MilestoneSerializer(many=True, read_only=True)
    tasks = TaskSerializer(many=True, read_only=True)
    updates = UpdateSerializer(many=True, read_only=True)
    revisions = RevisionSerializer(many=True, read_only=True)
    ready_to_go_live = serializers.SerializerMethodField()
    revisions_left = serializers.SerializerMethodField()
    cash_allowed = serializers.SerializerMethodField()
    plan = serializers.SerializerMethodField()

    class Meta:
        model = Engagement
        fields = (
            "id", "title", "status", "price", "currency", "plan_name", "plan", "maintenance_days", "revision_rounds",
            "revisions_used", "revisions_granted", "timeline_days", "nda", "started_at", "deadline", "production_at",
            "maintenance_ends_at", "closed_at", "charges", "milestones", "tasks", "updates", "revisions",
            "ready_to_go_live", "revisions_left", "cash_allowed",
        )

    def get_cash_allowed(self, obj) -> bool:
        return bool(obj.contract.proposal.allow_cash)

    def get_revisions_left(self, obj) -> int:
        return max(obj.revision_rounds - obj.revisions_used, 0)

    def get_plan(self, obj) -> dict:
        """The plan as signed (its terms were copied into the proposal), for the plan card."""
        p = obj.contract.proposal
        return {"code": p.plan.code if p.plan_id else "", "name": p.plan_name, "maintenance_days": p.maintenance_days,
                "revision_rounds": p.revision_rounds, "reply_hours": p.reply_hours}

    def get_ready_to_go_live(self, obj) -> bool:
        return obj.status == Engagement.Status.AWAITING_BALANCE and not any(
            c.status in Charge.OPEN for c in obj.charges.all())


class EngagementActionSerializer(serializers.Serializer):
    action = serializers.ChoiceField(choices=[
        "ready_for_review", "hold", "resume", "go_live", "cancel", "close", "grant_revision", "extend_maintenance",
        "approve", "request_changes", "report_issue",
    ])
    note = serializers.CharField(required=False, allow_blank=True, default="", max_length=2000)
    days = serializers.IntegerField(required=False, default=0, min_value=0, max_value=365)


class ExtraSerializer(serializers.Serializer):
    label = serializers.CharField(max_length=80)
    description = serializers.CharField(required=False, allow_blank=True, default="", max_length=2000)
    amount = serializers.IntegerField(min_value=1, max_value=100_000_000)
    currency = serializers.ChoiceField(choices=["DZD", "EUR", "USD"])
    optional = serializers.BooleanField(required=False, default=False)
    extends_days = serializers.IntegerField(required=False, default=0, min_value=0, max_value=365)


class ChargeCardSerializer(serializers.ModelSerializer):
    """An extra cost or offer as it shows in the chat (its payment happens in Payments)."""

    class Meta:
        model = Charge
        fields = ("id", "kind", "label", "description", "optional", "extends_days", "amount", "currency", "status", "due_at", "paid_at")


class MessageSerializer(serializers.ModelSerializer):
    from_studio = serializers.SerializerMethodField()
    sender_name = serializers.CharField(source="sender.full_name", read_only=True)
    sender_avatar = serializers.SerializerMethodField()
    attachment = AttachmentSerializer(read_only=True)
    reply_to = serializers.SerializerMethodField()
    charge = ChargeCardSerializer(read_only=True)
    update = UpdateSerializer(read_only=True)
    proposal = serializers.SerializerMethodField()
    reactions = serializers.SerializerMethodField()

    class Meta:
        model = Message
        fields = ("id", "kind", "from_studio", "sender_name", "sender_avatar", "body", "data", "attachment", "reply_to", "charge", "update",
                  "proposal", "reactions", "read_at", "created_at")

    def get_proposal(self, obj) -> dict | None:
        """The version a proposal card is about, as it stands now (its status moves on)."""
        p = obj.proposal
        if p is None:
            return None
        return {"id": p.id, "version": p.version, "kind": p.kind, "status": p.status, "price": p.price, "currency": p.currency,
                "plan_name": p.plan_name, "timeline_days": p.timeline_days, "negotiable": p.negotiable, "expires_at": p.expires_at}

    def get_from_studio(self, obj) -> bool:
        return obj.sender.is_developer

    def get_sender_avatar(self, obj) -> str:
        return avatar_url(obj.sender)

    def get_reply_to(self, obj) -> dict | None:
        q = obj.reply_to
        if q is None:
            return None
        kind = "voice" if q.attachment_id and q.attachment.is_voice else "file" if q.attachment_id else q.kind
        return {"id": q.id, "from_studio": q.sender.is_developer, "sender_name": q.sender.full_name,
                "body": q.body[:160], "kind": kind}

    def get_reactions(self, obj) -> list[dict]:
        """[{emoji, count, mine}], in the order they were first given."""
        request = self.context.get("request")
        me = request.user.id if request else None
        out: dict[str, dict] = {}
        for r in sorted(obj.reactions.all(), key=lambda r: r.created_at):
            row = out.setdefault(r.emoji, {"emoji": r.emoji, "count": 0, "mine": False})
            row["count"] += 1
            row["mine"] = row["mine"] or r.user_id == me
        return list(out.values())
