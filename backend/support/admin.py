from django.contrib import admin

from .models import Ticket, TicketMessage


class MessageInline(admin.TabularInline):
    model = TicketMessage
    extra = 0
    fields = ("sender", "kind", "body", "internal", "created_at")
    readonly_fields = ("created_at",)


@admin.register(Ticket)
class TicketAdmin(admin.ModelAdmin):
    list_display = ("reference", "subject", "user", "tier", "status", "due_at", "created_at")
    list_filter = ("status", "tier", "category", "origin")
    search_fields = ("reference", "subject", "user__email", "user__full_name")
    inlines = [MessageInline]
