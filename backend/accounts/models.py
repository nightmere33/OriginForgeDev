import uuid

from django.contrib.auth.models import AbstractUser, BaseUserManager
from django.db import models
from django.db.models.functions import Lower


def avatar_path(instance, filename):
    """A fresh random name per picture: an old link never shows the new one, nor the other way round."""
    return f"avatars/{uuid.uuid4().hex}.webp"


class UserManager(BaseUserManager):
    use_in_migrations = True

    def _create_user(self, email, password, **extra):
        if not email:
            raise ValueError("An e-mail address is required.")
        user = self.model(email=self.normalize_email(email).lower(), **extra)
        user.set_password(password)
        user.save(using=self._db)
        return user

    def create_user(self, email, password=None, **extra):
        extra.setdefault("is_staff", False)
        extra.setdefault("is_superuser", False)
        return self._create_user(email, password, **extra)

    def create_superuser(self, email, password=None, **extra):
        extra.setdefault("is_staff", True)
        extra.setdefault("is_superuser", True)
        extra.setdefault("role", User.Role.DEVELOPER)
        return self._create_user(email, password, **extra)


class User(AbstractUser):
    """Clients sign in with their e-mail. The developer is the studio owner."""

    class Role(models.TextChoices):
        CLIENT = "client", "Client"
        DEVELOPER = "developer", "Developer"

    class Language(models.TextChoices):
        EN = "en", "English"
        FR = "fr", "Français"
        AR = "ar", "العربية"

    username = None
    first_name = None
    last_name = None

    email = models.EmailField(unique=True)
    full_name = models.CharField(max_length=150)
    role = models.CharField(max_length=20, choices=Role.choices, default=Role.CLIENT)
    company = models.CharField(max_length=150, blank=True)
    phone = models.CharField(max_length=40, blank=True)
    whatsapp = models.CharField(max_length=40, blank=True)
    # Optional ways to reach the client, besides the phone and the website chat.
    instagram = models.CharField(max_length=60, blank=True, help_text="Username, without the @")
    messenger = models.CharField(max_length=120, blank=True, help_text="Facebook username or m.me link")
    country = models.CharField(max_length=80, blank=True, help_text="The country's name in English (invoices)")
    country_code = models.CharField(max_length=2, blank=True, help_text="ISO 3166 code, e.g. DZ, FR")
    # How they'd like to be called on the site (optional, unique whatever the case).
    handle = models.CharField("username", max_length=30, blank=True)
    # Postal address (invoices, couriers); all optional, edited in Settings.
    address = models.CharField(max_length=255, blank=True)
    city = models.CharField(max_length=80, blank=True)
    postal_code = models.CharField(max_length=20, blank=True)
    language = models.CharField(max_length=2, choices=Language.choices, default=Language.EN)
    # How prices are shown to this person (amounts in a contract keep their own currency).
    currency = models.CharField(max_length=3, choices=[(c, c) for c in ("DZD", "EUR", "USD")], default="DZD")
    email_verified_at = models.DateTimeField(null=True, blank=True)
    # Profile picture: always a 384 px WebP made by accounts.avatar (checked, no EXIF).
    avatar = models.ImageField(upload_to=avatar_path, blank=True)

    # Onboarding (asked once after sign-up; editable in settings).
    class HeardFrom(models.TextChoices):
        INSTAGRAM = "instagram", "Instagram"
        FACEBOOK = "facebook", "Facebook"
        TIKTOK = "tiktok", "TikTok"
        LINKEDIN = "linkedin", "LinkedIn"
        YOUTUBE = "youtube", "YouTube"
        GOOGLE = "google", "Google search"
        GITHUB = "github", "GitHub"
        FRIEND = "friend", "A friend or colleague"
        CLIENT = "client", "A past client"
        OTHER = "other", "Other"

    class Channel(models.TextChoices):
        SITE = "site", "Website chat"
        WHATSAPP = "whatsapp", "WhatsApp"
        INSTAGRAM = "instagram", "Instagram"
        DISCORD = "discord", "Discord"
        EMAIL = "email", "E-mail"
        PHONE = "phone", "Phone call"

    heard_from = models.CharField(max_length=20, choices=HeardFrom.choices, blank=True)
    heard_from_detail = models.CharField(max_length=160, blank=True, help_text="Who referred them, or what 'other' was")
    contact_channel = models.CharField(max_length=20, choices=Channel.choices, default=Channel.SITE)
    contact_handle = models.CharField(max_length=120, blank=True, help_text="Their @ on Instagram, Discord username, etc.")
    onboarded_at = models.DateTimeField(null=True, blank=True)

    USERNAME_FIELD = "email"
    REQUIRED_FIELDS = ["full_name"]

    objects = UserManager()

    class Meta:
        constraints = [
            models.UniqueConstraint(Lower("handle"), condition=~models.Q(handle=""), name="unique_handle_any_case"),
        ]

    @property
    def is_developer(self) -> bool:
        return self.role == self.Role.DEVELOPER or self.is_staff

    def __str__(self):
        return f"{self.full_name} <{self.email}>"


class SocialAccount(models.Model):
    """A Google or Facebook identity linked to an account (accounts/oauth.py)."""

    class Provider(models.TextChoices):
        GOOGLE = "google", "Google"
        FACEBOOK = "facebook", "Facebook"

    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name="social_accounts")
    provider = models.CharField(max_length=20, choices=Provider.choices)
    uid = models.CharField(max_length=191, help_text="The provider's id for this person")
    email = models.EmailField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    last_login_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        constraints = [models.UniqueConstraint(fields=["provider", "uid"], name="unique_social_identity")]

    def __str__(self):
        return f"{self.get_provider_display()} · {self.email or self.uid}"


class EmailCode(models.Model):
    """
    A 6-digit code that confirms an e-mail address (sent at sign-up and on
    request). Only a keyed hash is stored; it lasts 15 minutes and allows
    5 tries, and a new one replaces the old.
    """

    TTL_MINUTES = 15
    MAX_ATTEMPTS = 5
    RESEND_SECONDS = 45
    # Per account and per 24 hours: codes of any kind (sign-up, resend, a
    # changed address), and changes of a not-yet-confirmed address.
    DAILY_MAX = 8
    CHANGES_PER_DAY = 3

    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name="email_codes")
    code_hash = models.CharField(max_length=64)
    attempts = models.PositiveSmallIntegerField(default=0)
    expires_at = models.DateTimeField()
    used_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self):
        return f"Code for {self.user} ({self.created_at:%Y-%m-%d %H:%M})"
