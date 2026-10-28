"""
OriginForge API settings.

Everything that differs between a laptop and the VPS comes from the
environment (see `.env.example`). Nothing secret lives in this file: the old
DevForge settings shipped a hardcoded SECRET_KEY in a public repository, and
that key is considered burned.
"""

import os
from pathlib import Path

import dj_database_url
from dotenv import load_dotenv

BASE_DIR = Path(__file__).resolve().parent.parent
load_dotenv(BASE_DIR / ".env")


def env_bool(name: str, default: bool = False) -> bool:
    return os.environ.get(name, str(int(default))).strip().lower() in ("1", "true", "yes", "on")


def env_list(name: str, default: str = "") -> list[str]:
    return [item.strip() for item in os.environ.get(name, default).split(",") if item.strip()]


DEBUG = env_bool("DJANGO_DEBUG")

SECRET_KEY = os.environ.get("DJANGO_SECRET_KEY", "")
if not SECRET_KEY:
    if not DEBUG:
        raise RuntimeError("DJANGO_SECRET_KEY must be set when DJANGO_DEBUG is off.")
    SECRET_KEY = "dev-only-insecure-key-never-use-in-production"

ALLOWED_HOSTS = env_list("DJANGO_ALLOWED_HOSTS", "localhost,127.0.0.1")
CSRF_TRUSTED_ORIGINS = env_list("DJANGO_CSRF_TRUSTED_ORIGINS", "http://localhost:3000,http://127.0.0.1:3000")

# ---- Site -------------------------------------------------------------------
SITE_NAME = "OriginForge"
# Public origin of the Next.js site; links in e-mails point here.
SITE_URL = os.environ.get("SITE_URL", "http://localhost:3000").rstrip("/")
# On-demand ISR: Django pings Next.js when public content changes.
NEXT_REVALIDATE_URL = os.environ.get("NEXT_REVALIDATE_URL", "")
NEXT_REVALIDATE_SECRET = os.environ.get("NEXT_REVALIDATE_SECRET", "")
DJANGO_ADMIN_PATH = os.environ.get("DJANGO_ADMIN_PATH", "_djadmin/")

# Sign in with Google / Facebook (accounts/oauth.py): a button shows once its keys are set.
GOOGLE_CLIENT_ID = os.environ.get("GOOGLE_CLIENT_ID", "")
GOOGLE_CLIENT_SECRET = os.environ.get("GOOGLE_CLIENT_SECRET", "")
FACEBOOK_APP_ID = os.environ.get("FACEBOOK_APP_ID", "")
FACEBOOK_APP_SECRET = os.environ.get("FACEBOOK_APP_SECRET", "")
FACEBOOK_GRAPH_VERSION = os.environ.get("FACEBOOK_GRAPH_VERSION", "v23.0")

# Online payments (billing/online.py): a method shows once its keys are set.
# Chargily (CIB, Edahabia; DZD): the secret key signs API calls and webhooks.
CHARGILY_SECRET_KEY = os.environ.get("CHARGILY_SECRET_KEY", "")
CHARGILY_MODE = os.environ.get("CHARGILY_MODE", "test")  # test | live
# PayPal (USD/EUR): one REST app per project; the webhook id verifies its notices.
PAYPAL_CLIENT_ID = os.environ.get("PAYPAL_CLIENT_ID", "")
PAYPAL_CLIENT_SECRET = os.environ.get("PAYPAL_CLIENT_SECRET", "")
PAYPAL_WEBHOOK_ID = os.environ.get("PAYPAL_WEBHOOK_ID", "")
PAYPAL_MODE = os.environ.get("PAYPAL_MODE", "sandbox")  # sandbox | live

# ---- Apps -------------------------------------------------------------------
INSTALLED_APPS = [
    # Daphne first: `runserver` then serves ASGI, WebSockets included.
    "daphne",
    "django.contrib.admin",
    "django.contrib.auth",
    "django.contrib.contenttypes",
    "django.contrib.sessions",
    "django.contrib.messages",
    "django.contrib.staticfiles",
    "rest_framework",
    "accounts",
    "audit",
    "content",
    "engagements",
    "billing",
    "fx",
    "notifications",
    "channels",
    "live",
    "reviews",
    "studio",
]

MIDDLEWARE = [
    "django.middleware.security.SecurityMiddleware",
    "django.contrib.sessions.middleware.SessionMiddleware",
    "django.middleware.common.CommonMiddleware",
    "django.middleware.csrf.CsrfViewMiddleware",
    "django.contrib.auth.middleware.AuthenticationMiddleware",
    "django.contrib.messages.middleware.MessageMiddleware",
    "django.middleware.clickjacking.XFrameOptionsMiddleware",
]

ROOT_URLCONF = "config.urls"
WSGI_APPLICATION = "config.wsgi.application"
# HTTP and WebSockets (live notifications, conversations, progress) from one ASGI app.
ASGI_APPLICATION = "config.asgi.application"

TEMPLATES = [
    {
        "BACKEND": "django.template.backends.django.DjangoTemplates",
        "DIRS": [],
        "APP_DIRS": True,
        "OPTIONS": {
            "context_processors": [
                "django.template.context_processors.request",
                "django.contrib.auth.context_processors.auth",
                "django.contrib.messages.context_processors.messages",
            ],
        },
    },
]

# ---- Database ---------------------------------------------------------------
DATABASES = {
    "default": dj_database_url.parse(
        os.environ.get("DATABASE_URL") or f"sqlite:///{BASE_DIR / 'db.sqlite3'}",
        conn_max_age=int(os.environ.get("DB_CONN_MAX_AGE", "60")),
    )
}
DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"

# ---- Auth -------------------------------------------------------------------
AUTH_USER_MODEL = "accounts.User"
AUTH_PASSWORD_VALIDATORS = [
    {"NAME": "django.contrib.auth.password_validation.UserAttributeSimilarityValidator"},
    {"NAME": "django.contrib.auth.password_validation.MinimumLengthValidator", "OPTIONS": {"min_length": 10}},
    {"NAME": "django.contrib.auth.password_validation.CommonPasswordValidator"},
    {"NAME": "django.contrib.auth.password_validation.NumericPasswordValidator"},
]

# Session cookies, not JWTs in localStorage: the browser never hands a token
# to JavaScript, so an injected script cannot walk away with a session.
SESSION_COOKIE_NAME = "of_session"
SESSION_COOKIE_AGE = 60 * 60 * 24 * 14
SESSION_COOKIE_HTTPONLY = True
SESSION_COOKIE_SAMESITE = "Lax"
SESSION_COOKIE_SECURE = not DEBUG
# The Next.js client reads this cookie to echo it back as X-CSRFToken.
CSRF_COOKIE_NAME = "of_csrftoken"
CSRF_COOKIE_HTTPONLY = False
CSRF_COOKIE_SAMESITE = "Lax"
CSRF_COOKIE_SECURE = not DEBUG

# ---- Security headers (production) -----------------------------------------
if not DEBUG:
    SECURE_PROXY_SSL_HEADER = ("HTTP_X_FORWARDED_PROTO", "https")
    SECURE_SSL_REDIRECT = env_bool("DJANGO_SSL_REDIRECT", True)
    SECURE_HSTS_SECONDS = int(os.environ.get("DJANGO_HSTS_SECONDS", "31536000"))
    SECURE_HSTS_INCLUDE_SUBDOMAINS = True
    SECURE_HSTS_PRELOAD = False
    SECURE_CONTENT_TYPE_NOSNIFF = True
    SECURE_REFERRER_POLICY = "strict-origin-when-cross-origin"
    X_FRAME_OPTIONS = "DENY"

# ---- REST framework ---------------------------------------------------------
REST_FRAMEWORK = {
    "DEFAULT_AUTHENTICATION_CLASSES": ("rest_framework.authentication.SessionAuthentication",),
    "DEFAULT_PERMISSION_CLASSES": ("rest_framework.permissions.IsAuthenticated",),
    "DEFAULT_RENDERER_CLASSES": ("rest_framework.renderers.JSONRenderer",)
    + (("rest_framework.renderers.BrowsableAPIRenderer",) if DEBUG else ()),
    "DEFAULT_PAGINATION_CLASS": "rest_framework.pagination.PageNumberPagination",
    "PAGE_SIZE": 25,
    # Throttles count by REMOTE_ADDR, never by X-Forwarded-For: a visitor
    # writes that header, and a new value per request would be a fresh
    # allowance. uvicorn (--proxy-headers, trusting only nginx) has already
    # set REMOTE_ADDR to the real visitor that nginx took from Cloudflare.
    "NUM_PROXIES": 0,
    "DEFAULT_THROTTLE_CLASSES": (
        "rest_framework.throttling.AnonRateThrottle",
        "rest_framework.throttling.UserRateThrottle",
        "rest_framework.throttling.ScopedRateThrottle",
    ),
    "DEFAULT_THROTTLE_RATES": {
        "anon": "120/min",
        "user": "600/min",
        "login": "10/min",
        "register": "5/hour",
        "password_reset": "5/hour",
        "request_submit": "10/hour",
        "draft": "120/hour",
        "message": "120/hour",
        "upload": "60/hour",
    },
}

# ---- i18n -------------------------------------------------------------------
LANGUAGE_CODE = "en"
LANGUAGES = [("en", "English"), ("fr", "Français"), ("ar", "العربية")]
# Arabic is modelled everywhere but not offered until the RTL pass is done.
ENABLED_LANGUAGES = env_list("ENABLED_LANGUAGES", "en,fr")
TIME_ZONE = "Africa/Algiers"
USE_I18N = True
USE_TZ = True

# ---- Static & media ---------------------------------------------------------
STATIC_URL = "static/"
STATIC_ROOT = Path(os.environ.get("STATIC_ROOT", BASE_DIR / "staticfiles"))
# Public media: portfolio images and loops, served straight by nginx.
MEDIA_URL = "/media/"
MEDIA_ROOT = Path(os.environ.get("MEDIA_ROOT", BASE_DIR / "media"))
# Absolute origin for media URLs in API responses (production: the site
# origin, where nginx serves /media/). Empty: built from the request host.
PUBLIC_MEDIA_ORIGIN = os.environ.get("PUBLIC_MEDIA_ORIGIN", "").rstrip("/")
# Private media: client attachments and payment receipts. Never under
# MEDIA_ROOT, never given a URL — only reachable through an authorized view.
PRIVATE_MEDIA_ROOT = Path(os.environ.get("PRIVATE_MEDIA_ROOT", BASE_DIR / "private_media"))
# In production nginx serves private files from an `internal` location once
# Django has said yes (X-Accel-Redirect). Empty in development: Django streams.
PRIVATE_MEDIA_ACCEL_PREFIX = os.environ.get("PRIVATE_MEDIA_ACCEL_PREFIX", "")

UPLOAD_MAX_BYTES = int(os.environ.get("UPLOAD_MAX_BYTES", str(25 * 1024 * 1024)))
UPLOAD_MAX_FILES_PER_REQUEST = 10
DATA_UPLOAD_MAX_MEMORY_SIZE = 5 * 1024 * 1024
FILE_UPLOAD_MAX_MEMORY_SIZE = 5 * 1024 * 1024

# ---- E-mail -----------------------------------------------------------------
DEFAULT_FROM_EMAIL = os.environ.get("DEFAULT_FROM_EMAIL", "OriginForge <no-reply@originforge.local>")
# Where new requests and payment events are announced.
STUDIO_NOTIFY_EMAIL = os.environ.get("STUDIO_NOTIFY_EMAIL", "")
if os.environ.get("EMAIL_HOST") and os.environ.get("EMAIL_HOST_PASSWORD"):
    EMAIL_BACKEND = "django.core.mail.backends.smtp.EmailBackend"
    EMAIL_HOST = os.environ["EMAIL_HOST"]
    EMAIL_PORT = int(os.environ.get("EMAIL_PORT", "587"))
    EMAIL_USE_TLS = env_bool("EMAIL_USE_TLS", True)
    EMAIL_HOST_USER = os.environ.get("EMAIL_HOST_USER", "")
    EMAIL_HOST_PASSWORD = os.environ.get("EMAIL_HOST_PASSWORD", "")
    EMAIL_TIMEOUT = 15
else:
    EMAIL_BACKEND = "django.core.mail.backends.console.EmailBackend"

# ---- Celery -----------------------------------------------------------------
CELERY_BROKER_URL = os.environ.get("REDIS_URL", "") or "memory://"

# Live updates: Redis in production (every worker shares the groups); in
# development a single process, so memory is enough.
if os.environ.get("REDIS_URL"):
    CHANNEL_LAYERS = {"default": {"BACKEND": "channels_redis.core.RedisChannelLayer", "CONFIG": {"hosts": [os.environ["REDIS_URL"]]}}}
else:
    CHANNEL_LAYERS = {"default": {"BACKEND": "channels.layers.InMemoryChannelLayer"}}
# Throttle counts and sign-in attempt limits are shared by every worker (in
# each process's memory, every uvicorn worker would grant its own allowance).
if os.environ.get("REDIS_URL"):
    CACHES = {"default": {"BACKEND": "django.core.cache.backends.redis.RedisCache", "LOCATION": os.environ["REDIS_URL"], "KEY_PREFIX": "of"}}
CELERY_RESULT_BACKEND = None
CELERY_TASK_IGNORE_RESULT = True
# No broker on a laptop: run tasks inline so nothing needs Redis to work.
CELERY_TASK_ALWAYS_EAGER = CELERY_BROKER_URL == "memory://"
CELERY_TASK_EAGER_PROPAGATES = DEBUG
CELERY_TIMEZONE = TIME_ZONE
# Lifecycle timers (docs/BUSINESS_RULES.md): expiries, payment reminders, closures.
CELERY_BEAT_SCHEDULE = {
    "lifecycle-tick": {"task": "engagements.tasks.lifecycle_tick", "schedule": 15 * 60},
    "fx-refresh": {"task": "fx.tasks.refresh_rates", "schedule": 30 * 60},
}

# ---- Logging ----------------------------------------------------------------
LOGGING = {
    "version": 1,
    "disable_existing_loggers": False,
    "formatters": {"plain": {"format": "%(asctime)s %(levelname)s %(name)s: %(message)s"}},
    "handlers": {"console": {"class": "logging.StreamHandler", "formatter": "plain"}},
    "root": {"handlers": ["console"], "level": "INFO"},
    "loggers": {"django.request": {"level": "WARNING"}},
}
