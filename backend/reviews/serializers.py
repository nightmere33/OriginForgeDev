from rest_framework import serializers

from content.serializers import media_url

from .models import Review, ReviewInvite


def project_of(review: Review, request=None) -> dict | None:
    """The published case study a review is about (logo, page), if there is one."""
    study = review.case_study
    if study is None and review.engagement_id:
        study = getattr(review.engagement, "case_study", None)
    if study is None or not study.published:
        return None
    return {"slug": study.slug, "title": study.title, "accent": study.accent,
            "logo": media_url(request, study.logo), "mark": media_url(request, study.logo_mark)}


class PublicReviewSerializer(serializers.ModelSerializer):
    """What the website shows: no ids of people, no private notes."""

    project = serializers.SerializerMethodField()

    class Meta:
        model = Review
        fields = ("id", "rating", "body", "display_name", "display_role", "project_label", "reply", "language", "published_at",
                  "featured", "project")

    def get_project(self, obj) -> dict | None:
        return project_of(obj, self.context.get("request"))


class MyReviewSerializer(serializers.ModelSerializer):
    reference = serializers.SerializerMethodField()

    class Meta:
        model = Review
        fields = (
            "id", "engagement", "reference", "rating", "body", "display_name", "display_role", "project_label",
            "status", "reply", "rejection_reason", "created_at", "published_at",
        )
        read_only_fields = ("engagement", "project_label", "status", "reply", "rejection_reason", "created_at", "published_at")

    def get_reference(self, obj) -> str:
        return obj.engagement.request.reference if obj.engagement_id else ""


class StudioReviewSerializer(MyReviewSerializer):
    client = serializers.CharField(source="author.full_name", default="", read_only=True)

    class Meta(MyReviewSerializer.Meta):
        fields = MyReviewSerializer.Meta.fields + ("client", "featured", "moderated_at")


class WriteReviewSerializer(serializers.Serializer):
    rating = serializers.IntegerField(min_value=1, max_value=5)
    body = serializers.CharField(min_length=20, max_length=1500)
    display_name = serializers.CharField(max_length=80)
    display_role = serializers.CharField(max_length=120, required=False, allow_blank=True, default="")
    # The client agrees, explicitly, that these words appear on the website.
    consent = serializers.BooleanField()

    def validate_consent(self, value):
        if not value:
            raise serializers.ValidationError("Tick the box to allow the review to be published.")
        return value


class ModerateSerializer(serializers.Serializer):
    decision = serializers.ChoiceField(choices=("approve", "reject", "unpublish"))
    reply = serializers.CharField(required=False, allow_blank=True, max_length=1500, default="")
    reason = serializers.CharField(required=False, allow_blank=True, max_length=240, default="")
    featured = serializers.BooleanField(required=False)


class InviteSerializer(serializers.ModelSerializer):
    project = serializers.CharField(source="case_study.title", read_only=True)
    slug = serializers.CharField(source="case_study.slug", read_only=True)
    state = serializers.SerializerMethodField()

    class Meta:
        model = ReviewInvite
        fields = ("id", "email", "full_name", "language", "project", "slug", "state", "created_at", "expires_at", "used_at")

    def get_state(self, obj) -> str:
        from django.utils import timezone

        return "used" if obj.used_at else "expired" if obj.expires_at < timezone.now() else "sent"


class NewInviteSerializer(serializers.Serializer):
    # An account picked in the studio, or an address typed for someone without one yet.
    user = serializers.IntegerField(required=False)
    email = serializers.EmailField(required=False)
    full_name = serializers.CharField(max_length=150, required=False, allow_blank=True, default="")
    case_study = serializers.SlugField()
    language = serializers.ChoiceField(choices=("en", "fr"), default="en")
