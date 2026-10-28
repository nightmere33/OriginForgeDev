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


def new_email_code(user) -> str:
    """A fresh 6-digit code for this user (earlier ones stop working)."""
    import secrets
    from datetime import timedelta

    from django.utils import timezone

    from .models import EmailCode

    code = f"{secrets.randbelow(1_000_000):06d}"
    EmailCode.objects.filter(user=user, used_at__isnull=True).delete()
    EmailCode.objects.create(user=user, code_hash=_code_hash(user, code),
                             expires_at=timezone.now() + timedelta(minutes=EmailCode.TTL_MINUTES))
    return code


def check_email_code(user, code: str) -> str:
    """'ok', 'wrong', 'expired' (or too many tries: a new code is needed)."""
    import hmac

    from django.utils import timezone

    from .models import EmailCode

    row = EmailCode.objects.filter(user=user, used_at__isnull=True).first()
    if not row or row.expires_at < timezone.now() or row.attempts >= EmailCode.MAX_ATTEMPTS:
        return "expired"
    if not hmac.compare_digest(row.code_hash, _code_hash(user, "".join(ch for ch in code if ch.isdigit()))):
        EmailCode.objects.filter(pk=row.pk).update(attempts=row.attempts + 1)
        return "expired" if row.attempts + 1 >= EmailCode.MAX_ATTEMPTS else "wrong"
    EmailCode.objects.filter(pk=row.pk).update(used_at=timezone.now())
    return "ok"


def _code_hash(user, code: str) -> str:
    import hashlib
    import hmac

    from django.conf import settings

    return hmac.new(settings.SECRET_KEY.encode(), f"{user.pk}:{user.email}:{code}".encode(), hashlib.sha256).hexdigest()
