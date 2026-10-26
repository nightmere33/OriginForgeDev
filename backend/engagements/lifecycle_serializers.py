from django.utils import timezone
from rest_framework import serializers

from billing.models import Charge, PaymentProof
from content.models import CarePlan
from fx import service as fx

from .models import Contract, Engagement, Message, Milestone, ProgressUpdate, Proposal, Task
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
            "schedule", "timeline_days", "milestones", "nda", "expires_at", "responded_at", "created_at",
            "can_respond", "can_counter",
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
        return (self.get_can_respond(obj) and obj.kind == Proposal.Kind.OFFER
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


class ChargeSerializer(serializers.ModelSerializer):
    proofs = ProofSerializer(many=True, read_only=True)
    overdue = serializers.SerializerMethodField()
    usdt_amount = serializers.SerializerMethodField()

    class Meta:
        model = Charge
        fields = ("id", "kind", "label", "percent", "amount", "currency", "status", "due_at", "paid_at", "overdue",
                  "usdt_amount", "proofs")

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


class EngagementSerializer(serializers.ModelSerializer):
    charges = ChargeSerializer(many=True, read_only=True)
    milestones = MilestoneSerializer(many=True, read_only=True)
    tasks = TaskSerializer(many=True, read_only=True)
    updates = UpdateSerializer(many=True, read_only=True)
    ready_to_go_live = serializers.SerializerMethodField()
    revisions_left = serializers.SerializerMethodField()

    class Meta:
        model = Engagement
        fields = (
            "id", "title", "status", "price", "currency", "plan_name", "maintenance_days", "revision_rounds",
            "revisions_used", "timeline_days", "nda", "started_at", "deadline", "production_at",
            "maintenance_ends_at", "closed_at", "charges", "milestones", "tasks", "updates", "ready_to_go_live",
            "revisions_left",
        )

    def get_revisions_left(self, obj) -> int:
        return max(obj.revision_rounds - obj.revisions_used, 0)

    def get_ready_to_go_live(self, obj) -> bool:
        return obj.status == Engagement.Status.AWAITING_BALANCE and not obj.charges.exclude(
            status__in=[Charge.Status.PAID, Charge.Status.VOID]).exists()


class EngagementActionSerializer(serializers.Serializer):
    action = serializers.ChoiceField(choices=["ready_for_review", "hold", "resume", "go_live", "cancel", "approve", "request_changes"])
    note = serializers.CharField(required=False, allow_blank=True, default="", max_length=2000)


class MessageSerializer(serializers.ModelSerializer):
    from_studio = serializers.SerializerMethodField()
    sender_name = serializers.CharField(source="sender.full_name", read_only=True)
    attachment = AttachmentSerializer(read_only=True)

    class Meta:
        model = Message
        fields = ("id", "from_studio", "sender_name", "body", "attachment", "read_at", "created_at")

    def get_from_studio(self, obj) -> bool:
        return obj.sender.is_developer
