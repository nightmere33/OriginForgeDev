from django.conf import settings
from rest_framework import serializers

from common.i18n import TranslatedSerializer, lines, pick, request_lang

from .models import (
    FAQ, CarePlan, CaseStudy, CaseStudyMedia, Credential, PricingChoice, PricingFactor, Service, ServicePrice,
    SiteSettings, Tech, Testimonial,
)


def media_url(request, field) -> str | None:
    if not field:
        return None
    url = field.url
    origin = settings.PUBLIC_MEDIA_ORIGIN
    if origin:
        return f"{origin}{url}"
    return request.build_absolute_uri(url) if request is not None else url


class MediaUrlField(serializers.Field):
    def __init__(self, **kwargs):
        kwargs["read_only"] = True
        super().__init__(**kwargs)

    def get_attribute(self, instance):
        return getattr(instance, self.source or self.field_name)

    def to_representation(self, value):
        return media_url(self.context.get("request"), value)


class SiteSettingsSerializer(serializers.ModelSerializer):
    portrait = MediaUrlField()
    cv_file = MediaUrlField()
    showreel = MediaUrlField()
    showreel_av1 = MediaUrlField()
    showreel_poster = MediaUrlField()

    class Meta:
        model = SiteSettings
        # Payment instructions are deliberately absent.
        fields = (
            "is_available", "available_from", "email", "phone", "whatsapp", "github_url", "linkedin_url", "x_url",
            "instagram_url", "upwork_url", "discord_username", "portrait", "cv_file", "showreel", "showreel_av1", "showreel_poster",
            "showreel_width", "showreel_height", "years_experience",
            "projects_shipped", "reply_hours",
        )

    def to_representation(self, instance):
        from engagements.capacity import status

        data = super().to_representation(instance)
        # `is_available` is the effective answer: the switch and the project cap.
        cap = status(instance)
        data["is_available"], data["at_capacity"] = cap["accepting"], cap["full"] and not cap["paused"]
        lang = request_lang(self.context.get("request"))
        for field in ("availability", "location", "about"):
            data[field] = pick(instance, field, lang)
        data["about"] = lines(data["about"])
        return data


class ServicePriceSerializer(serializers.ModelSerializer):
    class Meta:
        model = ServicePrice
        fields = ("currency", "amount", "kind")


class ServiceSerializer(TranslatedSerializer):
    translated = ("title", "summary", "description", "timeline")
    prices = ServicePriceSerializer(many=True, read_only=True)

    class Meta:
        model = Service
        fields = ("slug", "icon", "prices")

    def to_representation(self, instance):
        data = super().to_representation(instance)
        data["deliverables"] = lines(pick(instance, "deliverables", request_lang(self.context.get("request"))))
        return data


class CaseStudyMediaSerializer(TranslatedSerializer):
    translated = ("caption",)
    file = MediaUrlField()
    file_webm = MediaUrlField()
    file_av1 = MediaUrlField()
    poster = MediaUrlField()

    class Meta:
        model = CaseStudyMedia
        fields = ("id", "kind", "file", "file_webm", "file_av1", "poster", "width", "height")


def parse_metrics(text: str) -> list[dict]:
    metrics = []
    for line in lines(text):
        value, _, label = line.partition("|")
        metrics.append({"value": value.strip(), "label": label.strip()})
    return metrics


class CaseStudyListSerializer(TranslatedSerializer):
    translated = ("tagline", "summary")
    cover_image = MediaUrlField()
    cover_video = MediaUrlField()
    cover_video_webm = MediaUrlField()
    cover_video_av1 = MediaUrlField()
    logo = MediaUrlField()
    logo_mark = MediaUrlField()

    class Meta:
        model = CaseStudy
        fields = (
            "slug", "title", "client_name", "year", "category", "accent", "featured",
            "cover_image", "cover_video", "cover_video_webm", "cover_video_av1", "cover_width", "cover_height",
            "logo", "logo_mark",
        )

    def to_representation(self, instance):
        data = super().to_representation(instance)
        data["stack"] = [s.strip() for s in instance.stack.split(",") if s.strip()]
        return data


class CaseStudyDetailSerializer(CaseStudyListSerializer):
    translated = ("tagline", "summary", "role", "challenge", "approach", "outcome")
    film = MediaUrlField()
    film_av1 = MediaUrlField()
    film_poster = MediaUrlField()

    class Meta(CaseStudyListSerializer.Meta):
        fields = CaseStudyListSerializer.Meta.fields + (
            "live_url", "repo_url", "store_url", "updated_at",
            "film", "film_av1", "film_poster", "film_width", "film_height", "film_duration",
        )

    def to_representation(self, instance):
        data = super().to_representation(instance)
        lang = request_lang(self.context.get("request"))
        data["metrics"] = parse_metrics(pick(instance, "metrics", lang))
        gallery = [m for m in instance.media.all() if m.in_gallery]
        data["media"] = CaseStudyMediaSerializer(gallery, many=True, context=self.context).data
        return data


class GalaxyItemSerializer(serializers.ModelSerializer):
    """One flying card in the hero: a clip plus where clicking it leads."""

    file = MediaUrlField()
    file_webm = MediaUrlField()
    file_av1 = MediaUrlField()
    poster = MediaUrlField()
    slug = serializers.CharField(source="case_study.slug")
    title = serializers.CharField(source="case_study.title")
    accent = serializers.CharField(source="case_study.accent")

    class Meta:
        model = CaseStudyMedia
        fields = ("id", "slug", "title", "accent", "kind", "file", "file_webm", "file_av1", "poster", "width", "height")

    def to_representation(self, instance):
        data = super().to_representation(instance)
        # The galaxy textures every card from `poster`: the small still when there
        # is one, else the video poster, and a photo is its own poster.
        if instance.thumb:
            data["poster"] = media_url(self.context.get("request"), instance.thumb)
        elif instance.kind == CaseStudyMedia.Kind.IMAGE and not data.get("poster"):
            data["poster"] = data["file"]
        return data


class TechSerializer(serializers.ModelSerializer):
    class Meta:
        model = Tech
        fields = ("name", "category")


class CredentialSerializer(serializers.ModelSerializer):
    class Meta:
        model = Credential
        fields = ("title", "issuer", "issued_on", "credential_id", "url")


class TestimonialSerializer(TranslatedSerializer):
    translated = ("role", "quote")
    case_study = serializers.SlugRelatedField(slug_field="slug", read_only=True)

    class Meta:
        model = Testimonial
        fields = ("id", "author", "case_study")


class FAQSerializer(TranslatedSerializer):
    translated = ("question", "answer")

    class Meta:
        model = FAQ
        fields = ("id",)


class CarePlanSerializer(TranslatedSerializer):
    translated = ("name", "tagline")

    class Meta:
        model = CarePlan
        fields = ("code", "highlighted", "surcharge_percent", "maintenance_days", "reply_hours", "revision_rounds",
                  "small_updates", "advice", "monthly_call", "monitoring")


class PricingChoiceSerializer(TranslatedSerializer):
    translated = ("label",)

    class Meta:
        model = PricingChoice
        fields = ("key", "is_default", "multiplier", "addon_dzd", "addon_eur", "addon_usd")


class PricingFactorSerializer(TranslatedSerializer):
    translated = ("label", "help")
    choices = PricingChoiceSerializer(many=True, read_only=True)

    class Meta:
        model = PricingFactor
        fields = ("key", "choices")


class EstimateRequestSerializer(serializers.Serializer):
    service = serializers.SlugField(required=False, allow_blank=True)
    currency = serializers.ChoiceField(choices=["DZD", "EUR", "USD"], default="DZD")
    plan = serializers.SlugField(required=False, allow_blank=True)
    choices = serializers.DictField(child=serializers.SlugField(), required=False, default=dict)
