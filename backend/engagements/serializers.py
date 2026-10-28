from django.conf import settings
from django.utils import timezone
from rest_framework import serializers

from common.i18n import pick, request_lang
from content.models import CarePlan, PricingChoice, Service

from .models import Attachment, ProjectRequest

ALLOWED_FEATURES = {
    "accounts", "payments", "admin", "i18n", "realtime", "maps", "notifications",
    "booking", "ecommerce", "analytics", "api", "mobile_app", "automation", "seo",
    # Per service (the request form offers each service its own list).
    "roles", "files", "search", "subscriptions", "multivendor", "contact_form", "blog", "gallery",
    "newsletter", "whatsapp", "offline", "camera", "sync", "reports", "printing", "barcode",
    "backup", "licensing", "import", "dashboard",
}
# A brief is small: a few dozen answers, each a short choice, a list of
# choices or a paragraph.
BRIEF_KEYS = 40
BRIEF_TEXT = 2000
BRIEF_LIST = 30
BRIEF_ITEM = 120


class AttachmentSerializer(serializers.ModelSerializer):
    uploaded_by_developer = serializers.SerializerMethodField()
    url = serializers.SerializerMethodField()

    class Meta:
        model = Attachment
        fields = ("id", "original_name", "size", "is_voice", "duration", "created_at", "uploaded_by_developer", "url")

    def get_uploaded_by_developer(self, obj) -> bool:
        return obj.uploaded_by.is_developer

    def get_url(self, obj) -> str:
        return f"/api/files/attachments/{obj.id}/"


class ClientSummarySerializer(serializers.Serializer):
    id = serializers.IntegerField()
    full_name = serializers.CharField()
    email = serializers.EmailField()
    company = serializers.CharField()
    phone = serializers.CharField()
    whatsapp = serializers.CharField()
    instagram = serializers.CharField()
    messenger = serializers.CharField()
    country = serializers.CharField()
    # From onboarding: where they'd rather talk, and how they found the studio.
    contact_channel = serializers.CharField()
    contact_channel_label = serializers.CharField(source="get_contact_channel_display")
    contact_handle = serializers.CharField()
    heard_from_label = serializers.CharField(source="get_heard_from_display")
    heard_from_detail = serializers.CharField()


class ProjectRequestSerializer(serializers.ModelSerializer):
    service = serializers.SlugRelatedField(
        slug_field="slug", queryset=Service.objects.filter(active=True), required=False, allow_null=True,
    )
    service_title = serializers.SerializerMethodField()
    status_label = serializers.CharField(source="get_status_display", read_only=True)
    plan = serializers.SlugRelatedField(
        slug_field="code", queryset=CarePlan.objects.filter(active=True), required=False, allow_null=True,
    )
    attachments = serializers.SerializerMethodField()
    allowed_moves = serializers.SerializerMethodField()
    engagement_status = serializers.SerializerMethodField()
    queue = serializers.SerializerMethodField()

    class Meta:
        model = ProjectRequest
        fields = (
            "reference", "service", "service_title", "title", "objectives", "requirements", "features", "brief",
            "budget_min", "budget_max", "budget_currency", "deadline", "deadline_flexible",
            "reference_links", "language", "plan", "options", "estimate_low", "estimate_high", "estimate_currency",
            "wants_nda", "status", "status_label", "status_note", "engagement_status", "attachments", "allowed_moves", "queue",
            "created_at", "updated_at",
        )
        read_only_fields = ("reference", "status", "status_note", "estimate_low", "estimate_high", "estimate_currency",
                            "created_at", "updated_at")
        # A draft may be half-filled; submitting checks the required parts.
        extra_kwargs = {"title": {"required": False, "allow_blank": True},
                        "objectives": {"required": False, "allow_blank": True}}

    def get_attachments(self, obj):
        # The files the client shared: update media and chat files live with those.
        files = [a for a in obj.attachments.all() if not a.updates.all() and not hasattr(a, "message")]
        return AttachmentSerializer(files, many=True, context=self.context).data

    def get_queue(self, obj) -> dict | None:
        """Waiting in the queue: the position and estimated start (None otherwise)."""
        if not obj.queued_at or obj.queue_left_at or obj.status == ProjectRequest.Status.DRAFT:
            return None
        from .queue import spot

        where = spot(obj)
        if where.position is None:
            return None
        return {"position": where.position, "start": where.start, "active": where.active, "capacity": where.capacity}

    def get_engagement_status(self, obj):
        eng = getattr(obj, "engagement", None)
        return eng.status if eng else None

    def get_service_title(self, obj):
        return pick(obj.service, "title", request_lang(self.context.get("request"))) if obj.service else None

    def get_allowed_moves(self, obj) -> list[str]:
        from .services import allowed_moves

        request = self.context.get("request")
        return sorted(allowed_moves(request.user, obj)) if request else []

    def to_representation(self, instance):
        data = super().to_representation(instance)
        request = self.context.get("request")
        if request and request.user.is_developer:
            data["client"] = ClientSummarySerializer(instance.client).data
        return data

    def validate_features(self, value):
        if not isinstance(value, list) or any(f not in ALLOWED_FEATURES for f in value):
            raise serializers.ValidationError("Unknown feature.")
        return sorted(set(value))

    def validate_brief(self, value):
        if not isinstance(value, dict) or len(value) > BRIEF_KEYS:
            raise serializers.ValidationError("Unexpected answers.")
        clean = {}
        for key, answer in value.items():
            if not isinstance(key, str) or not key or len(key) > 40:
                raise serializers.ValidationError("Unexpected answers.")
            if isinstance(answer, str):
                if len(answer) > BRIEF_TEXT:
                    raise serializers.ValidationError(f"Up to {BRIEF_TEXT} characters per answer.")
                if answer.strip():
                    clean[key] = answer.strip()
            elif isinstance(answer, list):
                if len(answer) > BRIEF_LIST or any(not isinstance(a, str) or len(a) > BRIEF_ITEM for a in answer):
                    raise serializers.ValidationError("Unexpected answers.")
                if answer:
                    clean[key] = list(dict.fromkeys(answer))
            elif answer is not None:
                raise serializers.ValidationError("Unexpected answers.")
        return clean

    def validate_language(self, value):
        return value if value in settings.ENABLED_LANGUAGES else "en"

    def validate_deadline(self, value):
        if value and value < timezone.localdate():
            raise serializers.ValidationError("The deadline can't be in the past.")
        return value

    def validate_reference_links(self, value):
        links = [line.strip() for line in value.splitlines() if line.strip()]
        if len(links) > 15:
            raise serializers.ValidationError("Up to 15 links, please.")
        url = serializers.URLField()
        for link in links:
            url.run_validation(link)
        return "\n".join(links)

    def validate(self, attrs):
        lo, hi = attrs.get("budget_min"), attrs.get("budget_max")
        if lo and hi and lo > hi:
            raise serializers.ValidationError({"budget_max": "The maximum must be at least the minimum."})
        return attrs


class TransitionSerializer(serializers.Serializer):
    to = serializers.ChoiceField(choices=ProjectRequest.Status.choices)
    note = serializers.CharField(required=False, allow_blank=True, max_length=2000, default="")


class ProjectRequestDetailSerializer(ProjectRequestSerializer):
    """The request plus its whole lifecycle: proposals, contract, project, unread messages."""

    proposals = serializers.SerializerMethodField()
    contract = serializers.SerializerMethodField()
    engagement = serializers.SerializerMethodField()
    unread = serializers.SerializerMethodField()
    choices = serializers.SerializerMethodField()

    class Meta(ProjectRequestSerializer.Meta):
        fields = ProjectRequestSerializer.Meta.fields + ("proposals", "contract", "engagement", "unread", "choices")

    def get_choices(self, obj) -> list[dict]:
        """The calculator options picked, labelled in the reader's language."""
        picks = obj.options if isinstance(obj.options, dict) else {}
        if not picks:
            return []
        lang = request_lang(self.context.get("request"))
        rows = (PricingChoice.objects.select_related("factor")
                .filter(factor__key__in=picks.keys()).order_by("factor__order", "order"))
        return [{"factor": pick(c.factor, "label", lang), "choice": pick(c, "label", lang)}
                for c in rows if picks.get(c.factor.key) == c.key]

    def get_proposals(self, obj):
        from .lifecycle_serializers import ProposalSerializer

        return ProposalSerializer(obj.proposals.all(), many=True, context=self.context).data

    def get_contract(self, obj):
        from .lifecycle_serializers import ContractSerializer

        contract = obj.contracts.exclude(status="void").order_by("-created_at").first()
        return ContractSerializer(contract).data if contract else None

    def get_engagement(self, obj):
        from .lifecycle_serializers import EngagementSerializer

        eng = getattr(obj, "engagement", None)
        return EngagementSerializer(eng, context=self.context).data if eng else None

    def get_unread(self, obj) -> int:
        user = self.context["request"].user
        qs = obj.messages.filter(read_at__isnull=True)
        return qs.filter(sender=obj.client).count() if user.is_developer else qs.exclude(sender=user).count()
