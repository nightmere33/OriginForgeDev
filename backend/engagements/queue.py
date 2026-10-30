"""
The request queue: nobody is turned away when the studio is full; they wait
their turn, see where they stand, and are told when it comes.

Lanes. Each service either shares the studio's limit (Site settings,
`max_active_projects`), has a limit of its own (`Service.max_active`), or is
taken directly (`Service.accept_directly`, e.g. films) and never queues.

A lane is full when its places are taken: projects awaiting their deposit,
in development or in client review, plus requests released from the queue
that haven't started yet (their place is held). Pausing starts in Site
settings fills every lane. A request submitted to a full lane, or to a lane
where others already wait, joins the queue (first come, first served).

When a place frees (a project ships, a request is declined, withdrawn or
expires), the head of the queue is released: the client hears it is their
turn, the studio that they're next. Younes can also take a request straight
away, put it back, or move it up or down.

Positions and estimated starts are computed on demand from the projects in
progress (their deadlines, or start plus timeline) and the queue ahead
(proposal timelines, or each service's typical length).
"""

import heapq
from dataclasses import dataclass
from datetime import date, timedelta

from django.db import transaction
from django.db.models import Q
from django.utils import timezone

from content.models import Service, SiteSettings

from .models import Engagement, ProjectRequest

R = ProjectRequest.Status
E = Engagement.Status
OCCUPYING = (E.AWAITING_DEPOSIT, E.IN_DEVELOPMENT, E.CLIENT_REVIEW)
WAITING = (R.SUBMITTED, R.IN_REVIEW, R.CLARIFICATION, R.PROPOSAL_SENT, R.ACCEPTED)
STUDIO = "studio"


def lane_of(service: Service | None) -> str | None:
    """None: taken directly, never queued."""
    if service is None:
        return STUDIO
    if service.accept_directly:
        return None
    return f"service:{service.slug}" if service.max_active is not None else STUDIO


def _lane_q(lane: str, prefix: str = "") -> Q:
    """Requests (or, with a prefix, rows pointing to them) in a lane."""
    if lane == STUDIO:
        return Q(**{f"{prefix}service__isnull": True}) | Q(
            **{f"{prefix}service__accept_directly": False, f"{prefix}service__max_active__isnull": True}
        )
    return Q(**{f"{prefix}service__slug": lane.split(":", 1)[1], f"{prefix}service__accept_directly": False})


def capacity(lane: str, site: SiteSettings | None = None) -> int:
    """Places in the lane; 0 = no limit."""
    if lane == STUDIO:
        return (site or SiteSettings.load()).max_active_projects
    service = Service.objects.filter(slug=lane.split(":", 1)[1]).first()
    return service.max_active or 0 if service else 0


def _occupying(lane: str):
    """Places taken: projects in progress or review, and signed ones awaiting a
    deposit that came straight in or were let through (a signed project still
    waiting its turn stays in the queue)."""
    in_line = Q(request__queued_at__isnull=False, request__queue_left_at__isnull=True)
    return (Engagement.objects.filter(_lane_q(lane, "request__"), status__in=OCCUPYING)
            .exclude(Q(status=E.AWAITING_DEPOSIT) & in_line).select_related("request"))


def _reserved(lane: str):
    """Released from the queue, not started yet: their place is held."""
    # Once signed, the project itself holds the place (or, live or over, frees it).
    return ProjectRequest.objects.filter(
        _lane_q(lane), queued_at__isnull=False, queue_left_at__isnull=False, status__in=WAITING, engagement__isnull=True,
    )


def waiting(lane: str):
    """
    The queue, head first: requests not yet started, answered or not. One that
    Younes answered and the client signed keeps its place until its deposit
    is paid (then it starts) or it lapses; a live project is never "#2".
    """
    not_started = Q(engagement__isnull=True) | Q(engagement__status=E.AWAITING_DEPOSIT)
    return (ProjectRequest.objects.filter(_lane_q(lane), not_started, queued_at__isnull=False, queue_left_at__isnull=True,
                                          status__in=WAITING)
            .select_related("service").order_by("queued_at", "id"))


def is_waiting(req: ProjectRequest) -> bool:
    lane = lane_of(req.service)
    return bool(lane) and waiting(lane).filter(pk=req.pk).exists()


def used(lane: str) -> int:
    return _occupying(lane).count() + _reserved(lane).count()


def is_full(lane: str, site: SiteSettings | None = None) -> bool:
    site = site or SiteSettings.load()
    if not site.is_available:
        return True
    cap = capacity(lane, site)
    return bool(cap) and used(lane) >= cap


def _duration(req: ProjectRequest) -> int:
    proposal = req.proposals.order_by("-version").first()
    if proposal and proposal.timeline_days:
        return proposal.timeline_days
    return req.service.typical_days if req.service else 21


def _ends(lane: str, today: date) -> list[date]:
    """When each taken place frees up (never before today)."""
    ends = []
    for eng in _occupying(lane):
        if eng.deadline:
            end = eng.deadline
        elif eng.started_at:
            end = eng.started_at.date() + timedelta(days=eng.timeline_days)
        else:  # awaiting its deposit: the whole timeline is still ahead
            end = today + timedelta(days=eng.timeline_days)
        ends.append(max(today + timedelta(days=1), end))
    for req in _reserved(lane):
        ends.append(today + timedelta(days=_duration(req)))
    return ends


@dataclass
class Spot:
    lane: str | None
    position: int | None  # 1 = next; None = not waiting
    start: date | None  # estimated start; None = as soon as agreed
    full: bool
    active: int
    capacity: int
    ahead: int


def _simulate(lane: str, ahead: list[ProjectRequest], site: SiteSettings) -> date | None:
    """Earliest free place once everyone ahead has had theirs."""
    today = timezone.localdate()
    cap = capacity(lane, site)
    floor = site.available_from if not site.is_available and site.available_from and site.available_from > today else today
    if not cap and site.is_available:
        return None
    slots = _ends(lane, today)
    if cap:
        slots += [today] * max(0, cap - len(slots))
    slots = [max(floor, s) for s in slots] or [floor]
    heapq.heapify(slots)
    for req in ahead:
        free = heapq.heappop(slots)
        heapq.heappush(slots, free + timedelta(days=_duration(req)))
    start = slots[0]
    return start if start > today else None


def spot(req: ProjectRequest, site: SiteSettings | None = None) -> Spot:
    """Where a request stands (its position and estimated start)."""
    site = site or SiteSettings.load()
    lane = lane_of(req.service)
    if lane is None:
        return Spot(None, None, None, False, 0, 0, 0)
    queue = list(waiting(lane))
    cap = capacity(lane, site)
    active = used(lane)
    if req.pk and req in queue:
        i = queue.index(req)
        return Spot(lane, i + 1, _simulate(lane, queue[:i], site), True, active, cap, i)
    return Spot(lane, None, None, is_full(lane, site), active, cap, len(queue))


def preview(service: Service | None) -> Spot:
    """What a new request for this service would meet if sent now."""
    site = SiteSettings.load()
    lane = lane_of(service)
    if lane is None:
        return Spot(None, None, None, False, 0, 0, 0)
    queue = list(waiting(lane))
    cap = capacity(lane, site)
    full = is_full(lane, site) or bool(queue)
    if not full:
        return Spot(lane, None, None, False, used(lane), cap, 0)
    return Spot(lane, len(queue) + 1, _simulate(lane, queue, site), True, used(lane), cap, len(queue))


def join_on_submit(req: ProjectRequest):
    """Called as a request is submitted, before it is saved."""
    lane = lane_of(req.service)
    if lane and (is_full(lane) or waiting(lane).exists()):
        req.queued_at = timezone.now()
        req.queue_left_at = None


def _release(req: ProjectRequest, *, manual: bool, notify: bool = True):
    from billing.models import Charge
    from notifications.events import notify_client, notify_studio_event

    ProjectRequest.objects.filter(pk=req.pk).update(queue_left_at=timezone.now())
    if not notify:
        return
    deposit = Charge.objects.filter(engagement__request=req, kind=Charge.Kind.DEPOSIT).first()
    if deposit and not manual:
        # Already signed: the studio decides when the deposit is due.
        what = (f"Its deposit is due by {deposit.due_at.date().isoformat()}; shorten the time to pay if you start now."
                if deposit.status == Charge.Status.DUE and deposit.due_at else "Ask for the deposit when you're ready to start.")
        notify_studio_event("studio_queue_deposit", f"/studio/requests/{req.reference}?tab=payments", ref=req.reference, title=req.title,
                            client=req.client.full_name, deposit=what)
        return
    notify_client("queue_your_turn", req.client, f"/portal/requests/{req.reference}", title=req.title)
    if not manual:
        notify_studio_event("studio_queue_next", f"/studio/requests/{req.reference}", ref=req.reference, title=req.title,
                            client=req.client.full_name)


def advance(lane: str | None = None) -> int:
    """Release queue heads into free places, lane by lane. Returns how many."""
    site = SiteSettings.load()
    lanes = [lane] if lane else [STUDIO] + [
        f"service:{slug}" for slug in Service.objects.filter(max_active__isnull=False, accept_directly=False).values_list("slug", flat=True)
    ]
    released = 0
    for ln in lanes:
        with transaction.atomic():
            while not is_full(ln, site):
                head = waiting(ln).select_for_update(of=("self",)).first()
                if not head:
                    break
                _release(head, manual=False)
                released += 1
    if released:
        _moved(lanes)
    return released


def _moved(lanes: list[str], after=None):
    """Those still waiting moved up (everyone, or those behind `after`): tell them on the site (no e-mail)."""
    from live.service import notify_in_app
    from notifications.service import user_lang

    site = SiteSettings.load()
    for ln in lanes:
        queue = list(waiting(ln))
        for i, req in enumerate(queue):
            if after is not None and (req.queued_at, req.pk) <= after:
                continue
            fr = user_lang(req.client) == "fr"
            start = _simulate(ln, queue[:i], site)
            when = start.isoformat() if start else ("bientôt" if fr else "soon")
            title = f"Vous êtes n°{i + 1} dans la file" if fr else f"You're #{i + 1} in the queue"
            text = (f"« {req.title} » avance. Démarrage estimé : {when}." if fr
                    else f"\"{req.title}\" moved up. Estimated start: {when}.")
            notify_in_app(req.client, "queue_moved", title, text, f"/portal/requests/{req.reference}")


def take_now(req: ProjectRequest, notify: bool = True):
    """The studio starts with this one now, ahead of the queue (those behind it move up)."""
    if req.queued_at and not req.queue_left_at:
        _release(req, manual=True, notify=notify)
        _moved([lane_of(req.service) or STUDIO], after=(req.queued_at, req.pk))


def started(req: ProjectRequest):
    """Its deposit is paid: the project starts, so it is out of the queue for good."""
    if req.queued_at and not req.queue_left_at:
        ProjectRequest.objects.filter(pk=req.pk).update(queue_left_at=timezone.now())
        req.queue_left_at = timezone.now()
        lane = lane_of(req.service) or STUDIO
        transaction.on_commit(lambda: _moved([lane], after=(req.queued_at, req.pk)))


def left(req: ProjectRequest):
    """
    It left the queue without starting (withdrawn, declined, expired,
    cancelled): a place may free up, and those behind it move up.
    """
    lane = lane_of(req.service) or STUDIO
    mark = (req.queued_at, req.pk)

    def after_commit():
        if not advance(lane):
            _moved([lane], after=mark)

    transaction.on_commit(after_commit)


def requeue(req: ProjectRequest):
    """Back to its place in the queue (its original arrival time)."""
    if req.queued_at and req.queue_left_at and req.status in WAITING:
        ProjectRequest.objects.filter(pk=req.pk).update(queue_left_at=None)


def move(req: ProjectRequest, by: int):
    """Swap places with the neighbour above (by=-1) or below (by=1)."""
    lane = lane_of(req.service)
    if not lane:
        return
    queue = list(waiting(lane))
    if req not in queue:
        return
    i = queue.index(req)
    j = i + by
    if not 0 <= j < len(queue):
        return
    a, b = queue[i], queue[j]
    with transaction.atomic():
        ProjectRequest.objects.filter(pk=a.pk).update(queued_at=b.queued_at)
        ProjectRequest.objects.filter(pk=b.pk).update(queued_at=a.queued_at)
    _moved([lane])


def lanes_overview() -> list[dict]:
    """Every lane for the studio: places, who holds them, who waits."""
    site = SiteSettings.load()
    lanes = [STUDIO] + [f"service:{s}" for s in Service.objects.filter(max_active__isnull=False, accept_directly=False).values_list("slug", flat=True)]
    out = []
    for ln in lanes:
        queue = list(waiting(ln))
        rows = []
        for i, req in enumerate(queue):
            start = _simulate(ln, queue[:i], site)
            eng = getattr(req, "engagement", None)
            deposit = eng.charges.filter(kind="deposit").first() if eng else None
            rows.append({"reference": req.reference, "title": req.title, "client": req.client.full_name,
                         "service": req.service.title_en if req.service else "", "queued_at": req.queued_at,
                         "status": req.status, "position": i + 1, "start": start,
                         # Signed already: its deposit is asked later, or due by a date.
                         "deposit": {"id": deposit.pk, "status": deposit.status, "due_at": deposit.due_at,
                                     "amount": deposit.amount, "currency": deposit.currency} if deposit else None})
        services = ([s.title_en for s in Service.objects.filter(active=True, accept_directly=False, max_active__isnull=True)]
                    if ln == STUDIO else list(Service.objects.filter(slug=ln.split(":", 1)[1]).values_list("title_en", flat=True)))
        out.append({
            "lane": ln, "services": services, "capacity": capacity(ln, site), "used": used(ln), "full": is_full(ln, site),
            "active": [{"reference": e.request.reference, "title": e.title, "status": e.status,
                        "ends": (e.deadline or (e.started_at.date() + timedelta(days=e.timeline_days) if e.started_at else None))}
                       for e in _occupying(ln)],
            "reserved": [{"reference": r.reference, "title": r.title} for r in _reserved(ln)],
            "queue": rows,
        })
    return out


# ── What moves the queue ──────────────────────────────────────────────────
# A place frees when a project leaves development or review, a released
# request closes, or capacity changes. The 15-minute tick also calls
# advance(), so a missed signal only delays a release.

def _soon():
    transaction.on_commit(advance)


def _engagement_saved(sender, instance, **kwargs):
    if not kwargs.get("raw"):
        _soon()


def _request_saved(sender, instance, **kwargs):
    # Withdrawn, declined or expired while waiting: those behind it move up.
    if not kwargs.get("raw") and instance.queued_at and not instance.queue_left_at and instance.status not in WAITING:
        eng = getattr(instance, "engagement", None) if hasattr(instance, "engagement") else None
        if eng is None or eng.status in (E.AWAITING_DEPOSIT, E.EXPIRED, E.CANCELLED):
            left(instance)
            return
    if not kwargs.get("raw") and instance.queued_at and instance.status not in WAITING:
        _soon()


def _capacity_changed(sender, instance, **kwargs):
    if not kwargs.get("raw"):
        _soon()


def connect():
    from django.db.models.signals import post_save

    post_save.connect(_engagement_saved, sender=Engagement, dispatch_uid="queue-engagement")
    post_save.connect(_request_saved, sender=ProjectRequest, dispatch_uid="queue-request")
    post_save.connect(_capacity_changed, sender=SiteSettings, dispatch_uid="queue-site")
    post_save.connect(_capacity_changed, sender=Service, dispatch_uid="queue-service")
