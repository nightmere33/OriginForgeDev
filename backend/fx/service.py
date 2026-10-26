"""
Street exchange rates for Algeria, live.

The dinar has an official rate (Bank of Algeria) and the rate people actually
pay (the parallel market, about twice as many dinars). There is no official
feed for the second one, but Binance P2P USDT/DZD tracks it closely and is
public: we take the median of the best buy and sell offers, and treat USDT as
the street dollar. The euro is the street dollar crossed with the ECB EUR/USD
rate (Frankfurter). Every rate is "DZD per one unit".

If a source is down, the last stored rate stays in use; with nothing stored
yet, FALLBACK applies. A manual override in Site settings beats everything.
"""

import logging
import statistics
from datetime import timedelta
from decimal import ROUND_UP, Decimal

import httpx
from django.utils import timezone

from .models import Rate

logger = logging.getLogger("originforge.fx")

P2P_URL = "https://p2p.binance.com/bapi/c2c/v2/friendly/c2c/adv/search"
ECB_URLS = ("https://api.frankfurter.dev/v1/latest?base=USD&symbols=EUR", "https://api.frankfurter.app/latest?from=USD&to=EUR")
FALLBACK = {"USDT": Decimal("256"), "USD": Decimal("256"), "EUR": Decimal("287")}
STALE_AFTER = timedelta(hours=6)
TIMEOUT = httpx.Timeout(10.0, connect=4.0)


def _p2p_median(side: str) -> Decimal | None:
    res = httpx.post(
        P2P_URL, timeout=TIMEOUT,
        json={"asset": "USDT", "fiat": "DZD", "tradeType": side, "page": 1, "rows": 10, "payTypes": [], "publisherType": None},
        headers={"User-Agent": "Mozilla/5.0 (OriginForge rates)", "Content-Type": "application/json"},
    )
    res.raise_for_status()
    prices = [Decimal(ad["adv"]["price"]) for ad in res.json().get("data") or []]
    # Drop the outliers at both ends: the first offers are often bait or tiny.
    prices = sorted(prices)[1:-1] if len(prices) > 4 else prices
    return Decimal(statistics.median(prices)).quantize(Decimal("0.01")) if prices else None


def _eur_per_usd() -> Decimal | None:
    for url in ECB_URLS:
        try:
            res = httpx.get(url, timeout=TIMEOUT, follow_redirects=True)
            res.raise_for_status()
            return Decimal(str(res.json()["rates"]["EUR"]))
        except (httpx.HTTPError, KeyError, ValueError) as exc:
            logger.warning("ECB rate from %s failed: %s", url, exc)
    return None


def refresh() -> dict[str, Decimal]:
    """Fetch and store new rates. Keeps the previous ones on any failure."""
    now = timezone.now()
    try:
        buy, sell = _p2p_median("BUY"), _p2p_median("SELL")
    except (httpx.HTTPError, KeyError, ValueError) as exc:
        logger.warning("Binance P2P failed: %s", exc)
        buy = sell = None
    if buy and sell:
        usdt = ((buy + sell) / 2).quantize(Decimal("0.01"))
        Rate.objects.update_or_create(code="USDT", defaults={"dzd": usdt, "buy": buy, "sell": sell, "source": "Binance P2P", "fetched_at": now})
        Rate.objects.update_or_create(code="USD", defaults={"dzd": usdt, "buy": None, "sell": None, "source": "Binance P2P (USDT)", "fetched_at": now})
        eur_per_usd = _eur_per_usd()
        if eur_per_usd:
            Rate.objects.update_or_create(code="EUR", defaults={
                "dzd": (usdt / eur_per_usd).quantize(Decimal("0.01")), "buy": None, "sell": None,
                "source": "Binance P2P × ECB", "fetched_at": now,
            })
    from content.revalidate import queue

    queue(["rates"])
    return current()


def current() -> dict[str, Decimal]:
    """DZD per unit for every currency we price in, overrides applied."""
    from content.models import SiteSettings

    rates = dict(FALLBACK)
    rates.update({r.code: r.dzd for r in Rate.objects.all()})
    override = SiteSettings.load().usdt_rate_override
    if override:
        # The override sets the street dollar; the euro keeps its ratio to it.
        ratio = rates["EUR"] / rates["USD"]
        rates["USDT"] = rates["USD"] = override
        rates["EUR"] = (override * ratio).quantize(Decimal("0.01"))
    rates["DZD"] = Decimal(1)
    return rates


def status() -> dict:
    rows = {r.code: r for r in Rate.objects.all()}
    usdt = rows.get("USDT")
    from content.models import SiteSettings

    return {
        "source": "manual" if SiteSettings.load().usdt_rate_override else (usdt.source if usdt else "fallback"),
        "updated_at": usdt.fetched_at if usdt else None,
        "stale": not usdt or timezone.now() - usdt.fetched_at > STALE_AFTER,
    }


def convert(amount, frm: str, to: str, rates: dict[str, Decimal] | None = None) -> Decimal:
    rates = rates or current()
    if frm == to:
        return Decimal(amount)
    return Decimal(amount) * rates[frm] / rates[to]


def to_usdt(amount, currency: str, rates: dict[str, Decimal] | None = None) -> Decimal:
    """What a client sends in USDT for an amount, rounded up to the cent."""
    return convert(amount, currency, "USDT", rates).quantize(Decimal("0.01"), rounding=ROUND_UP)
