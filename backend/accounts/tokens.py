"""Signed, expiring tokens for e-mail verification. Password reset uses Django's own generator."""

from django.core import signing

_SALT = "accounts.email-verification"
VERIFY_MAX_AGE = 60 * 60 * 48


def make_verification_token(user) -> str:
    # The e-mail is part of the payload: changing it invalidates old links.
    return signing.dumps({"uid": user.pk, "email": user.email}, salt=_SALT)


def read_verification_token(token: str) -> dict | None:
    try:
        return signing.loads(token, salt=_SALT, max_age=VERIFY_MAX_AGE)
    except signing.BadSignature:
        return None
