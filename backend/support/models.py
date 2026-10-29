"""
Support tickets (docs/SUPPORT.md): a question, a problem, billing, anything
outside a project's own conversation, for anyone with an account. Each
ticket carries the client's standing when it was opened (care plan, project,
newcomer), which sets its priority and how soon Younes replies.
"""

import secrets

from django.conf import settings
from django.db import models

from common.files import private_storage, private_upload_path

_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"


def new_reference() -> str:
    return "TK-" + "".join(secrets.choice(_ALPHABET) for _ in range(6))


class Ticket(models.Model):
    class Status(models.TextChoices):
        OPEN = "open", "Waiting for Younes"
        PENDING = "pending", "Waiting for the client"
        SOLVED = "solved", "Solved"
        CLOSED = "closed", "Closed"

    class Category(models.TextChoices):
        QUESTION = "question", "A question"
        PROBLEM = "problem", "Something isn't working"
        BILLING = "billing", "Payments and invoices"
        PROJECT = "project", "A project"
        OTHER = "other", "Something else"

    class Origin(models.TextChoices):
        CLIENT = "client", "Opened by the client"
        STUDIO = "studio", "Started by Younes"
        ASSISTANT = "assistant", "Handed over by the assistant"

    reference = models.CharField(max_length=12, unique=True, default=new_reference, editable=False)
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="tickets")
    subject = models.CharField(max_length=160)
    category = models.CharField(max_length=10, choices=Category.choices, default=Category.QUESTION)
    request = models.ForeignKey("engagements.ProjectRequest", on_delete=models.SET_NULL, null=True, blank=True, related_name="tickets")
    origin = models.CharField(max_length=10, choices=Origin.choices, default=Origin.CLIENT)
    status = models.CharField(max_length=8, choices=Status.choices, default=Status.OPEN, db_index=True)
    # The client's standing (support.tiers), refreshed at each of their messages.
    tier = models.CharField(max_length=12, default="newcomer")
    priority = models.PositiveSmallIntegerField(default=5, db_index=True)
    target_hours = models.PositiveSmallIntegerField(default=72)
    # When Younes's next reply is due; empty while the ball is in the client's court.
    due_at = models.DateTimeField(null=True, blank=True, db_index=True)
    overdue_notified_for = models.DateTimeField(null=True, blank=True)
    first_reply_at = models.DateTimeField(null=True, blank=True)
    last_client_at = models.DateTimeField(null=True, blank=True)
    last_studio_at = models.DateTimeField(null=True, blank=True)
    pending_reminded_at = models.DateTimeField(null=True, blank=True)
    solved_at = models.DateTimeField(null=True, blank=True)
    closed_at = models.DateTimeField(null=True, blank=True)
    rating = models.PositiveSmallIntegerField(null=True, blank=True, help_text="1 to 5, asked when solved")
    rating_note = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["priority", "due_at", "-updated_at"]

    def __str__(self):
        return f"{self.reference} · {self.subject}"

    def get_tier_label(self) -> str:
        from .tiers import TIERS

        return TIERS.get(self.tier, (5, self.tier))[1]


class TicketMessage(models.Model):
    """One message of a ticket. Internal notes are Younes's own and never reach the client."""

    class Kind(models.TextChoices):
        TEXT = "text", "Message"
        SHARE = "share", "Shared card (a slash command)"
        TRANSCRIPT = "transcript", "The assistant conversation it came from"
        EVENT = "event", "Status note"

    ticket = models.ForeignKey(Ticket, on_delete=models.CASCADE, related_name="messages")
    sender = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="+")
    kind = models.CharField(max_length=10, choices=Kind.choices, default=Kind.TEXT)
    body = models.TextField(blank=True)
    data = models.JSONField(default=dict, blank=True)
    internal = models.BooleanField(default=False)
    file = models.FileField(storage=private_storage, upload_to=private_upload_path("tickets"), blank=True)
    original_name = models.CharField(max_length=140, blank=True)
    size = models.PositiveBigIntegerField(default=0)
    is_voice = models.BooleanField(default=False)
    duration = models.PositiveIntegerField(null=True, blank=True)
    reply_to = models.ForeignKey("self", on_delete=models.SET_NULL, null=True, blank=True, related_name="+")
    read_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True, db_index=True)

    class Meta:
        ordering = ["created_at"]

    def __str__(self):
        return f"{self.ticket.reference} · {self.sender}"
