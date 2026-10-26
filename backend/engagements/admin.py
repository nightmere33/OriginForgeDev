from django.contrib import admin

from .models import Attachment, ProjectRequest


class AttachmentInline(admin.TabularInline):
    model = Attachment
    extra = 0
    fields = ("original_name", "size", "uploaded_by", "created_at")
    readonly_fields = fields
    can_delete = False


@admin.register(ProjectRequest)
class ProjectRequestAdmin(admin.ModelAdmin):
    list_display = ("reference", "title", "client", "service", "status", "created_at")
    list_filter = ("status", "service")
    search_fields = ("reference", "title", "client__email", "client__full_name")
    # Status is read-only here on purpose: moves go through the studio so
    # they are audited and the client is told.
    readonly_fields = ("reference", "status", "created_at", "updated_at")
    inlines = (AttachmentInline,)
