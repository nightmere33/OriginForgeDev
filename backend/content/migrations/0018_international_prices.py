"""
Fixed prices in euros and dollars (29 Oct 2026). Dinar prices stay Younes's
own (the Algerian market); clients abroad pay standard international rates,
set here once and edited in the studio afterwards. No conversion through the
street rate any more for list prices, estimates or option add-ons.

Benchmarks (freelance, 2026): landing page about $900 (custom €800 to 3 000),
web or mobile MVP $8 000 to 35 000, 2D product film $1 000 to 3 000 a minute,
3D about double, small automation scripts from a few hundred.
"""

from django.db import migrations

# slug: (EUR, USD); the kind follows the service's dinar price (from / per minute).
PRICES = {
    "web-platforms": (6500, 7000),
    "websites": (900, 990),
    "mobile-apps": (5000, 5500),
    "windows-software": (4500, 4900),
    "automation": (450, 490),
    "product-films": (400, 450),  # one minute of a clean edit
    "payments": (1500, 1650),  # off the site, kept for old requests
    "game-dev": (5000, 5500),
}

# (factor, choice): (EUR, USD) add-ons, replacing the converted ones.
ADDONS = {
    ("payments", "chargily"): (600, 650),
    ("payments", "chargily-paypal"): (900, 990),
    ("admin", "full"): (800, 880),
    ("site-editor", "editor"): (400, 440),
    ("content", "written"): (350, 390),
    ("win-devices", "pos"): (400, 440),
    ("win-updates", "auto"): (300, 330),
    ("auto-output", "system"): (200, 220),
    ("film-voice", "ai"): (60, 65),
}

# The payment options read for every market, not only Algeria's.
LABELS = {
    ("payments", "chargily"): ("Card payments (Chargily, Stripe)", "Paiement par carte (Chargily, Stripe)"),
    ("payments", "chargily-paypal"): ("Cards and PayPal", "Cartes et PayPal"),
}


def forwards(apps, schema_editor):
    Service = apps.get_model("content", "Service")
    ServicePrice = apps.get_model("content", "ServicePrice")
    PricingChoice = apps.get_model("content", "PricingChoice")
    for slug, (eur, usd) in PRICES.items():
        service = Service.objects.filter(slug=slug).first()
        if not service:
            continue
        dzd = ServicePrice.objects.filter(service=service, currency="DZD").first()
        kind = dzd.kind if dzd else "from"
        for currency, amount in (("EUR", eur), ("USD", usd)):
            # A price already set by hand in that currency is kept.
            if not ServicePrice.objects.filter(service=service, currency=currency).exists():
                ServicePrice.objects.create(service=service, currency=currency, kind=kind, amount=amount, order=0)
    for (factor, key), (eur, usd) in ADDONS.items():
        PricingChoice.objects.filter(factor__key=factor, key=key).update(addon_eur=eur, addon_usd=usd)
    for (factor, key), (en, fr) in LABELS.items():
        PricingChoice.objects.filter(factor__key=factor, key=key).update(label_en=en, label_fr=fr)


def backwards(apps, schema_editor):
    ServicePrice = apps.get_model("content", "ServicePrice")
    ServicePrice.objects.filter(service__slug__in=PRICES, currency__in=("EUR", "USD")).delete()


class Migration(migrations.Migration):
    dependencies = [("content", "0017_invoice_seller")]
    operations = [migrations.RunPython(forwards, backwards)]
