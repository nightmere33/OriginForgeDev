"""
Ticket moves (docs/SUPPORT.md). Every change goes through here: the reply
clock, the statuses, the e-mails and in-app notices, and the live pushes
that keep both sides' screens current.

    open     waiting for Younes: due_at is when his reply is due
    pending  waiting for the client (Younes replied): the clock stops
    solved   done; a client reply reopens it, otherwise it closes after 72 h
    closed   read-only
"""

from datetime import timedelta

from django.core.exceptions import ValidationError as DjangoValidationError
from django.db import transaction
from django.utils import timezone
from rest_framework.exceptions import PermissionDenied, ValidationError

from audit.service import record
from common.files import validate_upload
from notifications.events import notify_client, notify_studio_event

from .models import Ticket, TicketMessage
from .tiers import standing

T = Ticket.Status
PENDING_REMINDER = timedelta(days=3)
PENDING_SOLVE = timedelta(days=7)
SOLVED_CLOSE = timedelta(hours=72)
# What a slash command may share (the page draws each card in its language).
SHARES = ("howto", "showreel", "start", "plans", "pay", "work")


def _studio_user():
    from django.contrib.auth import get_user_model

    return get_user_model().objects.filter(role="developer", is_active=True).order_by("pk").first()


def client_path(ticket) -> str:
    return f"/portal?ticket={ticket.reference}"


def studio_path(ticket) -> str:
    return f"/studio/support?ticket={ticket.reference}"


def push(ticket, action: str):
    from live.service import STUDIO, push as live_push, user_group

    live_push([user_group(ticket.user_id), STUDIO], {"type": "ticket", "reference": ticket.reference, "action": action})


def _preview(text: str) -> str:
    text = " ".join(text.split())
    return text[:140] + ("…" if len(text) > 140 else "")


def _attach(message: TicketMessage, upload, voice=False, duration=None):
    try:
        name = validate_upload(upload)
    except DjangoValidationError as exc:
        raise ValidationError({"file": exc.messages})
    message.file = upload
    message.original_name, message.size = name, upload.size
    message.is_voice = voice or (upload.content_type or "").startswith("audio/")
    message.duration = int(duration) if str(duration or "").isdigit() else None


def _restand(ticket):
    """The client's standing now: a newcomer who started a project moves up."""
    s = standing(ticket.user)
    ticket.tier, ticket.priority, ticket.target_hours = s.tier, s.priority, s.hours
    return s


def open_ticket(request, subject: str, body: str, category: str = "question", project=None, upload=None,
                transcript: list | None = None, origin: str = Ticket.Origin.CLIENT) -> Ticket:
    user = request.user
    subject, body = subject.strip(), body.strip()
    if not subject:
        raise ValidationError({"subject": "Give the ticket a subject."})
    if not body and upload is None:
        raise ValidationError({"body": "Say what you need."})
    if category not in Ticket.Category.values:
        category = Ticket.Category.QUESTION
    if project is not None and project.client_id != user.pk:
        raise ValidationError({"request": "That project isn't yours."})
    now = timezone.now()
    with transaction.atomic():
        ticket = Ticket(user=user, subject=subject[:160], category=category, request=project, origin=origin, last_client_at=now)
        s = _restand(ticket)
        ticket.due_at = now + timedelta(hours=s.hours)
        ticket.save()
        if transcript:
            TicketMessage.objects.create(ticket=ticket, sender=user, kind=TicketMessage.Kind.TRANSCRIPT,
                                         data={"messages": transcript[-20:]})
        message = TicketMessage(ticket=ticket, sender=user, body=body)
        if upload is not None:
            _attach(message, upload)
        message.save()
        record(request, "ticket.opened", ticket, tier=s.tier)
    notify_studio_event("studio_ticket", studio_path(ticket), subject=ticket.subject, client=user.full_name or user.email,
                        tier=s.label, hours=s.hours, preview=_preview(body))
    push(ticket, "opened")
    return ticket


def start_conversation(request, user, subject: str, body: str) -> Ticket:
    """Younes writes first (Studio → People): the ball is in the client's court."""
    if not request.user.is_developer:
        raise PermissionDenied()
    subject, body = subject.strip(), body.strip()
    if not subject or not body:
        raise ValidationError({"body": "Write a subject and a message."})
    now = timezone.now()
    with transaction.atomic():
        ticket = Ticket(user=user, subject=subject[:160], origin=Ticket.Origin.STUDIO, status=T.PENDING,
                        first_reply_at=now, last_studio_at=now)
        _restand(ticket)
        ticket.save()
        TicketMessage.objects.create(ticket=ticket, sender=request.user, body=body)
        record(request, "ticket.started", ticket, client=user.pk)
    notify_client("ticket_started", user, client_path(ticket), subject=ticket.subject, preview=_preview(body))
    push(ticket, "opened")
    return ticket


def post(request, ticket: Ticket, body: str = "", upload=None, voice=False, duration=None, internal=False,
         share: str = "", reply_to: int | None = None) -> TicketMessage:
    user = request.user
    studio = user.is_developer
    if not studio and ticket.user_id != user.pk:
        raise PermissionDenied()
    if ticket.status == T.CLOSED:
        raise ValidationError({"body": "This ticket is closed. Open a new one if you need anything else."})
    body = body.strip()
    if share and share not in SHARES:
        raise ValidationError({"share": "Unknown command."})
    if not body and upload is None and not share:
        raise ValidationError({"body": "Write a message or attach a file."})
    internal = internal and studio
    now = timezone.now()
    with transaction.atomic():
        ticket = Ticket.objects.select_for_update().get(pk=ticket.pk)
        quoted = ticket.messages.filter(pk=reply_to).first() if reply_to else None
        message = TicketMessage(ticket=ticket, sender=user, body=body, internal=internal, reply_to=quoted,
                                kind=TicketMessage.Kind.SHARE if share else TicketMessage.Kind.TEXT,
                                data={"share": share} if share else {})
        if upload is not None:
            _attach(message, upload, voice, duration)
        message.save()
        # An internal note moves nothing; a reply hands the ball to the other side.
        if not internal and studio:
            ticket.last_studio_at = now
            ticket.first_reply_at = ticket.first_reply_at or now
            if ticket.status == T.OPEN:
                ticket.status, ticket.due_at = T.PENDING, None
            ticket.pending_reminded_at = None
        elif not internal:
            s = _restand(ticket)
            ticket.last_client_at = now
            if ticket.status != T.OPEN or ticket.due_at is None:
                ticket.status, ticket.due_at = T.OPEN, now + timedelta(hours=s.hours)
            ticket.solved_at = None
        ticket.save()
    if not internal:
        preview = _preview(body or message.original_name or share)
        if studio:
            notify_client("ticket_reply", ticket.user, client_path(ticket), subject=ticket.subject, preview=preview)
        else:
            notify_studio_event("studio_ticket_reply", studio_path(ticket), subject=ticket.subject,
                                client=user.full_name or user.email, tier=ticket.get_tier_label(), preview=preview)
    push(ticket, "message")
    return message


def set_status(request, ticket: Ticket, status: str) -> Ticket:
    user = request.user
    allowed = T.values if user.is_developer else [T.SOLVED]
    if not user.is_developer and ticket.user_id != user.pk:
        raise PermissionDenied()
    if status not in allowed:
        raise ValidationError({"status": "Not possible."})
    if ticket.status == T.CLOSED and not user.is_developer:
        raise ValidationError({"status": "This ticket is closed."})
    now = timezone.now()
    ticket.status = status
    if status == T.SOLVED:
        ticket.solved_at, ticket.due_at = now, None
    elif status == T.CLOSED:
        ticket.closed_at, ticket.due_at = now, None
    elif status == T.OPEN:
        ticket.due_at = ticket.due_at or now + timedelta(hours=ticket.target_hours)
        ticket.solved_at = ticket.closed_at = None
    elif status == T.PENDING:
        ticket.due_at = None
    ticket.save()
    TicketMessage.objects.create(ticket=ticket, sender=user, kind=TicketMessage.Kind.EVENT, data={"status": status})
    record(request, f"ticket.{status}", ticket)
    if status == T.SOLVED and user.is_developer:
        notify_client("ticket_solved", ticket.user, client_path(ticket), subject=ticket.subject)
    push(ticket, "status")
    return ticket


def rate(request, ticket: Ticket, rating: int, note: str = "") -> Ticket:
    if ticket.user_id != request.user.pk:
        raise PermissionDenied()
    if ticket.status not in (T.SOLVED, T.CLOSED):
        raise ValidationError({"rating": "Rate it once it is solved."})
    if not 1 <= rating <= 5:
        raise ValidationError({"rating": "From 1 to 5."})
    ticket.rating, ticket.rating_note = rating, note.strip()[:1000]
    ticket.save(update_fields=["rating", "rating_note", "updated_at"])
    push(ticket, "rated")
    return ticket


def tick(now=None) -> dict:
    """Overdue alerts, reminders to clients who went quiet, and the automatic closes."""
    now = now or timezone.now()
    counts = {"overdue": 0, "reminded": 0, "auto_solved": 0, "closed": 0}
    for ticket in Ticket.objects.filter(status=T.OPEN, due_at__lt=now).select_related("user"):
        if ticket.overdue_notified_for == ticket.due_at:
            continue
        Ticket.objects.filter(pk=ticket.pk).update(overdue_notified_for=ticket.due_at)
        notify_studio_event("studio_ticket_overdue", studio_path(ticket), subject=ticket.subject,
                            client=ticket.user.full_name or ticket.user.email, tier=ticket.get_tier_label(), hours=ticket.target_hours)
        counts["overdue"] += 1
    for ticket in Ticket.objects.filter(status=T.PENDING, last_studio_at__lt=now - PENDING_REMINDER).select_related("user"):
        if ticket.last_studio_at < now - PENDING_SOLVE:
            Ticket.objects.filter(pk=ticket.pk).update(status=T.SOLVED, solved_at=now)
            TicketMessage.objects.create(ticket=ticket, sender=_studio_user() or ticket.user, kind=TicketMessage.Kind.EVENT,
                                         data={"status": "solved", "auto": True})
            push(ticket, "status")
            counts["auto_solved"] += 1
        elif ticket.pending_reminded_at is None:
            Ticket.objects.filter(pk=ticket.pk).update(pending_reminded_at=now)
            notify_client("ticket_pending_reminder", ticket.user, client_path(ticket), subject=ticket.subject)
            counts["reminded"] += 1
    for ticket in Ticket.objects.filter(status=T.SOLVED, solved_at__lt=now - SOLVED_CLOSE):
        Ticket.objects.filter(pk=ticket.pk).update(status=T.CLOSED, closed_at=now)
        push(ticket, "status")
        counts["closed"] += 1
    return counts

