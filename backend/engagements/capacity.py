"""
Whether new requests are accepted right now (docs/BUSINESS_RULES.md §4):
the manual switch in the admin AND fewer active projects than the cap.
"""

from django.db.models.signals import post_delete, post_save
from django.dispatch import receiver

from content.models import SiteSettings
from content.revalidate import queue

from .models import Engagement

ACTIVE = (Engagement.Status.IN_DEVELOPMENT, Engagement.Status.CLIENT_REVIEW)


def active_projects() -> int:
    return Engagement.objects.filter(status__in=ACTIVE).count()


def status(site: SiteSettings | None = None) -> dict:
    site = site or SiteSettings.load()
    active = active_projects()
    full = bool(site.max_active_projects) and active >= site.max_active_projects
    return {"accepting": site.is_available and not full, "paused": not site.is_available, "full": full, "active": active}


def accepting() -> bool:
    return status()["accepting"]


@receiver(post_save, sender=Engagement)
@receiver(post_delete, sender=Engagement)
def capacity_may_have_changed(sender, instance, **kwargs):
    # A project starting or finishing can open or close the request form.
    if not kwargs.get("raw"):
        queue(["site"])
