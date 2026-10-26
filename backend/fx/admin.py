from django.contrib import admin

from .models import Rate


@admin.register(Rate)
class RateAdmin(admin.ModelAdmin):
    list_display = ("code", "dzd", "buy", "sell", "source", "fetched_at")
    readonly_fields = ("code", "dzd", "buy", "sell", "source", "fetched_at")

    def has_add_permission(self, request):
        return False  # filled by the refresh job; override in Site settings
