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
