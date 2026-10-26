from django.contrib import admin

from .models import Review


@admin.register(Review)
class ReviewAdmin(admin.ModelAdmin):
    list_display = ("display_name", "rating", "status", "featured", "project_label", "created_at", "published_at")
    list_filter = ("status", "rating", "featured")
    search_fields = ("display_name", "body", "project_label")
    readonly_fields = ("engagement", "author", "created_at", "updated_at", "moderated_at")
