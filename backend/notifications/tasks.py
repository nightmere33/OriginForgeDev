import logging

from celery import shared_task
from django.conf import settings
from django.core.mail import EmailMultiAlternatives
from django.utils import timezone

from .html import render_html

logger = logging.getLogger("originforge.notifications")


def _attach_invoice(message: EmailMultiAlternatives, invoice_id: int):
    """The invoice as a PDF. A drawing problem never holds back the e-mail: it is downloadable too."""
    from billing.invoices import ensure_pdf
    from billing.models import Invoice

    try:
        invoice = ensure_pdf(Invoice.objects.select_related("payment", "charge__engagement__request").get(pk=invoice_id))
        with invoice.pdf.open("rb") as f:
            message.attach(f"{invoice.number}.pdf", f.read(), "application/pdf")
        return invoice
    except Exception as exc:
        logger.exception("Invoice %s could not be attached: %s", invoice_id, exc)
        return None


@shared_task(bind=True, max_retries=3, default_retry_delay=60)
def send_email_task(self, subject: str, body: str, recipients: list[str], lang: str = "en", invoice_id: int | None = None):
    """Plain text plus its branded HTML twin. Replies reach the studio inbox. An invoice comes as a PDF."""
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
        invoice = _attach_invoice(message, invoice_id) if invoice_id else None
        message.send()
        if invoice:
            type(invoice).objects.filter(pk=invoice.pk).update(emailed_at=timezone.now())
    except Exception as exc:  # SMTP hiccups are retried, never raised into a request
        logger.warning("E-mail to %s failed: %s", recipients, exc)
        if not settings.CELERY_TASK_ALWAYS_EAGER:
            raise self.retry(exc=exc)
