"""
Money, per project (BUSINESS_RULES.md §3.7, §3.9, §5).

  Charge        what the client owes and when: the deposit, a milestone, the balance,
                or an extra (a cost outside the contract, or an optional offer)
  Payment       money that moved (or is moving) against a charge, from any provider
  PaymentProof  a CCP / BaridiMob / cash receipt the client uploaded, waiting for
                Younes to look at it. Not a payment: a claim that one was made.
  Invoice       the numbered invoice issued for each paid payment (PDF on demand)
  WebhookEvent  raw provider callbacks, stored before they are interpreted

Amounts are whole units of the currency (DZD has no centimes in practice;
EUR/USD prices are quoted in whole units too).
"""

from django.conf import settings
from django.db import models

from common.files import private_storage, private_upload_path
from content.models import Currency


class Charge(models.Model):
    PAYMENT_WINDOW_DAYS = 5
    MAX_WINDOW_DAYS = 90
    # Reminders by the time left (days 2 and 4 of the usual five); a step only
    # counts when the window is longer than it, so a short one isn't nagged.
    REMINDER_LEFT = (7, 3, 1)

    class Kind(models.TextChoices):
        DEPOSIT = "deposit", "Deposit"
        MILESTONE = "milestone", "Milestone payment"
        BALANCE = "balance", "Final payment"
        EXTRA = "extra", "Extra cost"

    class Status(models.TextChoices):
        PROPOSED = "proposed", "Offered"
        SCHEDULED = "scheduled", "Scheduled"
        DUE = "due", "Due"
        PAID = "paid", "Paid"
        DECLINED = "declined", "Declined"
        EXPIRED = "expired", "Expired"
        VOID = "void", "Void"

    CONTRACT_KINDS = (Kind.DEPOSIT, Kind.MILESTONE, Kind.BALANCE)
    # What still stands between the project and going live.
    OPEN = (Status.SCHEDULED, Status.DUE)

    engagement = models.ForeignKey("engagements.Engagement", on_delete=models.CASCADE, related_name="charges")
    order = models.PositiveSmallIntegerField(default=0)
    kind = models.CharField(max_length=10, choices=Kind.choices)
    label = models.CharField(max_length=80)
    # Extras: what it pays for (AI credits, hosting, a feature), and whether
    # the client may decline it (an offer) or must pay it (a required cost).
    description = models.TextField(blank=True)
    optional = models.BooleanField(default=False)
    # An extra that buys more maintenance: paid, it extends the plan by this many days.
    extends_days = models.PositiveSmallIntegerField(default=0)
    percent = models.PositiveSmallIntegerField(default=0)
    amount = models.PositiveIntegerField()
    currency = models.CharField(max_length=3, choices=Currency.choices)
    status = models.CharField(max_length=10, choices=Status.choices, default=Status.SCHEDULED, db_index=True)
    due_from = models.DateTimeField(null=True, blank=True)
    due_at = models.DateTimeField(null=True, blank=True)
    reminders_sent = models.PositiveSmallIntegerField(default=0)
    answered_at = models.DateTimeField(null=True, blank=True, help_text="When the client accepted or declined an offer")
    paid_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True, null=True)

    class Meta:
        ordering = ["engagement", "order", "id"]

    def __str__(self):
        return f"{self.label} · {self.amount} {self.currency} ({self.status})"

    @property
    def is_extra(self) -> bool:
        return self.kind == self.Kind.EXTRA

    def can_pay_early(self) -> bool:
        """A scheduled part of the contract, once the deposit is in (the work has started)."""
        return self.status == self.Status.SCHEDULED and self.engagement.status in self.engagement.STARTED


class Payment(models.Model):
    class Provider(models.TextChoices):
        CASH = "cash", "Cash"
        CCP = "ccp", "CCP transfer"
        BARIDIMOB = "baridimob", "BaridiMob"
        CHARGILY = "chargily", "Card (Chargily)"
        PAYPAL = "paypal", "PayPal"
        USDT = "usdt", "USDT (BEP20)"

    class Status(models.TextChoices):
        PENDING = "pending", "Pending"
        PAID = "paid", "Paid"
        FAILED = "failed", "Failed"
        CANCELED = "canceled", "Canceled"
        EXPIRED = "expired", "Expired"
        REFUNDED = "refunded", "Refunded"

    charge = models.ForeignKey(Charge, on_delete=models.PROTECT, related_name="payments")
    provider = models.CharField(max_length=12, choices=Provider.choices)
    amount = models.PositiveIntegerField()
    currency = models.CharField(max_length=3, choices=Currency.choices)
    status = models.CharField(max_length=10, choices=Status.choices, default=Status.PENDING, db_index=True)
    provider_ref = models.CharField(max_length=120, blank=True, db_index=True)
    payload = models.JSONField(default=dict, blank=True)
    # Online payments (billing/online.py): what the provider is asked for (a
    # DZD charge paid through PayPal is quoted in USD), its page, and what it said.
    provider_amount = models.DecimalField(max_digits=12, decimal_places=2, null=True, blank=True)
    provider_currency = models.CharField(max_length=3, blank=True)
    checkout_url = models.URLField(max_length=600, blank=True)
    detail = models.CharField(max_length=300, blank=True, help_text="The provider's reason for a refusal or a hold")
    checked_at = models.DateTimeField(null=True, blank=True, help_text="Last time the provider was asked directly")
    confirmed_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True, related_name="+")
    paid_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]
        constraints = [
            models.UniqueConstraint(fields=["provider", "provider_ref"], condition=~models.Q(provider_ref=""),
                                    name="one_payment_per_provider_ref"),
        ]

    def __str__(self):
        return f"{self.get_provider_display()} {self.amount} {self.currency} ({self.status})"


class PaymentProof(models.Model):
    """
    A receipt for a manual payment, waiting for review. The image carries a
    real name and account number, so it is private and served only through
    an authorized view. Approving it creates the paid Payment.
    """

    class Method(models.TextChoices):
        CCP = "ccp", "CCP transfer"
        BARIDIMOB = "baridimob", "BaridiMob"
        CASH = "cash", "Cash handed over"
        USDT = "usdt", "USDT (BEP20)"

    class Status(models.TextChoices):
        PENDING = "pending", "Waiting for review"
        APPROVED = "approved", "Approved"
        REJECTED = "rejected", "Rejected"

    charge = models.ForeignKey(Charge, on_delete=models.CASCADE, related_name="proofs")
    client = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="payment_proofs")
    method = models.CharField(max_length=10, choices=Method.choices)
    receipt = models.FileField(storage=private_storage, upload_to=private_upload_path("receipts"), blank=True)
    receipt_name = models.CharField(max_length=140, blank=True)
    payer_name = models.CharField(max_length=120, blank=True, help_text="When someone else paid at the counter")
    transfer_reference = models.CharField(max_length=60, blank=True)
    # USDT: the on-chain transaction, and the quote the client paid against.
    tx_hash = models.CharField(max_length=80, blank=True)
    crypto_amount = models.DecimalField(max_digits=18, decimal_places=2, null=True, blank=True, help_text="USDT expected")
    crypto_rate = models.DecimalField(max_digits=12, decimal_places=4, null=True, blank=True, help_text="DZD per USDT at submission")
    note = models.CharField(max_length=500, blank=True)
    status = models.CharField(max_length=10, choices=Status.choices, default=Status.PENDING, db_index=True)
    reviewer = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True, related_name="+")
    reviewed_at = models.DateTimeField(null=True, blank=True)
    review_note = models.CharField(max_length=500, blank=True, help_text="Required when rejecting")
    payment = models.OneToOneField(Payment, on_delete=models.SET_NULL, null=True, blank=True, related_name="proof")
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]
        constraints = [
            # One transaction pays one charge (a rejected claim frees it).
            models.UniqueConstraint(fields=["tx_hash"], condition=~models.Q(tx_hash="") & ~models.Q(status="rejected"),
                                    name="one_proof_per_tx_hash"),
        ]

    def __str__(self):
        return f"{self.get_method_display()} for {self.charge} ({self.status})"

    @property
    def explorer_url(self) -> str:
        return f"https://bscscan.com/tx/{self.tx_hash}" if self.tx_hash else ""


class InvoiceSequence(models.Model):
    """The last invoice number used per year: numbers follow each other with no gap."""

    year = models.PositiveSmallIntegerField(primary_key=True)
    last = models.PositiveIntegerField(default=0)


class Invoice(models.Model):
    """
    One per paid payment, numbered OF-<year>-<0001>. The seller and buyer are
    copied in when it is issued, so later edits to the settings or to the
    client's account never change an invoice already sent.
    """

    number = models.CharField(max_length=20, unique=True)
    payment = models.OneToOneField(Payment, on_delete=models.PROTECT, related_name="invoice")
    charge = models.ForeignKey(Charge, on_delete=models.PROTECT, related_name="invoices")
    issued_at = models.DateTimeField()
    label = models.CharField(max_length=160)
    description = models.TextField(blank=True)
    amount = models.PositiveIntegerField()
    currency = models.CharField(max_length=3, choices=Currency.choices)
    method = models.CharField(max_length=40)
    language = models.CharField(max_length=2, default="en")
    seller = models.JSONField(default=dict)
    buyer = models.JSONField(default=dict)
    pdf = models.FileField(storage=private_storage, upload_to=private_upload_path("invoices"), blank=True)
    emailed_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ["-issued_at"]

    def __str__(self):
        return f"{self.number} · {self.amount} {self.currency}"


class WebhookEvent(models.Model):
    """Provider callbacks, persisted before handling so nothing is ever lost."""

    provider = models.CharField(max_length=12)
    event_id = models.CharField(max_length=120)
    event_type = models.CharField(max_length=60, blank=True)
    payload = models.JSONField()
    processed_at = models.DateTimeField(null=True, blank=True)
    error = models.TextField(blank=True)
    received_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        constraints = [models.UniqueConstraint(fields=["provider", "event_id"], name="one_event_per_provider")]
