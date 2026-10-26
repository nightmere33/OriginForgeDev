"""
Request lifecycle rules. Every status change goes through `transition`.

The table says who may move a request from where to where. Phase 2 adds the
proposal-driven moves (in_review → proposal_sent → accepted); until proposals
exist, nothing can reach those states.
"""

from django.db import transaction
from rest_framework.exceptions import PermissionDenied, ValidationError

from audit.service import record
from notifications.service import notify_studio, notify_user, site_url

from .models import ProjectRequest

S = ProjectRequest.Status

DEVELOPER_MOVES = {
    S.SUBMITTED: {S.IN_REVIEW, S.DECLINED, S.ARCHIVED},
    S.IN_REVIEW: {S.CLARIFICATION, S.DECLINED, S.ARCHIVED},
    S.CLARIFICATION: {S.IN_REVIEW, S.DECLINED, S.ARCHIVED},
    S.DECLINED: {S.ARCHIVED},
    S.WITHDRAWN: {S.ARCHIVED},
}

CLIENT_MOVES = {
    S.SUBMITTED: {S.WITHDRAWN},
    S.IN_REVIEW: {S.WITHDRAWN},
    S.CLARIFICATION: {S.WITHDRAWN},
}


def allowed_moves(user, req: ProjectRequest) -> set[str]:
    if user.is_developer:
        return set(DEVELOPER_MOVES.get(req.status, set()))
    if req.client_id == user.id:
        return set(CLIENT_MOVES.get(req.status, set()))
    return set()


def submit_request(request, req: ProjectRequest) -> ProjectRequest:
    req.save()
    record(request, "request.submitted", req)
    link = site_url(f"/{req.language}/portal/requests/{req.reference}")
    notify_user("request_received", req.client, reference=req.reference, title=req.title, link=link,
                in_app_path=f"/portal/requests/{req.reference}")
    budget = "—"
    if req.budget_min or req.budget_max:
        budget = f"{req.budget_min or '?'}–{req.budget_max or '?'} {req.budget_currency}"
    notify_studio(
        "studio_new_request",
        reference=req.reference, title=req.title, client=req.client.full_name, email=req.client.email,
        service=req.service.title_en if req.service else "—", budget=budget,
        deadline=req.deadline or "flexible", objectives=req.objectives,
        link=site_url(f"/en/studio/requests/{req.reference}"),
        in_app_path=f"/studio/requests/{req.reference}",
    )
    return req


def transition(request, req_id: int, to: str, note: str = "") -> ProjectRequest:
    user = request.user
    with transaction.atomic():
        req = ProjectRequest.objects.select_for_update().select_related("client").get(pk=req_id)
        if to not in allowed_moves(user, req):
            if not user.is_developer and req.client_id != user.id:
                raise PermissionDenied()
            raise ValidationError({"to": f"Cannot move a request from '{req.status}' to '{to}'."})
        if to == S.DECLINED and not note.strip():
            raise ValidationError({"note": "Tell the client why — a decline needs a reason."})

        previous = req.status
        req.status = to
        if user.is_developer:
            req.status_note = note.strip()
        req.save(update_fields=["status", "status_note", "updated_at"])
        record(request, "request.status_changed", req, **{"from": previous, "to": to, "note": note.strip()})

    if user.is_developer and to != S.ARCHIVED:
        notify_user(
            "request_status", req.client,
            reference=req.reference, title=req.title, status=req.get_status_display(),
            note=f"{note.strip()}\n\n" if note.strip() else "",
            link=site_url(f"/{req.language}/portal/requests/{req.reference}"),
        )
    return req
