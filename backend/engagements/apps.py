from django.apps import AppConfig


class EngagementsConfig(AppConfig):
    name = "engagements"

    def ready(self):
        from . import capacity, queue  # noqa: F401  (signal)

        queue.connect()
