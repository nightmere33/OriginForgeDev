from django.apps import AppConfig


class ContentConfig(AppConfig):
    name = "content"

    def ready(self):
        from . import media_processing, revalidate  # noqa: F401  (connect their signals)
