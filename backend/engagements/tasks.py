from celery import shared_task

from .lifecycle import tick


@shared_task
def lifecycle_tick():
    return tick()
