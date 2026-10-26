"""
The one entry point for outgoing e-mail.

Messages are queued on transaction commit, so a request that rolls back never
announces something that did not happen, and a slow SMTP server never holds a
web request open.
"""

from django.conf import settings
from django.contrib.auth import get_user_model
from django.db import transaction

from .tasks import send_email_task
from .templates import render


def site_url(path: str = "") -> str:
    return f"{settings.SITE_URL}{path}"


def notify(key: str, recipients, *, lang: str = "en", **context):
    recipients = [r for r in recipients if r]
    if not recipients:
        return
    subject, body = render(key, lang, **context)
    transaction.on_commit(lambda: send_email_task.delay(subject, body, recipients, lang))


def user_lang(user) -> str:
    """The user's language if the site offers it yet, else English."""
    return user.language if user.language in settings.ENABLED_LANGUAGES else "en"


def notify_user(key: str, user, *, in_app_path: str = "", **context):
    notify(key, [user.email], lang=user_lang(user), name=user.full_name.split(" ")[0] or user.email, **context)
    if in_app_path:
        from live.service import notify_in_app

        subject, _ = render(key, user_lang(user), name=user.full_name.split(" ")[0] or user.email, **context)
        notify_in_app(user, key, subject, "", in_app_path)


def studio_recipients() -> list[str]:
    if settings.STUDIO_NOTIFY_EMAIL:
        return [settings.STUDIO_NOTIFY_EMAIL]
    User = get_user_model()
    return list(User.objects.filter(role=User.Role.DEVELOPER, is_active=True).values_list("email", flat=True))


def notify_studio(key: str, *, in_app_path: str = "", **context):
    notify(key, studio_recipients(), lang="en", **context)
    if in_app_path:
        from live.service import notify_studio_in_app

        subject, _ = render(key, "en", **context)
        notify_studio_in_app(key, subject, "", in_app_path)
