import logging

from celery import shared_task
from django.conf import settings
from django.core.mail import EmailMultiAlternatives

from .html import render_html

logger = logging.getLogger("originforge.notifications")


@shared_task(bind=True, max_retries=3, default_retry_delay=60)
def send_email_task(self, subject: str, body: str, recipients: list[str], lang: str = "en"):
    """Plain text plus its branded HTML twin. Replies reach the studio inbox."""
    try:
        reply_to = [settings.STUDIO_NOTIFY_EMAIL] if settings.STUDIO_NOTIFY_EMAIL else None
        message = EmailMultiAlternatives(
            subject=f"[{settings.SITE_NAME}] {subject}",
            body=body,
            from_email=settings.DEFAULT_FROM_EMAIL,
            to=recipients,
            reply_to=reply_to,
        )
        message.attach_alternative(render_html(subject, body, lang), "text/html")
        message.send()
    except Exception as exc:  # SMTP hiccups are retried, never raised into a request
        logger.warning("E-mail to %s failed: %s", recipients, exc)
        if not settings.CELERY_TASK_ALWAYS_EAGER:
            raise self.retry(exc=exc)
