from django.conf import settings
from django.db import models


class Notification(models.Model):
    """One in-app notification: the website twin of a lifecycle e-mail, delivered live."""

    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="notifications")
    key = models.CharField(max_length=60)
    title = models.CharField(max_length=200)
    body = models.TextField(blank=True)
    path = models.CharField(max_length=255, blank=True, help_text="Where it leads, without the language prefix")
    read_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True, db_index=True)

    class Meta:
        ordering = ["-created_at"]
        indexes = [models.Index(fields=["user", "read_at"])]

    def __str__(self):
        return f"{self.user} · {self.title}"
