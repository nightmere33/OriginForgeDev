from rest_framework import serializers

from .models import Review


class PublicReviewSerializer(serializers.ModelSerializer):
    """What the website shows: no ids of people, no private notes."""

    class Meta:
        model = Review
        fields = ("id", "rating", "body", "display_name", "display_role", "project_label", "reply", "language", "published_at", "featured")


class MyReviewSerializer(serializers.ModelSerializer):
    reference = serializers.CharField(source="engagement.request.reference", read_only=True)

    class Meta:
        model = Review
        fields = (
            "id", "engagement", "reference", "rating", "body", "display_name", "display_role", "project_label",
            "status", "reply", "rejection_reason", "created_at", "published_at",
        )
        read_only_fields = ("engagement", "project_label", "status", "reply", "rejection_reason", "created_at", "published_at")


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
