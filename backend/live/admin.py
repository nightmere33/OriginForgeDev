from django.contrib import admin

from .models import Notification


@admin.register(Notification)
class NotificationAdmin(admin.ModelAdmin):
    list_display = ("title", "user", "key", "created_at", "read_at")
    list_filter = ("key",)
    search_fields = ("title", "user__email")
