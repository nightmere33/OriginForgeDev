from .models import AuditLog


def client_ip(request) -> str | None:
    if request is None:
        return None
    # nginx sets X-Real-IP; never trust a client-supplied X-Forwarded-For chain.
    return request.META.get("HTTP_X_REAL_IP") or request.META.get("REMOTE_ADDR")


def record(request, action: str, target=None, *, actor=None, **data) -> AuditLog:
    user = actor if actor is not None else getattr(request, "user", None)
    # Every recorded move of a request (or of anything belonging to one) is also
    # pushed live, so both sides see it without reloading.
    req = target if target is not None and target._meta.label_lower == "engagements.projectrequest" else getattr(target, "request", None)
    if req is not None and getattr(req, "reference", None):
        from live.service import request_changed

        request_changed(req, action)
    return AuditLog.objects.create(
        actor=user if getattr(user, "is_authenticated", False) else None,
        action=action,
        target_type=target._meta.label_lower if target is not None else "",
        target_id=str(target.pk) if target is not None else "",
        target_label=str(target)[:255] if target is not None else "",
        data=data,
        ip=client_ip(request),
        user_agent=(request.META.get("HTTP_USER_AGENT", "")[:255] if request is not None else ""),
    )
