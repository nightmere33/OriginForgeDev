"""
Chargily Pay v2: card payments in dinars (CIB, Edahabia). Ported from the
MediGate integration, which settled the details against the live API:

    live  https://pay.chargily.net/api/v2        test  https://pay.chargily.net/test/api/v2
    auth  Authorization: Bearer <secret key>
    POST /checkouts   amount (whole DZD), currency "dzd", success_url, failure_url,
                      webhook_endpoint, description, locale (ar|en|fr),
                      metadata [{key, value}], chargily_pay_fees_allocation
    GET  /checkouts/{id}   status: pending · processing · paid · failed · canceled · expired
    webhook   header "signature" = hex HMAC-SHA256 of the raw body with the secret key

Two endpoints and an HMAC: written against the API directly (no SDK on the
money path), with our own timeouts and error typing.
"""

import hashlib
import hmac
import logging

import httpx
from django.conf import settings

logger = logging.getLogger("originforge.chargily")

TIMEOUT = httpx.Timeout(15.0, connect=5.0)
BASE = {"live": "https://pay.chargily.net/api/v2", "test": "https://pay.chargily.net/test/api/v2"}

# A checkout's own status, as GET /checkouts/{id} reports it, and what it means here.
STATUS = {"paid": "paid", "failed": "failed", "canceled": "canceled", "expired": "expired"}
EVENTS = {"checkout.paid": "paid", "checkout.failed": "failed", "checkout.canceled": "canceled", "checkout.expired": "expired"}


class ChargilyError(Exception):
    def __init__(self, message, *, status_code=None, payload=None):
        super().__init__(message)
        self.status_code = status_code
        self.payload = payload


def configured() -> bool:
    return bool(settings.CHARGILY_SECRET_KEY)


def live() -> bool:
    return settings.CHARGILY_MODE == "live"


def _request(method: str, path: str, **kwargs) -> dict:
    if not configured():
        raise ChargilyError("CHARGILY_SECRET_KEY is not set.")
    headers = {"Authorization": f"Bearer {settings.CHARGILY_SECRET_KEY}", "Accept": "application/json"}
    try:
        res = httpx.request(method, f"{BASE['live' if live() else 'test']}{path}", headers=headers, timeout=TIMEOUT, **kwargs)
    except httpx.RequestError as exc:
        logger.warning("Chargily %s %s unreachable: %s", method, path, exc)
        raise ChargilyError(f"Could not reach Chargily: {exc}") from exc
    if res.status_code >= 400:
        try:
            payload = res.json()
        except ValueError:
            payload = {"raw": res.text[:500]}
        logger.error("Chargily %s %s -> %s %s", method, path, res.status_code, payload)
        raise ChargilyError(f"Chargily returned {res.status_code}", status_code=res.status_code, payload=payload)
    return res.json()


def create_checkout(*, amount: int, success_url: str, failure_url: str, webhook_endpoint: str, description: str,
                    locale: str, metadata: dict) -> dict:
    """A hosted checkout. The payer covers Chargily's fee (BUSINESS_RULES.md §5)."""
    return _request("POST", "/checkouts", json={
        "amount": int(amount), "currency": "dzd", "success_url": success_url, "failure_url": failure_url,
        "webhook_endpoint": webhook_endpoint, "description": description[:255],
        "locale": locale if locale in ("ar", "en", "fr") else "fr",
        "chargily_pay_fees_allocation": "customer",
        # Chargily keeps metadata as a list of key/value pairs.
        "metadata": [{"key": str(k), "value": str(v)} for k, v in metadata.items()],
    })


def retrieve_checkout(checkout_id: str) -> dict:
    return _request("GET", f"/checkouts/{checkout_id}")


def verify_signature(raw_body: bytes, signature: str) -> bool:
    """The HMAC covers the raw body: check it before parsing anything. Constant time."""
    key = (settings.CHARGILY_SECRET_KEY or "").encode()
    if not signature or not key:
        return False
    expected = hmac.new(key, raw_body, hashlib.sha256).hexdigest()
    return hmac.compare_digest(expected, signature.strip())
