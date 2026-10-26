"""Who may review, and what happens when a review is written or moderated."""

from django.db import transaction
from django.db.models import Avg, Count
from django.utils import timezone
from rest_framework.exceptions import PermissionDenied, ValidationError

from audit.service import record
from engagements.models import Engagement
from notifications.events import notify_client, notify_studio_event

from .models import Review

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
    record(request, "review.edited", review.engagement.request)
    return review


def moderate(request, review: Review, decision: str, reply: str = "", reason: str = "") -> Review:
    if decision not in ("approve", "reject", "unpublish"):
        raise ValidationError({"decision": "approve, reject or unpublish"})
    now = timezone.now()
    with transaction.atomic():
        review = Review.objects.select_for_update().select_related("engagement__request", "author").get(pk=review.pk)
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
        record(request, f"review.{decision}", review.engagement.request, review=review.pk)
    author = review.author
    if author and author.is_active:
        path = f"/portal/requests/{review.engagement.request.reference}"
        if decision == "approve":
            notify_client("review_published", author, path, title=review.project_label)
        elif decision == "reject":
            notify_client("review_rejected", author, path, title=review.project_label, reason=review.rejection_reason)
    return review
