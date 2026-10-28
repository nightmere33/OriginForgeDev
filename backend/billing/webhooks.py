"""
Provider notices (webhooks) and PayPal's way back to the site.

A notice is checked (Chargily: HMAC of the raw body; PayPal: asked back with
the webhook id), stored as it came, and only then acted on: a bug in the
handling never loses the record of money that moved, and a stored event can
be replayed. A notice seen before is answered "ok" and not acted on twice.
"""

import json
import logging

from django.db import IntegrityError
from django.http import HttpResponse, HttpResponseForbidden, HttpResponseRedirect
from django.utils import timezone
from django.views.decorators.csrf import csrf_exempt
from django.views.decorators.http import require_GET, require_POST

from notifications.service import site_url

from . import chargily, online, paypal
from .models import Payment, WebhookEvent

logger = logging.getLogger("originforge.payments")


def _store(provider: str, event_id: str, event_type: str, payload: dict) -> WebhookEvent | None:
    """The event, kept before handling; None when it was already handled."""
    try:
        event, _ = WebhookEvent.objects.get_or_create(provider=provider, event_id=event_id[:120],
                                                      defaults={"event_type": event_type[:60], "payload": payload})
    except IntegrityError:
        event = WebhookEvent.objects.get(provider=provider, event_id=event_id[:120])
    return None if event.processed_at else event


def _handled(event: WebhookEvent, error: str = ""):
    WebhookEvent.objects.filter(pk=event.pk).update(processed_at=None if error else timezone.now(), error=error[:2000])


@csrf_exempt
@require_POST
def chargily_webhook(request):
    raw = request.body
    if not chargily.verify_signature(raw, request.headers.get("signature", "")):
        logger.warning("Chargily notice refused: bad signature")
        return HttpResponseForbidden("invalid signature")
    try:
        event = json.loads(raw)
    except ValueError:
        return HttpResponse("invalid payload", status=400)
    data = event.get("data") or {}
    kind = str(event.get("type") or "")
    # A test notice on the live server (or the reverse) never settles anything.
    if event.get("livemode") is not None and bool(event["livemode"]) != chargily.live():
        logger.error("Chargily notice livemode=%s on a %s server", event["livemode"], "live" if chargily.live() else "test")
        return HttpResponse("mode mismatch", status=400)
    if not data.get("id"):
        return HttpResponse("missing checkout id", status=400)
    stored = _store("chargily", str(event.get("id") or f"{data['id']}:{kind}"), kind, event)
    if stored is None:
        return HttpResponse("ok")
    try:
        outcome = chargily.EVENTS.get(kind)
        if outcome:
            online.from_chargily(data, outcome)
    except Exception as exc:  # stored already: answer 500 so Chargily retries
        logger.exception("Chargily notice %s failed", stored.event_id)
        _handled(stored, repr(exc))
        return HttpResponse("processing error", status=500)
    _handled(stored)
    return HttpResponse("ok")


def _paypal_payment(resource: dict) -> Payment | None:
    """The payment a capture or refund belongs to: our id rides along as custom_id."""
    custom = str(resource.get("custom_id") or "")
    if custom.isdigit():
        found = Payment.objects.filter(pk=int(custom), provider=Payment.Provider.PAYPAL).first()
        if found:
            return found
    order_id = ((resource.get("supplementary_data") or {}).get("related_ids") or {}).get("order_id")
    return Payment.objects.filter(provider=Payment.Provider.PAYPAL, provider_ref=str(order_id or "")).first() if order_id else None


@csrf_exempt
@require_POST
def paypal_webhook(request):
    raw = request.body
    if not paypal.verify_webhook(request.headers, raw):
        logger.warning("PayPal notice refused: not verified")
        return HttpResponseForbidden("not verified")
    try:
        event = json.loads(raw)
    except ValueError:
        return HttpResponse("invalid payload", status=400)
    kind = str(event.get("event_type") or "")
    resource = event.get("resource") or {}
    stored = _store("paypal", str(event.get("id") or ""), kind, event)
    if stored is None:
        return HttpResponse("ok")
    try:
        if kind.startswith("CHECKOUT.ORDER.") and resource.get("id"):
            # Read the order fresh from PayPal: an approved one is captured now.
            online.from_paypal(paypal.get_order(str(resource["id"])))
        elif kind.startswith("PAYMENT.CAPTURE."):
            payment = _paypal_payment(resource)
            if payment and kind in ("PAYMENT.CAPTURE.REFUNDED", "PAYMENT.CAPTURE.REVERSED"):
                online.settle(payment.pk, "refunded", resource)
            elif payment:
                online.from_paypal(paypal.get_order(payment.provider_ref))
    except Exception as exc:
        logger.exception("PayPal notice %s failed", stored.event_id)
        _handled(stored, repr(exc))
        return HttpResponse("processing error", status=500)
    _handled(stored)
    return HttpResponse("ok")


def _paypal_back(request, cancel: bool):
    payment = (Payment.objects.select_related("charge__engagement__request__client")
               .filter(provider=Payment.Provider.PAYPAL, provider_ref=request.GET.get("token", "")[:120]).first())
    if payment is None:
        return HttpResponseRedirect(site_url("/"))
    try:
        if cancel:
            if payment.status == Payment.Status.PENDING:
                online.settle(payment.pk, "canceled")
        else:
            online.from_paypal(paypal.get_order(payment.provider_ref))
    except paypal.PayPalError as exc:
        # The notice and the tick finish it; the page shows it as confirming.
        logger.warning("PayPal return for payment %s: %s", payment.pk, exc)
    return HttpResponseRedirect(online.page_of(payment))


@require_GET
def paypal_return(request):
    """Back from PayPal's own page (when its popup could not open): capture, then the project."""
    return _paypal_back(request, cancel=False)


@require_GET
def paypal_cancel(request):
    return _paypal_back(request, cancel=True)
