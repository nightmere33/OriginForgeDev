from django.apps import AppConfig


class ContentConfig(AppConfig):
    name = "content"

    def ready(self):
        from . import media_processing, portfolio, revalidate  # noqa: F401  (connect their signals)

        portfolio.connect()
