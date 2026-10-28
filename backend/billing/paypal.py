"""
PayPal Orders v2: payments in USD or EUR, written against the REST API.

    sandbox  https://api-m.sandbox.paypal.com      live  https://api-m.paypal.com
    token    POST /v1/oauth2/token (client id + secret, client_credentials), cached
    order    POST /v2/checkout/orders (intent CAPTURE) -> "payer-action" link
    capture  POST /v2/checkout/orders/{id}/capture, once the payer approved
    notice   POST /v1/notifications/verify-webhook-signature (the webhook id)

One PayPal account serves several projects, each with its own REST app; the
project's name goes on every order (brand_name, soft_descriptor) and its own
prefix on the invoice id, which PayPal keeps unique across the whole account.
"""

import json
import logging

import httpx
from django.conf import settings
from django.core.cache import cache

logger = logging.getLogger("originforge.paypal")

TIMEOUT = httpx.Timeout(20.0, connect=5.0)
BASE = {"live": "https://api-m.paypal.com", "sandbox": "https://api-m.sandbox.paypal.com"}
BRAND = "OriginForge"
INVOICE_PREFIX = "OF-PAY-"


class PayPalError(Exception):
    def __init__(self, message, *, status_code=None, payload=None):
        super().__init__(message)
        self.status_code = status_code
        self.payload = payload

    @property
    def issue(self) -> str:
        details = (self.payload or {}).get("details") or [{}]
        return str(details[0].get("issue", ""))


def configured() -> bool:
    return bool(settings.PAYPAL_CLIENT_ID and settings.PAYPAL_CLIENT_SECRET)


def live() -> bool:
    return settings.PAYPAL_MODE == "live"


def _base() -> str:
    return BASE["live" if live() else "sandbox"]


def _token() -> str:
    key = f"paypal-token:{settings.PAYPAL_MODE}:{settings.PAYPAL_CLIENT_ID[-8:]}"
    token = cache.get(key)
    if token:
        return token
    try:
        res = httpx.post(f"{_base()}/v1/oauth2/token", data={"grant_type": "client_credentials"},
                         auth=(settings.PAYPAL_CLIENT_ID, settings.PAYPAL_CLIENT_SECRET), timeout=TIMEOUT)
    except httpx.RequestError as exc:
        raise PayPalError(f"Could not reach PayPal: {exc}") from exc
    if res.status_code >= 400:
        logger.error("PayPal token -> %s", res.status_code)
        raise PayPalError(f"PayPal refused the credentials ({res.status_code})", status_code=res.status_code)
    data = res.json()
    # A minute early, so a token never expires between the cache and the call.
    cache.set(key, data["access_token"], max(60, int(data.get("expires_in", 3600)) - 60))
    return data["access_token"]


def _request(method: str, path: str, *, request_id: str = "", **kwargs) -> dict:
    if not configured():
        raise PayPalError("PAYPAL_CLIENT_ID / PAYPAL_CLIENT_SECRET are not set.")
    headers = {"Authorization": f"Bearer {_token()}", "Content-Type": "application/json", "Prefer": "return=representation"}
    if request_id:
        # Idempotency: a retried create or capture returns the first result.
        headers["PayPal-Request-Id"] = request_id
    try:
        res = httpx.request(method, f"{_base()}{path}", headers=headers, timeout=TIMEOUT, **kwargs)
    except httpx.RequestError as exc:
        logger.warning("PayPal %s %s unreachable: %s", method, path, exc)
        raise PayPalError(f"Could not reach PayPal: {exc}") from exc
    if res.status_code >= 400:
        try:
            payload = res.json()
        except ValueError:
            payload = {"raw": res.text[:500]}
        logger.error("PayPal %s %s -> %s %s", method, path, res.status_code, payload)
        raise PayPalError(f"PayPal returned {res.status_code}", status_code=res.status_code, payload=payload)
    return res.json() if res.content else {}


def create_order(*, payment_id: int, amount: str, currency: str, reference: str, description: str,
                 return_url: str, cancel_url: str, locale: str) -> dict:
    return _request("POST", "/v2/checkout/orders", request_id=f"of-order-{payment_id}", json={
        "intent": "CAPTURE",
        "purchase_units": [{
            "reference_id": reference[:256],
            "custom_id": str(payment_id),
            "invoice_id": f"{INVOICE_PREFIX}{payment_id}",
            "description": description[:127],
            "soft_descriptor": BRAND[:22],
            "amount": {"currency_code": currency, "value": amount},
        }],
        "payment_source": {"paypal": {"experience_context": {
            "brand_name": BRAND, "locale": "fr-FR" if locale == "fr" else "en-US",
            # Lets PayPal offer a card without an account where it can.
            "landing_page": "NO_PREFERENCE", "shipping_preference": "NO_SHIPPING", "user_action": "PAY_NOW",
            "return_url": return_url, "cancel_url": cancel_url,
        }}},
    })


def approve_url(order: dict) -> str:
    return next((link["href"] for link in order.get("links", []) if link.get("rel") in ("payer-action", "approve")), "")


def get_order(order_id: str) -> dict:
    return _request("GET", f"/v2/checkout/orders/{order_id}")


def capture(order_id: str, payment_id: int) -> dict:
    """Take the money the payer approved. Captured already: the order as it stands."""
    try:
        return _request("POST", f"/v2/checkout/orders/{order_id}/capture", request_id=f"of-capture-{payment_id}", json={})
    except PayPalError as exc:
        if exc.issue == "ORDER_ALREADY_CAPTURED":
            return get_order(order_id)
        raise


def first_capture(order: dict) -> dict:
    units = order.get("purchase_units") or [{}]
    return ((units[0].get("payments") or {}).get("captures") or [{}])[0]


def verify_webhook(headers, raw_body: bytes) -> bool:
    """Ask PayPal whether this notice is genuine. The event goes back byte for byte, as received."""
    if not (configured() and settings.PAYPAL_WEBHOOK_ID):
        return False
    fields = {
        "auth_algo": headers.get("paypal-auth-algo", ""), "cert_url": headers.get("paypal-cert-url", ""),
        "transmission_id": headers.get("paypal-transmission-id", ""), "transmission_sig": headers.get("paypal-transmission-sig", ""),
        "transmission_time": headers.get("paypal-transmission-time", ""), "webhook_id": settings.PAYPAL_WEBHOOK_ID,
    }
    if not all(fields.values()):
        return False
    body = json.dumps(fields)[:-1] + ', "webhook_event": ' + raw_body.decode("utf-8") + "}"
    try:
        result = _request("POST", "/v1/notifications/verify-webhook-signature", content=body.encode())
    except (PayPalError, UnicodeDecodeError) as exc:
        logger.warning("PayPal webhook verification failed: %s", exc)
        return False
    return result.get("verification_status") == "SUCCESS"
