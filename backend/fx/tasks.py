from celery import shared_task

from .service import refresh


@shared_task
def refresh_rates():
    return {k: str(v) for k, v in refresh().items()}
