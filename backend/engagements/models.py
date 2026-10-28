import secrets
import uuid

from django.conf import settings
from django.db import models

from common.files import private_storage, private_upload_path
from content.models import Currency

# No 0/O or 1/I/L: references are read aloud on calls and typed from e-mails.
_REF_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"


def new_reference() -> str:
    return "OF-" + "".join(secrets.choice(_REF_ALPHABET) for _ in range(6))


class ProjectRequest(models.Model):
    """
    The first step of the client lifecycle: what someone wants built.

    Status only moves through `engagements.services.transition`, which checks
    who may make the move, records it in the audit log and tells the other
    side. Nothing else should assign `status`.
    """

    class Status(models.TextChoices):
        DRAFT = "draft", "Draft"
        SUBMITTED = "submitted", "Submitted"
        IN_REVIEW = "in_review", "In review"
        CLARIFICATION = "clarification", "Needs clarification"
        PROPOSAL_SENT = "proposal_sent", "Proposal sent"
        ACCEPTED = "accepted", "Accepted"
        DECLINED = "declined", "Declined"
        WITHDRAWN = "withdrawn", "Withdrawn"
        EXPIRED = "expired", "Expired"
        ARCHIVED = "archived", "Archived"

    OPEN_STATUSES = (Status.SUBMITTED, Status.IN_REVIEW, Status.CLARIFICATION, Status.PROPOSAL_SENT)

    reference = models.CharField(max_length=12, unique=True, default=new_reference, editable=False)
    client = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="project_requests")
    service = models.ForeignKey("content.Service", on_delete=models.SET_NULL, null=True, blank=True)
    title = models.CharField(max_length=160)
    objectives = models.TextField(help_text="What the project must achieve")
    requirements = models.TextField(blank=True)
    features = models.JSONField(default=list, blank=True)
    # The service's own questions (kind of film, pages, platforms...): answer
    # keys and values as the request form defines them per service.
    brief = models.JSONField(default=dict, blank=True)
    budget_min = models.PositiveIntegerField(null=True, blank=True)
    budget_max = models.PositiveIntegerField(null=True, blank=True)
    budget_currency = models.CharField(max_length=3, choices=Currency.choices, default=Currency.EUR)
    deadline = models.DateField(null=True, blank=True)
    deadline_flexible = models.BooleanField(default=True)
    reference_links = models.TextField(blank=True, help_text="One URL per line")
    language = models.CharField(max_length=2, default="en")
    # What the client picked in the calculator, and the estimate it showed.
    plan = models.ForeignKey("content.CarePlan", on_delete=models.SET_NULL, null=True, blank=True)
    options = models.JSONField(default=dict, blank=True)
    estimate_low = models.PositiveIntegerField(null=True, blank=True)
    estimate_high = models.PositiveIntegerField(null=True, blank=True)
    estimate_currency = models.CharField(max_length=3, blank=True)
    wants_nda = models.BooleanField(default=False, help_text="Keep this project out of the portfolio")
    # The queue (engagements/queue.py): when the request joined it, and when
    # it left it (its turn came, or the studio took it straight away).
    queued_at = models.DateTimeField(null=True, blank=True, db_index=True)
    queue_left_at = models.DateTimeField(null=True, blank=True)
    review_reminded_at = models.DateTimeField(null=True, blank=True)

    status = models.CharField(max_length=20, choices=Status.choices, default=Status.SUBMITTED, db_index=True)
    status_note = models.TextField(blank=True, help_text="Shown to the client with the last status change")
    created_at = models.DateTimeField(auto_now_add=True, db_index=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-created_at"]
        indexes = [models.Index(fields=["client", "-created_at"]), models.Index(fields=["status", "-created_at"])]

    def __str__(self):
        return f"{self.reference} · {self.title}"

    @property
    def is_open(self) -> bool:
        return self.status in self.OPEN_STATUSES


class Attachment(models.Model):
    """A private file a client (or Younes) attached to a request."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    request = models.ForeignKey(ProjectRequest, on_delete=models.CASCADE, related_name="attachments")
    uploaded_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="+")
    file = models.FileField(storage=private_storage, upload_to=private_upload_path("requests"))
    original_name = models.CharField(max_length=140)
    size = models.PositiveBigIntegerField()
    # Voice notes posted in the conversation.
    is_voice = models.BooleanField(default=False)
    duration = models.PositiveIntegerField(null=True, blank=True, help_text="Seconds, for voice notes")
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["created_at"]

    def __str__(self):
        return self.original_name


class Proposal(models.Model):
    """
    One version of the price discussion (BUSINESS_RULES.md §3.5). Never edited
    after it is sent: a change is a new version. Offers come from Younes,
    counter-offers from the client; at most three versions per request.
    """

    MAX_VERSIONS = 3
    VALID_DAYS = 14

    class Kind(models.TextChoices):
        OFFER = "offer", "Offer"
        COUNTER = "counter", "Counter-offer"

    class Status(models.TextChoices):
        SENT = "sent", "Awaiting answer"
        ACCEPTED = "accepted", "Accepted"
        DECLINED = "declined", "Declined"
        COUNTERED = "countered", "Countered"
        SUPERSEDED = "superseded", "Replaced"
        EXPIRED = "expired", "Expired"

    request = models.ForeignKey(ProjectRequest, on_delete=models.CASCADE, related_name="proposals")
    version = models.PositiveSmallIntegerField()
    kind = models.CharField(max_length=10, choices=Kind.choices, default=Kind.OFFER)
    status = models.CharField(max_length=12, choices=Status.choices, default=Status.SENT, db_index=True)
    author = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="+")

    title = models.CharField(max_length=160)
    scope = models.TextField()
    deliverables = models.TextField(blank=True, help_text="One per line")
    exclusions = models.TextField(blank=True, help_text="One per line: what is not included")
    note = models.TextField(blank=True, help_text="Message that comes with this version")

    price = models.PositiveIntegerField()
    currency = models.CharField(max_length=3, choices=Currency.choices)
    plan = models.ForeignKey("content.CarePlan", on_delete=models.PROTECT, related_name="+")
    # Plan terms are copied in: later admin edits never change a sent proposal.
    plan_name = models.CharField(max_length=60)
    maintenance_days = models.PositiveSmallIntegerField()
    revision_rounds = models.PositiveSmallIntegerField()
    reply_hours = models.PositiveSmallIntegerField()

    deposit_percent = models.PositiveSmallIntegerField()
    schedule = models.JSONField(default=list, help_text="List of {label, percent}; the first entry is the deposit")
    timeline_days = models.PositiveSmallIntegerField()
    milestones = models.JSONField(default=list, help_text="List of {title, days}")
    nda = models.BooleanField(default=False)

    expires_at = models.DateTimeField()
    responded_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["request", "version"]
        constraints = [models.UniqueConstraint(fields=["request", "version"], name="one_version_number_per_request")]

    def __str__(self):
        return f"{self.request.reference} v{self.version} · {self.price} {self.currency} ({self.status})"


class Contract(models.Model):
    """The agreement generated from the accepted proposal, signed online (§3.6)."""

    class Status(models.TextChoices):
        PENDING = "pending", "Awaiting signature"
        SIGNED = "signed", "Signed"
        VOID = "void", "Void"

    proposal = models.OneToOneField(Proposal, on_delete=models.PROTECT, related_name="contract")
    request = models.ForeignKey(ProjectRequest, on_delete=models.CASCADE, related_name="contracts")
    language = models.CharField(max_length=2, default="en")
    body = models.TextField()
    sha256 = models.CharField(max_length=64)
    status = models.CharField(max_length=10, choices=Status.choices, default=Status.PENDING)
    signer = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT, null=True, blank=True, related_name="+")
    signed_name = models.CharField(max_length=150, blank=True)
    signed_at = models.DateTimeField(null=True, blank=True)
    ip = models.GenericIPAddressField(null=True, blank=True)
    user_agent = models.CharField(max_length=255, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"Contract {self.request.reference} ({self.status})"


class Engagement(models.Model):
    """The project once a contract is signed: deposit, build, review, launch, care."""

    class Status(models.TextChoices):
        AWAITING_DEPOSIT = "awaiting_deposit", "Awaiting deposit"
        IN_DEVELOPMENT = "in_development", "In development"
        CLIENT_REVIEW = "client_review", "Ready for your review"
        AWAITING_BALANCE = "awaiting_balance", "Awaiting final payment"
        LIVE = "live", "Live, in maintenance"
        CLOSED = "closed", "Closed"
        ON_HOLD = "on_hold", "On hold"
        CANCELLED = "cancelled", "Cancelled"
        EXPIRED = "expired", "Expired (deposit not received)"

    ACTIVE = (Status.IN_DEVELOPMENT, Status.CLIENT_REVIEW, Status.AWAITING_BALANCE)

    request = models.OneToOneField(ProjectRequest, on_delete=models.CASCADE, related_name="engagement")
    contract = models.OneToOneField(Contract, on_delete=models.PROTECT, related_name="engagement")
    client = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="engagements")
    title = models.CharField(max_length=160)
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.AWAITING_DEPOSIT, db_index=True)
    price = models.PositiveIntegerField()
    currency = models.CharField(max_length=3, choices=Currency.choices)
    plan_name = models.CharField(max_length=60)
    maintenance_days = models.PositiveSmallIntegerField()
    revision_rounds = models.PositiveSmallIntegerField()
    revisions_used = models.PositiveSmallIntegerField(default=0)
    timeline_days = models.PositiveSmallIntegerField()
    nda = models.BooleanField(default=False)
    started_at = models.DateTimeField(null=True, blank=True)
    deadline = models.DateField(null=True, blank=True)
    production_at = models.DateTimeField(null=True, blank=True)
    maintenance_ends_at = models.DateTimeField(null=True, blank=True)
    closed_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self):
        return f"{self.request.reference} · {self.title} ({self.status})"


class Milestone(models.Model):
    class Status(models.TextChoices):
        PLANNED = "planned", "Planned"
        ACTIVE = "active", "In progress"
        REVIEW = "review", "Waiting for your approval"
        APPROVED = "approved", "Approved"
        CHANGES = "changes", "Changes requested"

    engagement = models.ForeignKey(Engagement, on_delete=models.CASCADE, related_name="milestones")
    order = models.PositiveSmallIntegerField(default=0)
    title = models.CharField(max_length=160)
    description = models.TextField(blank=True)
    due_date = models.DateField(null=True, blank=True)
    status = models.CharField(max_length=10, choices=Status.choices, default=Status.PLANNED)
    client_note = models.TextField(blank=True)
    approved_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ["order", "id"]

    def __str__(self):
        return self.title


class Task(models.Model):
    """A unit of work the client can watch, with an estimated finish time."""

    class Status(models.TextChoices):
        TODO = "todo", "To do"
        DOING = "doing", "In progress"
        DONE = "done", "Done"

    engagement = models.ForeignKey(Engagement, on_delete=models.CASCADE, related_name="tasks")
    milestone = models.ForeignKey(Milestone, on_delete=models.SET_NULL, null=True, blank=True, related_name="tasks")
    order = models.PositiveSmallIntegerField(default=0)
    title = models.CharField(max_length=160)
    status = models.CharField(max_length=6, choices=Status.choices, default=Status.TODO)
    eta = models.DateTimeField(null=True, blank=True, help_text="Estimated finish")
    done_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ["order", "id"]

    def __str__(self):
        return self.title


class ProgressUpdate(models.Model):
    engagement = models.ForeignKey(Engagement, on_delete=models.CASCADE, related_name="updates")
    author = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="+")
    title = models.CharField(max_length=160)
    body = models.TextField(blank=True)
    attachments = models.ManyToManyField(Attachment, blank=True, related_name="updates")
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self):
        return self.title


class Message(models.Model):
    """The project conversation: text, files and voice notes, from request to closure."""

    request = models.ForeignKey(ProjectRequest, on_delete=models.CASCADE, related_name="messages")
    sender = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="+")
    body = models.TextField(blank=True)
    attachment = models.OneToOneField(Attachment, on_delete=models.SET_NULL, null=True, blank=True, related_name="message")
    read_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True, db_index=True)

    class Meta:
        ordering = ["created_at"]

    def __str__(self):
        return f"{self.request.reference} · {self.sender}"


class WaitlistEntry(models.Model):
    """Visitors who arrived while requests were paused (§4); told first on reopening."""

    email = models.EmailField()
    full_name = models.CharField(max_length=150, blank=True)
    service = models.ForeignKey("content.Service", on_delete=models.SET_NULL, null=True, blank=True)
    note = models.CharField(max_length=500, blank=True)
    language = models.CharField(max_length=2, default="en")
    notified_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["created_at"]
        verbose_name_plural = "waiting list"

    def __str__(self):
        return self.email
