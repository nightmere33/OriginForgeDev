from django.conf import settings
from django.core.validators import MaxValueValidator, MinValueValidator
from django.db import models


class Review(models.Model):
    """
    A verified review: only the client of a delivered project can write one,
    once per project, and nothing is public until Younes approves it.
    """

    class Status(models.TextChoices):
        PENDING = "pending", "Awaiting approval"
        APPROVED = "approved", "Published"
        REJECTED = "rejected", "Not published"

    engagement = models.OneToOneField("engagements.Engagement", on_delete=models.CASCADE, related_name="review")
    author = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, related_name="reviews")
    rating = models.PositiveSmallIntegerField(validators=[MinValueValidator(1), MaxValueValidator(5)])
    body = models.TextField(max_length=1500)
    # How the client chose to be shown ("Sam K.", "Founder, Dar El Bahia").
    display_name = models.CharField(max_length=80)
    display_role = models.CharField(max_length=120, blank=True)
    # What the project was, frozen when the review is written.
    project_label = models.CharField(max_length=160, blank=True)
    language = models.CharField(max_length=2, default="en")

    status = models.CharField(max_length=10, choices=Status.choices, default=Status.PENDING, db_index=True)
    reply = models.TextField(blank=True, help_text="Younes's public answer, shown under the review")
    rejection_reason = models.CharField(max_length=240, blank=True, help_text="Private, sent to the client")
    featured = models.BooleanField(default=False)
    published_at = models.DateTimeField(null=True, blank=True, db_index=True)
    moderated_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-featured", "-published_at", "-created_at"]

    def __str__(self):
        return f"{self.rating}★ {self.display_name} ({self.get_status_display()})"
