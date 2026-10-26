"""
On-demand ISR: when public content changes, tell Next.js which cache tags are
stale. Tags mirror the ones set in frontend/src/lib/content.ts.
"""

import logging
import threading

import httpx
from celery import shared_task
from django.conf import settings
from django.db import transaction
from django.db.models.signals import post_delete, post_save
from django.dispatch import receiver

from .models import (
    FAQ, CarePlan, CaseStudy, CaseStudyMedia, Credential, PricingChoice, PricingFactor, Service, ServicePrice,
    SiteSettings, Tech, Testimonial,
)

logger = logging.getLogger("originforge.content")


@shared_task(bind=True, max_retries=5, default_retry_delay=30)
def revalidate_task(self, tags: list[str]):
    if not (settings.NEXT_REVALIDATE_URL and settings.NEXT_REVALIDATE_SECRET):
        return
    try:
        httpx.post(
            settings.NEXT_REVALIDATE_URL,
            json={"tags": tags},
            headers={"x-revalidate-secret": settings.NEXT_REVALIDATE_SECRET},
            timeout=httpx.Timeout(10.0, connect=2.0),
        ).raise_for_status()
    except httpx.HTTPError as exc:
        logger.warning("Next.js revalidation of %s failed: %s", tags, exc)
        if not settings.CELERY_TASK_ALWAYS_EAGER:
            raise self.retry(exc=exc)


def tags_for(instance) -> list[str]:
    if isinstance(instance, CaseStudy):
        return ["work", f"work:{instance.slug}", "galaxy"]
    if isinstance(instance, CaseStudyMedia):
        return ["work", f"work:{instance.case_study.slug}", "galaxy"]
    return {
        SiteSettings: ["site"],
        Service: ["services"],
        ServicePrice: ["services"],
        Tech: ["tech"],
        Testimonial: ["testimonials"],
        FAQ: ["faqs"],
        Credential: ["credentials"],
        CarePlan: ["plans"],
        PricingFactor: ["pricing"],
        PricingChoice: ["pricing"],
    }.get(type(instance), [])


# Tags touched by the current transaction. A bulk edit (an admin inline, the
# seed command) saves dozens of rows; they leave as one ping on commit.
_pending = threading.local()


def _flush():
    tags = sorted(getattr(_pending, "tags", set()))
    _pending.tags = set()
    if tags:
        revalidate_task.delay(tags)


def queue(tags: list[str]):
    """Mark tags stale; sent once when the current transaction commits.

    Tags are recorded before the flush is registered: outside a transaction
    on_commit runs at once. Every call registers a flush; the first one to run
    drains the set, the others find it empty, so a bulk edit is still one ping
    and a rolled-back transaction can never leave the queue stuck.
    """
    if not tags:
        return
    pending = getattr(_pending, "tags", None)
    if pending is None:
        pending = _pending.tags = set()
    pending.update(tags)
    transaction.on_commit(_flush)


@receiver(post_save)
@receiver(post_delete)
def on_content_change(sender, instance, **kwargs):
    if sender._meta.app_label != "content" or kwargs.get("raw"):
        return
    queue(tags_for(instance))
