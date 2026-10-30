"""
Finished work feeds the portfolio: when a project goes live (and isn't under
NDA) an unpublished case study is drafted from it, ready for Younes to add
media and words in the admin and publish. Nothing goes public on its own.
"""

import logging

from django.utils import timezone
from django.utils.text import slugify

from .models import CaseStudy

logger = logging.getLogger("originforge.content")


def _unique_slug(base: str) -> str:
    base = slugify(base)[:40] or "project"
    slug, n = base, 2
    while CaseStudy.objects.filter(slug=slug).exists():
        slug, n = f"{base}-{n}", n + 1
    return slug


def draft_case_study(engagement) -> CaseStudy | None:
    if engagement.nda or engagement.request.wants_nda:
        return None
    existing = CaseStudy.objects.filter(source_engagement=engagement).first()
    if existing:
        return existing
    req = engagement.request
    proposal = req.proposals.filter(status="accepted").order_by("-version").first()
    study = CaseStudy.objects.create(
        source_engagement=engagement,
        slug=_unique_slug(req.title),
        published=False,
        order=999,
        title=req.title[:120],
        client_name=(req.client.company or "")[:120],
        year=timezone.now().year,
        tagline_en=(proposal.title if proposal else req.title)[:160],
        # The brief in the client's own words: a starting point, rewritten before publishing.
        summary_en=req.objectives,
        challenge_en=req.requirements,
        approach_en=proposal.scope if proposal else "",
    )
    from live.service import notify_studio_in_app

    notify_studio_in_app(
        "studio_case_study_draft",
        f"Case study drafted: {study.title}",
        f"{req.reference} went live. Add media and words in the admin, then publish it.",
        "",
    )
    logger.info("Drafted case study %s from %s", study.slug, req.reference)
    return study


# ── Published: the client hears about it ──────────────────────────────────
# Clients agree to be shown when they send the request ("Show it in the
# portfolio"); when Younes publishes their case study they get an e-mail and
# a notification with the link. Once per study (never again on a re-publish).

def _remember(sender, instance: CaseStudy, **kwargs):
    instance._was_published = bool(instance.pk) and CaseStudy.objects.filter(pk=instance.pk, published=True).exists()


def _announce(sender, instance: CaseStudy, created: bool, raw: bool = False, **kwargs):
    if raw or not instance.published or getattr(instance, "_was_published", False) or not instance.source_engagement_id:
        return
    from django.db import transaction

    from live.models import Notification
    from notifications.events import notify_client

    eng = instance.source_engagement
    client = eng.request.client
    path = f"/work/{instance.slug}"
    if not client.is_active or eng.nda or Notification.objects.filter(user=client, key="case_study_published", path=path).exists():
        return
    transaction.on_commit(lambda: notify_client("case_study_published", client, path, title=eng.request.title))


def connect():
    from django.db.models.signals import post_save, pre_save

    pre_save.connect(_remember, sender=CaseStudy, dispatch_uid="portfolio-remember")
    post_save.connect(_announce, sender=CaseStudy, dispatch_uid="portfolio-announce")
