"""
The estimate shown while a client tweaks the calculator (BUSINESS_RULES.md §2).

    base     = the service's "from" price in the chosen currency (a film's
               price per minute: its length is one of the factors)
    estimate = base × Π(choice multipliers) × (1 + plan surcharge) + Σ(add-ons)
    range    = [estimate, estimate × 1.3], rounded to clean numbers

It is an estimate, never a binding price: the binding price is the proposal.
"""

from dataclasses import dataclass
from decimal import ROUND_HALF_UP, Decimal

from .models import CarePlan, PricingChoice, PricingFactor, Service, ServicePrice

SPREAD = Decimal("1.3")
BASE_KINDS = (ServicePrice.Kind.FROM, ServicePrice.Kind.PER_MINUTE)
STEP = {"DZD": 1000, "EUR": 10, "USD": 10}


@dataclass
class Estimate:
    currency: str
    low: int | None
    high: int | None
    choices: dict[str, str]
    plan: str | None
    converted: bool = False  # no price set in this currency: DZD at the live street rate


def factors_for(service: Service | None):
    qs = PricingFactor.objects.filter(active=True).prefetch_related("choices", "services")
    return [f for f in qs if not f.services.exists() or (service and f.services.filter(pk=service.pk).exists())]


def _round(value: Decimal, currency: str) -> int:
    step = STEP.get(currency, 10)
    # Small sums (a one-minute film) keep a finer step.
    if currency == "DZD" and value < 50000:
        step = 500
    elif currency != "DZD" and value < 200:
        step = 5
    return int((Decimal(value) / step).quantize(Decimal("1"), rounding=ROUND_HALF_UP) * step)


def estimate(service: Service | None, currency: str, plan_code: str | None, picks: dict[str, str]) -> Estimate:
    """Unknown factors or choices fall back to each factor's default."""
    base_row = ServicePrice.objects.filter(service=service, currency=currency, kind__in=BASE_KINDS).first() if service else None
    plan = CarePlan.objects.filter(code=plan_code, active=True).first() if plan_code else None

    multiplier, addons, chosen = Decimal(1), 0, {}
    for factor in factors_for(service):
        options = list(factor.choices.all())
        pick: PricingChoice | None = next((c for c in options if c.key == picks.get(factor.key)), None)
        pick = pick or next((c for c in options if c.is_default), None) or (options[0] if options else None)
        if pick:
            chosen[factor.key] = pick.key
            multiplier *= pick.multiplier
            addons += pick.addon(currency)

    if not base_row:
        has_dzd = service and ServicePrice.objects.filter(service=service, currency="DZD", kind__in=BASE_KINDS).exists()
        if has_dzd and currency != "DZD":
            from fx.service import convert, current

            dzd, rates = estimate(service, "DZD", plan_code, picks), current()
            low, high = (_round(convert(v, "DZD", currency, rates), currency) for v in (dzd.low, dzd.high))
            return Estimate(currency, low, high, chosen, plan.code if plan else None, converted=True)
        return Estimate(currency, None, None, chosen, plan.code if plan else None)
    total = Decimal(base_row.amount) * multiplier
    if plan:
        total *= 1 + Decimal(plan.surcharge_percent) / 100
    total += addons
    return Estimate(currency, _round(total, currency), _round(total * SPREAD, currency), chosen, plan.code if plan else None)
