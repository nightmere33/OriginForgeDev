"""Who may review, and what happens when a review is written or moderated."""

from django.db import transaction
from django.db.models import Avg, Count
from django.utils import timezone
from rest_framework.exceptions import PermissionDenied, ValidationError

from audit.service import record
from engagements.models import Engagement
from notifications.events import notify_client, notify_studio_event

from .models import Review, ReviewInvite

# A review is about a delivered product.
REVIEWABLE = (Engagement.Status.LIVE, Engagement.Status.CLOSED)


def reviewable(user):
    """This client's delivered projects that have no review yet."""
    return (
        Engagement.objects.filter(request__client=user, status__in=REVIEWABLE, review__isnull=True)
        .select_related("request__service")
        .order_by("-production_at")
    )


def summary():
    """Published reviews only: count, average and how many of each star."""
    qs = Review.objects.filter(status=Review.Status.APPROVED)
    agg = qs.aggregate(count=Count("id"), average=Avg("rating"))
    stars = dict(qs.values_list("rating").annotate(n=Count("id")))
    return {
        "count": agg["count"],
        "average": round(agg["average"], 2) if agg["average"] is not None else None,
        "distribution": {str(k): stars.get(k, 0) for k in range(5, 0, -1)},
    }


def _label(eng: Engagement) -> str:
    service = eng.request.service
    return service.title_en if service else eng.request.title


def submit(request, engagement_id: int, data: dict) -> Review:
    user = request.user
    with transaction.atomic():
        eng = Engagement.objects.select_for_update().select_related("request__client", "request__service").filter(pk=engagement_id).first()
        # Someone else's project is simply not there.
        if not eng or eng.request.client_id != user.id:
            raise ValidationError({"engagement": "Project not found."})
        if eng.status not in REVIEWABLE:
            raise ValidationError({"engagement": "You can review a project once it is live."})
        if Review.objects.filter(engagement=eng).exists():
            raise ValidationError({"engagement": "You already reviewed this project."})
        review = Review.objects.create(
            engagement=eng, author=user, language=user.language if user.language in ("en", "fr") else "en",
            project_label=_label(eng), **data,
        )
        record(request, "review.submitted", eng.request, rating=review.rating)
    notify_studio_event("studio_review", "/studio/reviews", ref=eng.request.reference, client=user.full_name, stars="★" * review.rating)
    return review


def edit(request, review: Review, data: dict) -> Review:
    """The author may rework a review that is not published yet; it goes back to the queue."""
    if review.author_id != request.user.id:
        raise PermissionDenied()
    if review.status == Review.Status.APPROVED:
        raise ValidationError({"detail": "A published review can't be edited. Write to me if something changed."})
    for key, value in data.items():
        setattr(review, key, value)
    review.status, review.rejection_reason = Review.Status.PENDING, ""
    review.save()
    record(request, "review.edited", _target(review))
    return review


def moderate(request, review: Review, decision: str, reply: str = "", reason: str = "") -> Review:
    if decision not in ("approve", "reject", "unpublish"):
        raise ValidationError({"decision": "approve, reject or unpublish"})
    now = timezone.now()
    with transaction.atomic():
        review = Review.objects.select_for_update().select_related("engagement__request", "author", "case_study").get(pk=review.pk)
        review.reply = reply.strip()
        review.moderated_at = now
        if decision == "approve":
            review.status = Review.Status.APPROVED
            review.published_at = review.published_at or now
            review.rejection_reason = ""
        else:
            if decision == "reject" and not reason.strip():
                raise ValidationError({"reason": "Tell the client why, so they can fix it."})
            review.status = Review.Status.REJECTED
            review.rejection_reason = reason.strip()
            review.published_at = None
        review.save()
        record(request, f"review.{decision}", _target(review), review=review.pk)
    author = review.author
    if author and author.is_active:
        path = f"/portal/requests/{review.engagement.request.reference}" if review.engagement else "/portal/settings"
        if decision == "approve":
            notify_client("review_published", author, path, title=review.project_label)
        elif decision == "reject":
            notify_client("review_rejected", author, path, title=review.project_label, reason=review.rejection_reason)
    return review


def _target(review: Review):
    """What the audit log files a review under: its request, else its case study."""
    return review.engagement.request if review.engagement else (review.case_study or review)


def invite(request, *, email: str, full_name: str, case_study, language: str) -> ReviewInvite:
    """Ask a client from outside the platform for a review of this project."""
    from datetime import timedelta

    from notifications.events import notify_address

    inv = ReviewInvite.objects.create(
        email=email.lower().strip(), full_name=full_name.strip(), language=language if language in ("en", "fr") else "en",
        case_study=case_study, created_by=request.user, expires_at=timezone.now() + timedelta(days=ReviewInvite.VALID_DAYS),
    )
    record(request, "review.invited", case_study, email=inv.email)
    notify_address("review_invite_project", inv.email, inv.full_name, inv.language, f"/reviews/invite/{inv.token}",
                   project=case_study.title)
    return inv


def open_invite(token: str) -> ReviewInvite | None:
    inv = ReviewInvite.objects.select_related("case_study", "review").filter(token=token).first()
    if not inv or inv.used_at or inv.expires_at < timezone.now():
        return inv if inv and inv.used_at else None
    return inv


def submit_invited(request, token: str, data: dict) -> Review:
    user = request.user
    with transaction.atomic():
        inv = ReviewInvite.objects.select_for_update().select_related("case_study").filter(token=token).first()
        if not inv or inv.expires_at < timezone.now():
            raise ValidationError({"detail": "This invitation has expired. Write to me for a new one."})
        if inv.used_at:
            raise ValidationError({"detail": "This invitation was already used. Thank you!"})
        # Bound to the address it was sent to: someone else's link reviews nothing.
        if user.email.lower() != inv.email:
            raise PermissionDenied("This invitation was sent to another e-mail address.")
        review = Review.objects.create(
            case_study=inv.case_study, author=user, language=user.language if user.language in ("en", "fr") else inv.language,
            project_label=inv.case_study.title, **data,
        )
        inv.used_at, inv.review = timezone.now(), review
        inv.save(update_fields=["used_at", "review"])
        record(request, "review.submitted", inv.case_study, rating=review.rating)
    notify_studio_event("studio_review", "/studio/reviews", ref=inv.case_study.title, client=user.full_name, stars="★" * review.rating)
    return review
