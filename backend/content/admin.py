from django.contrib import admin

from .models import (
    FAQ, CarePlan, CaseStudy, CaseStudyMedia, Credential, PricingChoice, PricingFactor, Service, ServicePrice,
    SiteSettings, Tech, Testimonial,
)


def lang_fieldsets(*names):
    """One fieldset per language so EN/FR/AR are edited side by side."""
    return tuple(
        (label, {"fields": tuple(f"{n}_{code}" for n in names), "classes": () if code == "en" else ("collapse",)})
        for code, label in (("en", "English"), ("fr", "Français"), ("ar", "العربية (later)"))
    )


@admin.register(SiteSettings)
class SiteSettingsAdmin(admin.ModelAdmin):
    fieldsets = (
        ("Capacity", {"fields": ("is_available", "available_from"),
                      "description": "Pause new project requests when you're full. Write the note in 'Availability' below."}),
        ("Stats", {"fields": ("years_experience", "projects_shipped", "reply_hours")}),
        ("Contact", {"fields": ("email", "phone", "whatsapp")}),
        ("Social", {"fields": ("github_url", "linkedin_url", "x_url", "instagram_url", "upwork_url", "discord_username")}),
        ("Files", {"fields": ("portrait", "cv_file", "showreel", "showreel_poster", "showreel_width", "showreel_height")}),
        *lang_fieldsets("availability", "location", "about", "cash_note"),
        ("Manual payment instructions (private)", {
            "fields": ("ccp_account", "ccp_key", "ccp_holder", "ccp_address", "baridimob_rip"),
        }),
    )

    def has_add_permission(self, request):
        return not SiteSettings.objects.exists()

    def has_delete_permission(self, request, obj=None):
        return False


class ServicePriceInline(admin.TabularInline):
    model = ServicePrice
    extra = 1
    fields = ("currency", "amount", "kind", "order")


@admin.register(Service)
class ServiceAdmin(admin.ModelAdmin):
    list_display = ("title_en", "slug", "price_summary", "order", "active")
    list_editable = ("order", "active")
    prepopulated_fields = {"slug": ("title_en",)}
    inlines = (ServicePriceInline,)
    fieldsets = (
        (None, {"fields": ("slug", "icon", "order", "active")}),
        *lang_fieldsets("title", "summary", "description", "deliverables", "timeline"),
    )

    @admin.display(description="Prices")
    def price_summary(self, obj):
        return " · ".join(str(p) for p in obj.prices.all()) or "Quoted per project"


class CaseStudyMediaInline(admin.TabularInline):
    model = CaseStudyMedia
    extra = 0
    fields = ("order", "kind", "file", "file_webm", "poster", "width", "height", "caption_en", "caption_fr",
              "in_gallery", "in_galaxy")


@admin.register(CaseStudy)
class CaseStudyAdmin(admin.ModelAdmin):
    list_display = ("title", "category", "year", "published", "featured", "order")
    list_editable = ("published", "featured", "order")
    list_filter = ("category", "published", "featured")
    prepopulated_fields = {"slug": ("title",)}
    inlines = (CaseStudyMediaInline,)
    fieldsets = (
        (None, {"fields": ("slug", "title", "client_name", "year", "category", "accent", "order",
                           "published", "featured", "stack")}),
        ("Links", {"fields": ("live_url", "repo_url", "store_url")}),
        ("Cover", {"fields": ("cover_image", "cover_video", "cover_video_webm")}),
        *lang_fieldsets("tagline", "summary", "role", "challenge", "approach", "outcome", "metrics"),
    )


@admin.register(Tech)
class TechAdmin(admin.ModelAdmin):
    list_display = ("name", "category", "order")
    list_editable = ("category", "order")


@admin.register(Credential)
class CredentialAdmin(admin.ModelAdmin):
    list_display = ("title", "issuer", "issued_on", "order")
    list_editable = ("order",)


@admin.register(Testimonial)
class TestimonialAdmin(admin.ModelAdmin):
    list_display = ("author", "case_study", "approved", "order")
    list_editable = ("approved", "order")
    fieldsets = ((None, {"fields": ("author", "case_study", "approved", "order")}), *lang_fieldsets("role", "quote"))


@admin.register(FAQ)
class FAQAdmin(admin.ModelAdmin):
    list_display = ("question_en", "order")
    list_editable = ("order",)
    fieldsets = ((None, {"fields": ("order",)}), *lang_fieldsets("question", "answer"))


@admin.register(CarePlan)
class CarePlanAdmin(admin.ModelAdmin):
    list_display = ("name_en", "surcharge_percent", "maintenance_days", "reply_hours", "revision_rounds", "order", "active")
    list_editable = ("surcharge_percent", "maintenance_days", "reply_hours", "revision_rounds", "order", "active")
    fieldsets = (
        (None, {"fields": ("code", "order", "active", "highlighted")}),
        ("Rules", {"fields": ("surcharge_percent", "maintenance_days", "reply_hours", "revision_rounds",
                             "small_updates", "advice", "monthly_call", "monitoring")}),
        *lang_fieldsets("name", "tagline"),
    )


class PricingChoiceInline(admin.TabularInline):
    model = PricingChoice
    extra = 0
    fields = ("key", "order", "is_default", "label_en", "label_fr", "multiplier", "addon_dzd", "addon_eur", "addon_usd")


@admin.register(PricingFactor)
class PricingFactorAdmin(admin.ModelAdmin):
    list_display = ("label_en", "key", "order", "active")
    list_editable = ("order", "active")
    filter_horizontal = ("services",)
    inlines = (PricingChoiceInline,)
    fieldsets = ((None, {"fields": ("key", "order", "active", "services")}), *lang_fieldsets("label", "help"))
