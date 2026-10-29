"""
Support endpoints (docs/SUPPORT.md). A ticket's messages come out in the same
shape as a project conversation's, so the site draws both with one thread.
"""

from django.contrib.auth import get_user_model
from django.db.models import Count, Max, Q
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework import permissions, status
from rest_framework.decorators import api_view, parser_classes, permission_classes, throttle_classes
from rest_framework.exceptions import NotFound, ValidationError
from rest_framework.parsers import FormParser, JSONParser, MultiPartParser
from rest_framework.response import Response
from rest_framework.throttling import UserRateThrottle

from accounts.permissions import IsDeveloper
from accounts.serializers import avatar_url
from common.files import serve_private
from engagements.models import ProjectRequest

from . import service
from .models import Ticket, TicketMessage
from .tiers import standing

User = get_user_model()
PAGE = 50


class PostThrottle(UserRateThrottle):
    """Counts writes only: reading a ticket is never limited beyond the usual rate."""

    def allow_request(self, request, view):
        return request.method != "POST" or super().allow_request(request, view)


class TicketThrottle(PostThrottle):
    scope = "ticket"


class MessageThrottle(PostThrottle):
    scope = "message"


def ticket_data(t: Ticket, viewer) -> dict:
    now = timezone.now()
    row = {
        "reference": t.reference, "subject": t.subject, "category": t.category, "status": t.status, "origin": t.origin,
        "tier": t.tier, "tier_label": t.get_tier_label(), "priority": t.priority, "target_hours": t.target_hours,
        "due_at": t.due_at, "overdue": bool(t.status == Ticket.Status.OPEN and t.due_at and t.due_at < now),
        "first_reply_at": t.first_reply_at, "solved_at": t.solved_at, "closed_at": t.closed_at,
        "rating": t.rating, "created_at": t.created_at, "updated_at": t.updated_at,
        "last_message_at": getattr(t, "last_message_at", None) or t.updated_at,
        "unread": getattr(t, "unread", 0) or 0,
        "request": {"reference": t.request.reference, "title": t.request.title} if t.request_id else None,
    }
    if viewer.is_developer:
        u = t.user
        row["user"] = {"id": u.pk, "full_name": u.full_name, "email": u.email, "avatar_url": avatar_url(u)}
    return row


def message_data(m: TicketMessage) -> dict:
    """The project conversation's message shape (charge/update/reactions empty)."""
    q = m.reply_to
    return {
        "id": m.pk, "kind": m.kind, "from_studio": m.sender.is_developer, "sender_name": m.sender.full_name,
        "sender_avatar": avatar_url(m.sender), "body": m.body, "data": m.data, "internal": m.internal,
        "attachment": {
            "id": m.pk, "original_name": m.original_name, "size": m.size, "is_voice": m.is_voice, "duration": m.duration,
            "created_at": m.created_at, "uploaded_by_developer": m.sender.is_developer, "url": f"/api/support/files/{m.pk}/",
        } if m.file else None,
        "reply_to": {"id": q.pk, "from_studio": q.sender.is_developer, "sender_name": q.sender.full_name, "body": q.body[:160],
                     "kind": "voice" if q.is_voice else "file" if q.file else q.kind} if q else None,
        "charge": None, "update": None, "reactions": [], "read_at": m.read_at, "created_at": m.created_at,
    }


def visible(qs, user):
    return qs if user.is_developer else qs.filter(user=user)


def unread_filter(user) -> Q:
    """Messages this reader hasn't seen: the other side's, never internal notes for the client."""
    if user.is_developer:
        return Q(messages__read_at__isnull=True) & ~Q(messages__sender__role="developer")
    return Q(messages__read_at__isnull=True) & Q(messages__sender__role="developer") & Q(messages__internal=False)


def get_ticket(user, reference) -> Ticket:
    ticket = visible(Ticket.objects.select_related("user", "request"), user).filter(reference=reference).first()
    if ticket is None:
        raise NotFound()
    return ticket


@api_view(["GET", "POST"])
@permission_classes([permissions.IsAuthenticated])
@parser_classes([JSONParser, MultiPartParser, FormParser])
@throttle_classes([UserRateThrottle, TicketThrottle])
def tickets(request):
    user = request.user
    if request.method == "POST":
        if user.is_developer:
            raise ValidationError({"detail": "Start a conversation from Studio → People."})
        project = None
        ref = (request.data.get("request") or "").strip()
        if ref:
            project = ProjectRequest.objects.filter(reference=ref, client=user).first()
        transcript = request.data.get("transcript") if isinstance(request.data.get("transcript"), list) else None
        ticket = service.open_ticket(
            request, request.data.get("subject", ""), request.data.get("body", ""), request.data.get("category", "question"),
            project=project, upload=request.FILES.get("file"), transcript=_clean_transcript(transcript),
            origin=Ticket.Origin.ASSISTANT if transcript else Ticket.Origin.CLIENT,
        )
        return Response(ticket_data(ticket, user), status=status.HTTP_201_CREATED)

    qs = visible(Ticket.objects.select_related("user", "request"), user).annotate(
        unread=Count("messages", filter=unread_filter(user)), last_message_at=Max("messages__created_at"),
    )
    wanted = request.query_params.get("status", "")
    if wanted == "active":
        qs = qs.filter(status__in=(Ticket.Status.OPEN, Ticket.Status.PENDING))
    elif wanted in Ticket.Status.values:
        qs = qs.filter(status=wanted)
    if user.is_developer:
        if request.query_params.get("tier"):
            qs = qs.filter(tier=request.query_params["tier"])
        q = request.query_params.get("q", "").strip()
        if q:
            qs = qs.filter(Q(subject__icontains=q) | Q(reference__iexact=q) | Q(user__full_name__icontains=q) | Q(user__email__icontains=q))
        if request.query_params.get("user"):
            qs = qs.filter(user_id=request.query_params["user"])
    # Overdue first, then the most deserving, then the soonest due; answered ones by last activity.
    rows = sorted(qs[:500], key=lambda t: (
        t.status not in (Ticket.Status.OPEN,), not (t.due_at and t.due_at < timezone.now()), t.priority,
        t.due_at or t.updated_at, -(t.last_message_at or t.updated_at).timestamp(),
    ))
    counts = visible(Ticket.objects.all(), user).aggregate(
        open=Count("pk", filter=Q(status=Ticket.Status.OPEN)), pending=Count("pk", filter=Q(status=Ticket.Status.PENDING)),
        overdue=Count("pk", filter=Q(status=Ticket.Status.OPEN, due_at__lt=timezone.now())),
    )
    return Response({"results": [ticket_data(t, user) for t in rows[:PAGE * 4]], "counts": counts})


def _clean_transcript(items) -> list | None:
    if not items:
        return None
    out = []
    for item in items[-20:]:
        if isinstance(item, dict) and item.get("role") in ("user", "assistant"):
            out.append({"role": item["role"], "text": str(item.get("text", ""))[:2000]})
    return out or None


@api_view(["GET"])
@permission_classes([permissions.IsAuthenticated])
def ticket_detail(request, reference):
    ticket = get_ticket(request.user, reference)
    return Response(ticket_data(ticket, request.user))


@api_view(["GET", "POST"])
@permission_classes([permissions.IsAuthenticated])
@parser_classes([JSONParser, MultiPartParser, FormParser])
@throttle_classes([UserRateThrottle, MessageThrottle])
def ticket_messages(request, reference):
    user = request.user
    ticket = get_ticket(user, reference)
    if request.method == "POST":
        reply_to = request.data.get("reply_to")
        message = service.post(
            request, ticket, request.data.get("body", ""), request.FILES.get("file"),
            voice=request.data.get("voice") in ("1", "true"), duration=request.data.get("duration"),
            internal=str(request.data.get("internal", "")).lower() in ("1", "true"),
            share=(request.data.get("share") or "").strip(), reply_to=int(reply_to) if str(reply_to or "").isdigit() else None,
        )
        return Response(message_data(message), status=status.HTTP_201_CREATED)
    msgs = ticket.messages.select_related("sender", "reply_to__sender")
    if not user.is_developer:
        msgs = msgs.filter(internal=False)
    if request.query_params.get("peek") != "1":
        unread = ticket.messages.filter(read_at__isnull=True)
        unread = unread.exclude(sender__role="developer") if user.is_developer else unread.filter(sender__role="developer", internal=False)
        now = timezone.now()
        seen = unread.update(read_at=now)
        from live.models import Notification

        Notification.objects.filter(user=user, read_at__isnull=True, path__contains=ticket.reference).update(read_at=now)
        if seen:
            service.push(ticket, "read")
    return Response([message_data(m) for m in msgs])


@api_view(["POST"])
@permission_classes([permissions.IsAuthenticated])
def ticket_status(request, reference):
    ticket = service.set_status(request, get_ticket(request.user, reference), str(request.data.get("status", "")))
    return Response(ticket_data(ticket, request.user))


@api_view(["POST"])
@permission_classes([permissions.IsAuthenticated])
def ticket_rate(request, reference):
    try:
        rating = int(request.data.get("rating", 0))
    except (TypeError, ValueError):
        rating = 0
    ticket = service.rate(request, get_ticket(request.user, reference), rating, str(request.data.get("note", "")))
    return Response(ticket_data(ticket, request.user))


@api_view(["POST"])
@permission_classes([IsDeveloper])
def start(request):
    user = get_object_or_404(User, pk=request.data.get("user"), is_active=True)
    if user.is_developer:
        raise ValidationError({"user": "That is the studio account."})
    ticket = service.start_conversation(request, user, request.data.get("subject", ""), request.data.get("body", ""))
    return Response(ticket_data(ticket, request.user), status=status.HTTP_201_CREATED)


@api_view(["GET"])
@permission_classes([permissions.IsAuthenticated])
def my_standing(request):
    """What this person can expect: their standing and the reply target that goes with it."""
    if request.user.is_developer:
        return Response({"tier": "studio", "label": "Studio", "hours": 0, "priority": 0})
    s = standing(request.user)
    return Response({"tier": s.tier, "label": s.label, "hours": s.hours, "priority": s.priority})


@api_view(["GET"])
@permission_classes([permissions.IsAuthenticated])
def ticket_file(request, message_id: int):
    message = get_object_or_404(TicketMessage.objects.select_related("ticket"), pk=message_id)
    if not message.file or (not request.user.is_developer and (message.ticket.user_id != request.user.pk or message.internal)):
        raise NotFound()
    return serve_private(message.file, message.original_name or "file")
