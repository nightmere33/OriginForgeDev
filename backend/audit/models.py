from django.conf import settings
from django.db import models


class AuditLog(models.Model):
    """
    Append-only history of everything that matters: status moves, proposals,
    payments, file access, account events. Written by service functions at the
    point of the decision (not by model signals), so each row says *why*.
    """

    actor = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True, related_name="+",
    )
    action = models.CharField(max_length=64, db_index=True)
    target_type = models.CharField(max_length=64, blank=True, db_index=True)
    target_id = models.CharField(max_length=64, blank=True, db_index=True)
    target_label = models.CharField(max_length=255, blank=True)
    data = models.JSONField(default=dict, blank=True)
    ip = models.GenericIPAddressField(null=True, blank=True)
    user_agent = models.CharField(max_length=255, blank=True)
    created_at = models.DateTimeField(auto_now_add=True, db_index=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self):
        return f"{self.created_at:%Y-%m-%d %H:%M} {self.action} {self.target_label}"
