from django.apps import AppConfig


class LiveConfig(AppConfig):
    default_auto_field = "django.db.models.BigAutoField"
    name = "live"
    verbose_name = "Live updates & notifications"
