"""
A person's standing with the studio (docs/SUPPORT.md): it sets how soon a
ticket is answered and where it sits in the studio inbox. A project in
progress or in maintenance counts with its plan; the best one wins.
"""

from dataclasses import dataclass

# code: (priority, label); lower priority numbers are answered first.
TIERS = {
    "ultimate": (1, "Ultimate"),
    "pro": (2, "Pro"),
    "starter": (3, "Starter"),
    "client": (4, "Past client"),
    "requester": (4, "Request sent"),
    "newcomer": (5, "Newcomer"),
}
# Reply targets for those without a running plan (a plan brings its own).
HOURS = {"client": 48, "requester": 48, "newcomer": 72}


@dataclass(frozen=True)
class Standing:
    tier: str
    priority: int
    hours: int
    label: str


def standing(user) -> Standing:
    from engagements.models import Engagement, ProjectRequest

    best = None
    running = Engagement.objects.filter(client=user, status__in=Engagement.STARTED).select_related("contract__proposal__plan")
    for eng in running:
        proposal = eng.contract.proposal
        code = proposal.plan.code if proposal.plan.code in TIERS else "starter"
        priority = TIERS[code][0]
        if best is None or priority < best.priority or (priority == best.priority and proposal.reply_hours < best.hours):
            best = Standing(code, priority, proposal.reply_hours, TIERS[code][1])
    if best:
        return best
    if Engagement.objects.filter(client=user).exclude(status__in=(Engagement.Status.CANCELLED, Engagement.Status.EXPIRED,
                                                                   Engagement.Status.AWAITING_DEPOSIT)).exists():
        code = "client"
    elif ProjectRequest.objects.filter(client=user).exclude(status=ProjectRequest.Status.DRAFT).exists():
        code = "requester"
    else:
        code = "newcomer"
    return Standing(code, TIERS[code][0], HOURS[code], TIERS[code][1])
