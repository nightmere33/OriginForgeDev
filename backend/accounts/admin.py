from django.contrib import admin
from django.contrib.auth.admin import UserAdmin as BaseUserAdmin

from .models import User


@admin.register(User)
class UserAdmin(BaseUserAdmin):
    ordering = ("-date_joined",)
    list_display = ("email", "full_name", "role", "company", "email_verified_at", "date_joined")
    list_filter = ("role", "is_active", "is_staff")
    search_fields = ("email", "full_name", "company")
    fieldsets = (
        (None, {"fields": ("email", "password")}),
        ("Profile", {"fields": ("full_name", "company", "phone", "whatsapp", "country", "language")}),
        ("Access", {"fields": ("role", "is_active", "is_staff", "is_superuser", "email_verified_at")}),
        ("Dates", {"fields": ("last_login", "date_joined")}),
    )
    add_fieldsets = ((None, {"classes": ("wide",), "fields": ("email", "full_name", "password1", "password2")}),)


from .models import SocialAccount  # noqa: E402


@admin.register(SocialAccount)
class SocialAccountAdmin(admin.ModelAdmin):
    list_display = ("user", "provider", "email", "created_at", "last_login_at")
    list_filter = ("provider",)
    search_fields = ("email", "user__email", "uid")
    readonly_fields = ("user", "provider", "uid", "email", "created_at", "last_login_at")
