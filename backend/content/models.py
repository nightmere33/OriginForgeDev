"""
Everything the public site shows that Younes edits without a deploy.

Translatable text is stored as explicit `<field>_en / _fr / _ar` columns
rather than a translation table: three launch-relevant languages, edited side
by side in one admin form, and a missing French line is visible at a glance.
The API resolves them with `TranslatedSerializer` (English is the fallback).
"""

from django.db import models


class Currency(models.TextChoices):
    DZD = "DZD", "DZD"
    EUR = "EUR", "EUR"
    USD = "USD", "USD"


def tr(field_cls, *args, **kwargs):
    """English is required unless the caller says otherwise; FR/AR may be blank."""
    required = not kwargs.pop("blank", False)
    return (
        field_cls(*args, blank=not required, **kwargs),
        field_cls(*args, blank=True, **kwargs),
        field_cls(*args, blank=True, **kwargs),
    )


class SiteSettings(models.Model):
    # Capacity switch: unticked = new project requests are paused (the request
    # form shows the note below instead; messages and contact stay open).
    is_available = models.BooleanField(
        "starting new projects", default=True,
        help_text="Untick to pause starts (holidays): requests still come in and wait in the queue.",
    )
    usdt_bep20_address = models.CharField(
        "USDT address (BEP20)", max_length=64, blank=True,
        help_text="Your wallet on BNB Smart Chain. Empty = USDT payments hidden.",
    )
    usdt_rate_override = models.DecimalField(
        "street dollar override (DZD)", max_digits=10, decimal_places=2, null=True, blank=True,
        help_text="Leave empty to follow Binance P2P live. Sets USDT and USD; EUR keeps its ratio.",
    )
    max_active_projects = models.PositiveSmallIntegerField(
        default=2, help_text="Projects at once for services that share the studio's limit; beyond it requests queue. 0 = no limit.",
    )
    available_from = models.DateField(null=True, blank=True, help_text="While starts are paused: when you can start again")
    availability_en, availability_fr, availability_ar = tr(models.CharField, max_length=120, blank=True)
    location_en, location_fr, location_ar = tr(models.CharField, max_length=120, blank=True)
    about_en, about_fr, about_ar = tr(models.TextField, blank=True)

    email = models.EmailField(blank=True)
    phone = models.CharField(max_length=40, blank=True)
    whatsapp = models.CharField(max_length=40, blank=True, help_text="International format, e.g. +213…")
    github_url = models.URLField(blank=True)
    linkedin_url = models.URLField(blank=True)
    x_url = models.URLField(blank=True)
    instagram_url = models.URLField(blank=True)
    upwork_url = models.URLField(blank=True)
    discord_username = models.CharField(
        max_length=40, blank=True,
        help_text="Shown with a copy button: Discord has no public profile link for a username",
    )

    portrait = models.ImageField(upload_to="site/", blank=True)
    cv_file = models.FileField(upload_to="site/", blank=True)
    showreel = models.FileField(upload_to="site/", blank=True, help_text="Home showreel, H.264 MP4 with sound")
    showreel_av1 = models.FileField(upload_to="site/", blank=True, help_text="Same clip in AV1 (MP4), served to devices that decode AV1 efficiently; others get the H.264 file")
    showreel_poster = models.ImageField(upload_to="site/", blank=True)
    showreel_width = models.PositiveIntegerField(default=720)
    showreel_height = models.PositiveIntegerField(default=1280)

    years_experience = models.PositiveSmallIntegerField(default=4)
    projects_shipped = models.PositiveSmallIntegerField(default=20)
    reply_hours = models.PositiveSmallIntegerField(default=24, help_text="Shown as 'Replies within N h'")
    review_hours = models.PositiveSmallIntegerField(
        default=48, help_text="The longest a new request waits for a first answer (shown as 'within 24 to 48 h').",
    )

    # Manual payment instructions. Never part of the public API: they are
    # shown to a signed-in client who has something to pay (see billing).
    ccp_account = models.CharField("CCP number", max_length=32, blank=True)
    ccp_key = models.CharField("CCP key", max_length=4, blank=True)
    ccp_holder = models.CharField("account holder", max_length=120, blank=True)
    ccp_address = models.CharField("holder address", max_length=255, blank=True)
    baridimob_rip = models.CharField("RIP (BaridiMob)", max_length=32, blank=True)
    cash_note_en, cash_note_fr, cash_note_ar = tr(models.CharField, max_length=255, blank=True)

    class Meta:
        verbose_name = verbose_name_plural = "site settings"

    def save(self, *args, **kwargs):
        self.pk = 1
        super().save(*args, **kwargs)

    @classmethod
    def load(cls) -> "SiteSettings":
        obj, _ = cls.objects.get_or_create(pk=1)
        return obj

    def __str__(self):
        return "Site settings"


class Service(models.Model):
    slug = models.SlugField(unique=True)
    order = models.PositiveSmallIntegerField(default=0)
    active = models.BooleanField(default=True)
    icon = models.CharField(max_length=40, blank=True, help_text="lucide icon name, e.g. 'globe'")
    title_en, title_fr, title_ar = tr(models.CharField, max_length=120)
    summary_en, summary_fr, summary_ar = tr(models.CharField, max_length=255)
    description_en, description_fr, description_ar = tr(models.TextField, blank=True)
    deliverables_en, deliverables_fr, deliverables_ar = tr(models.TextField, blank=True)
    timeline_en, timeline_fr, timeline_ar = tr(models.CharField, max_length=60, blank=True)
    # Capacity (engagements/queue.py): how many of these run at once, and
    # whether requests ever wait in a queue.
    max_active = models.PositiveSmallIntegerField(
        "projects at once", null=True, blank=True,
        help_text="Empty = shares the studio's limit (Site settings). 0 = no limit.",
    )
    accept_directly = models.BooleanField(
        default=False, help_text="Requests never wait in the queue (e.g. films).",
    )
    typical_days = models.PositiveSmallIntegerField(
        default=21, help_text="A typical project's length, for queue start estimates.",
    )

    class Meta:
        ordering = ["order", "id"]

    def __str__(self):
        return self.title_en


class ServicePrice(models.Model):
    """
    One price line of a service. A service can carry several (typically one
    in DZD; a line in EUR or USD overrides the live conversion for that
    currency), and each says how to read it (from / fixed / per month / per
    hour / from, per minute). No rows means "quoted per project".
    """

    class Kind(models.TextChoices):
        FROM = "from", "From"
        FIXED = "fixed", "Fixed"
        MONTHLY = "monthly", "Per month"
        HOURLY = "hourly", "Per hour"
        # Films: the price of a minute of finished film (the calculator scales it).
        PER_MINUTE = "per_minute", "From, per minute"

    service = models.ForeignKey(Service, on_delete=models.CASCADE, related_name="prices")
    currency = models.CharField(max_length=3, choices=Currency.choices)
    amount = models.PositiveIntegerField(help_text="Whole units: 60000 = 60 000 DZD")
    kind = models.CharField(max_length=10, choices=Kind.choices, default=Kind.FROM)
    order = models.PositiveSmallIntegerField(default=0)

    class Meta:
        ordering = ["order", "id"]
        constraints = [models.UniqueConstraint(fields=["service", "currency", "kind"], name="one_price_per_currency_kind")]

    def __str__(self):
        return f"{self.get_kind_display()} {self.amount} {self.currency}"


class CaseStudy(models.Model):
    class Category(models.TextChoices):
        PLATFORM = "platform", "Platform"
        WEB = "web", "Web"
        MOBILE = "mobile", "Mobile"
        AUTOMATION = "automation", "Automation"
        MOTION = "motion", "Motion & 3D"
        GAME = "game", "Games"
        DESKTOP = "desktop", "Desktop"
        IOT = "iot", "IoT & Embedded"

    slug = models.SlugField(unique=True)
    order = models.PositiveSmallIntegerField(default=0)
    published = models.BooleanField(default=False)
    featured = models.BooleanField(default=False, help_text="Shown in the home page work grid")
    title = models.CharField(max_length=120)
    client_name = models.CharField(max_length=120, blank=True)
    year = models.PositiveSmallIntegerField(null=True, blank=True)
    category = models.CharField(max_length=20, choices=Category.choices, default=Category.WEB)
    accent = models.CharField(max_length=7, blank=True, help_text="Optional hex tint, e.g. #FF6A1A")

    tagline_en, tagline_fr, tagline_ar = tr(models.CharField, max_length=160)
    summary_en, summary_fr, summary_ar = tr(models.TextField)
    role_en, role_fr, role_ar = tr(models.CharField, max_length=160, blank=True)
    challenge_en, challenge_fr, challenge_ar = tr(models.TextField, blank=True)
    approach_en, approach_fr, approach_ar = tr(models.TextField, blank=True)
    outcome_en, outcome_fr, outcome_ar = tr(models.TextField, blank=True)
    # One per line: "15% | service fee automated"
    metrics_en, metrics_fr, metrics_ar = tr(models.TextField, blank=True)
    stack = models.CharField(max_length=300, blank=True, help_text="Comma separated")

    live_url = models.URLField(blank=True)
    repo_url = models.URLField(blank=True)
    store_url = models.URLField(blank=True)

    cover_image = models.ImageField(upload_to="work/covers/", blank=True)
    cover_video = models.FileField(upload_to="work/loops/", blank=True, help_text="Silent loop, H.264 MP4")
    cover_video_webm = models.FileField(upload_to="work/loops/", blank=True, help_text="Optional AV1/VP9 WebM")
    cover_video_av1 = models.FileField(upload_to="work/loops/", blank=True, help_text="Same clip in AV1 (MP4), served to devices that decode AV1 efficiently; others get the H.264 file")
    cover_width = models.PositiveIntegerField(default=540, help_text="Cover loop size: 9:16 films or 16:9 screen captures")
    cover_height = models.PositiveIntegerField(default=960)

    # The full film, with sound, behind "Watch the film".
    film = models.FileField(upload_to="work/films/", blank=True, help_text="Full film with sound, H.264 MP4")
    film_av1 = models.FileField(upload_to="work/films/", blank=True, help_text="Same clip in AV1 (MP4), served to devices that decode AV1 efficiently; others get the H.264 file")
    film_poster = models.ImageField(upload_to="work/films/", blank=True)
    film_width = models.PositiveIntegerField(default=720)
    film_height = models.PositiveIntegerField(default=1280)
    film_duration = models.PositiveIntegerField(default=0, help_text="Seconds")

    logo = models.FileField(upload_to="work/logos/", blank=True, help_text="Wordmark that reads on a dark background (SVG or PNG)")
    logo_mark = models.FileField(upload_to="work/logos/", blank=True, help_text="Square mark (SVG or PNG)")

    # The project this case study was drafted from (content/portfolio.py), if any.
    source_engagement = models.OneToOneField(
        "engagements.Engagement", on_delete=models.SET_NULL, null=True, blank=True, related_name="case_study",
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["order", "-year", "id"]
        verbose_name_plural = "case studies"

    def __str__(self):
        return self.title


class CaseStudyMedia(models.Model):
    class Kind(models.TextChoices):
        IMAGE = "image", "Image"
        VIDEO = "video", "Video loop"

    case_study = models.ForeignKey(CaseStudy, on_delete=models.CASCADE, related_name="media")
    order = models.PositiveSmallIntegerField(default=0)
    kind = models.CharField(max_length=10, choices=Kind.choices, default=Kind.IMAGE)
    file = models.FileField(upload_to="work/media/")
    file_webm = models.FileField(upload_to="work/media/", blank=True)
    file_av1 = models.FileField(upload_to="work/media/", blank=True, help_text="Same clip in AV1 (MP4), served to devices that decode AV1 efficiently; others get the H.264 file")
    poster = models.ImageField(upload_to="work/media/", blank=True, help_text="First frame for videos")
    thumb = models.ImageField(upload_to="work/media/", blank=True, help_text="640px still for the galaxy (made automatically)")
    width = models.PositiveIntegerField(default=1280)
    height = models.PositiveIntegerField(default=720)
    caption_en, caption_fr, caption_ar = tr(models.CharField, max_length=200, blank=True)
    in_gallery = models.BooleanField(default=True)
    in_galaxy = models.BooleanField(default=False, help_text="Fly this clip in the home hero galaxy")

    class Meta:
        ordering = ["order", "id"]
        verbose_name_plural = "case study media"

    def __str__(self):
        return f"{self.case_study} · {self.kind} #{self.order}"


class Tech(models.Model):
    class Category(models.TextChoices):
        LANGUAGE = "language", "Languages"
        WEB = "web", "Web"
        MOBILE = "mobile", "Mobile"
        DATA = "data", "Data & Backend"
        AUTOMATION = "automation", "Automation"
        MOTION = "motion", "Motion & 3D"
        INFRA = "infra", "Infrastructure"
        EMBEDDED = "embedded", "Networks & Embedded"

    name = models.CharField(max_length=60)
    category = models.CharField(max_length=20, choices=Category.choices)
    order = models.PositiveSmallIntegerField(default=0)

    class Meta:
        ordering = ["category", "order", "name"]
        verbose_name_plural = "tech"

    def __str__(self):
        return self.name


class Credential(models.Model):
    """Certificates and trainings shown on the About page and in the CV."""

    title = models.CharField(max_length=160)
    issuer = models.CharField(max_length=120)
    issued_on = models.DateField(null=True, blank=True)
    credential_id = models.CharField(max_length=60, blank=True)
    url = models.URLField(blank=True)
    order = models.PositiveSmallIntegerField(default=0)

    class Meta:
        ordering = ["order", "-issued_on", "id"]

    def __str__(self):
        return f"{self.title} — {self.issuer}"


class Testimonial(models.Model):
    """Real client words only — nothing is shown until it is approved."""

    author = models.CharField(max_length=120)
    role_en, role_fr, role_ar = tr(models.CharField, max_length=160, blank=True)
    quote_en, quote_fr, quote_ar = tr(models.TextField)
    case_study = models.ForeignKey(CaseStudy, on_delete=models.SET_NULL, null=True, blank=True)
    approved = models.BooleanField(default=False)
    order = models.PositiveSmallIntegerField(default=0)

    class Meta:
        ordering = ["order", "id"]

    def __str__(self):
        return self.author


class FAQ(models.Model):
    order = models.PositiveSmallIntegerField(default=0)
    question_en, question_fr, question_ar = tr(models.CharField, max_length=255)
    answer_en, answer_fr, answer_ar = tr(models.TextField)

    class Meta:
        ordering = ["order", "id"]
        verbose_name = "FAQ"
        verbose_name_plural = "FAQs"

    def __str__(self):
        return self.question_en


class CarePlan(models.Model):
    """
    Starter / Pro / Ultimate (docs/BUSINESS_RULES.md §1): what care comes
    after delivery. The surcharge is applied on top of the project price.
    """

    code = models.SlugField(unique=True)
    order = models.PositiveSmallIntegerField(default=0)
    active = models.BooleanField(default=True)
    highlighted = models.BooleanField(default=False, help_text="Shown as the recommended plan")
    name_en, name_fr, name_ar = tr(models.CharField, max_length=60)
    tagline_en, tagline_fr, tagline_ar = tr(models.CharField, max_length=160, blank=True)
    surcharge_percent = models.PositiveSmallIntegerField(default=0)
    maintenance_days = models.PositiveSmallIntegerField(default=14)
    reply_hours = models.PositiveSmallIntegerField(default=48)
    revision_rounds = models.PositiveSmallIntegerField(default=2)
    small_updates = models.PositiveSmallIntegerField(null=True, blank=True, help_text="Empty = unlimited")
    advice = models.BooleanField(default=False)
    monthly_call = models.BooleanField(default=False)
    monitoring = models.BooleanField(default=False)

    class Meta:
        ordering = ["order", "id"]

    def __str__(self):
        return self.name_en


class PricingFactor(models.Model):
    """One calculator variable the client can tweak (BUSINESS_RULES.md §2)."""

    key = models.SlugField(unique=True)
    order = models.PositiveSmallIntegerField(default=0)
    active = models.BooleanField(default=True)
    label_en, label_fr, label_ar = tr(models.CharField, max_length=80)
    help_en, help_fr, help_ar = tr(models.CharField, max_length=200, blank=True)
    services = models.ManyToManyField(Service, blank=True, help_text="Empty = applies to every service")

    class Meta:
        ordering = ["order", "id"]

    def __str__(self):
        return self.label_en


class PricingChoice(models.Model):
    """An option of a factor: a multiplier on the base and/or a fixed add-on."""

    factor = models.ForeignKey(PricingFactor, on_delete=models.CASCADE, related_name="choices")
    key = models.SlugField()
    order = models.PositiveSmallIntegerField(default=0)
    is_default = models.BooleanField(default=False)
    label_en, label_fr, label_ar = tr(models.CharField, max_length=80)
    multiplier = models.DecimalField(max_digits=4, decimal_places=2, default=1)
    addon_dzd = models.PositiveIntegerField(default=0)
    addon_eur = models.PositiveIntegerField(default=0)
    addon_usd = models.PositiveIntegerField(default=0)

    class Meta:
        ordering = ["order", "id"]
        constraints = [models.UniqueConstraint(fields=["factor", "key"], name="unique_choice_per_factor")]

    def addon(self, currency: str) -> int:
        return {"DZD": self.addon_dzd, "EUR": self.addon_eur, "USD": self.addon_usd}.get(currency, 0)

    def __str__(self):
        return f"{self.factor.key}:{self.key}"
