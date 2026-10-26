"""
Seed the approved plans and calculator (docs/BUSINESS_RULES.md §1 and §2).

    python manage.py seed_pricing            # create what's missing
    python manage.py seed_pricing --update   # also reset values edited in the admin

Service starting prices are SUGGESTIONS until Younes sets his own in the admin.
"""

from decimal import Decimal

from django.core.management.base import BaseCommand
from django.db import transaction

from content.models import CarePlan, PricingChoice, PricingFactor, Service, ServicePrice

PLANS = [
    dict(code="starter", order=1, name_en="Starter", name_fr="Starter", surcharge_percent=0, maintenance_days=14,
         reply_hours=48, revision_rounds=2, small_updates=0, advice=False, monthly_call=False, monitoring=False,
         tagline_en="The product, built right, with two weeks of free fixes.",
         tagline_fr="Le produit, bien construit, avec deux semaines de corrections offertes."),
    dict(code="pro", order=2, name_en="Pro", name_fr="Pro", surcharge_percent=15, maintenance_days=30, reply_hours=24,
         revision_rounds=3, small_updates=3, advice=True, monthly_call=False, monitoring=False, highlighted=True,
         tagline_en="A month of care, priority fixes and quick answers.",
         tagline_fr="Un mois de suivi, corrections prioritaires et réponses rapides."),
    dict(code="ultimate", order=3, name_en="Ultimate", name_fr="Ultimate", surcharge_percent=30, maintenance_days=60,
         reply_hours=12, revision_rounds=5, small_updates=None, advice=True, monthly_call=True, monitoring=True,
         tagline_en="Two months of full care, monitoring and a partner on call.",
         tagline_fr="Deux mois de suivi complet, surveillance et un partenaire disponible."),
]

# Suggested "from" prices in DZD. Younes edits them in the admin. Other
# currencies follow the live street rate (fx); a price added in the admin for
# EUR or USD overrides the conversion for that currency.
STARTING = {
    "web-platforms": 150000, "websites": 45000, "mobile-apps": 200000,
    "game-dev": 120000, "automation": 25000, "product-films": 30000,
}

WEB = ["web-platforms", "websites"]
APPS = ["web-platforms", "websites", "mobile-apps"]

# (key, label_en, label_fr, services or None, [(key, en, fr, multiplier, (dzd, eur, usd), default)])
FACTORS = [
    ("speed", "Delivery speed", "Délai de livraison", None, [
        ("standard", "Standard", "Standard", "1.00", (0, 0, 0), True),
        ("fast", "Fast, about 30 % sooner", "Rapide, environ 30 % plus tôt", "1.25", (0, 0, 0), False),
        ("rush", "Rush, about 50 % sooner", "Urgent, environ 50 % plus tôt", "1.50", (0, 0, 0), False),
    ]),
    ("design", "Design", "Design", APPS, [
        ("proven", "Clean, on a proven layout", "Épuré, sur une base éprouvée", "1.00", (0, 0, 0), True),
        ("custom", "Fully custom, with motion", "Sur mesure, avec animations", "1.35", (0, 0, 0), False),
    ]),
    ("languages", "Languages", "Langues", APPS, [
        ("one", "One language", "Une langue", "1.00", (0, 0, 0), True),
        ("two", "Two languages", "Deux langues", "1.10", (0, 0, 0), False),
        ("three", "Three languages", "Trois langues", "1.20", (0, 0, 0), False),
    ]),
    ("rtl", "Arabic (right to left)", "Arabe (de droite à gauche)", APPS, [
        ("no", "Not needed", "Pas nécessaire", "1.00", (0, 0, 0), True),
        ("yes", "Include Arabic RTL", "Inclure l'arabe RTL", "1.15", (0, 0, 0), False),
    ]),
    ("platforms", "Platforms", "Plateformes", WEB, [
        ("web", "Web only", "Web uniquement", "1.00", (0, 0, 0), True),
        ("android", "Web + Android app", "Web + application Android", "1.60", (0, 0, 0), False),
        ("android-ios", "Web + Android + iOS apps", "Web + applications Android et iOS", "1.90", (0, 0, 0), False),
    ]),
    ("payments", "Online payments", "Paiement en ligne", APPS, [
        ("none", "None", "Aucun", "1.00", (0, 0, 0), True),
        ("chargily", "Chargily + CCP / BaridiMob", "Chargily + CCP / BaridiMob", "1.00", (25000, 200, 220), False),
        ("chargily-paypal", "Chargily + PayPal", "Chargily + PayPal", "1.00", (45000, 350, 380), False),
    ]),
    ("admin", "Admin back-office", "Back-office", APPS, [
        ("basic", "Basic", "Simple", "1.00", (0, 0, 0), True),
        ("full", "Full: stats, roles, exports", "Complet : statistiques, rôles, exports", "1.00", (30000, 250, 270), False),
    ]),
    ("game-platforms", "Platforms", "Plateformes", ["game-dev"], [
        ("pc", "PC (Windows)", "PC (Windows)", "1.00", (0, 0, 0), True),
        ("pc-android", "PC + Android", "PC + Android", "1.35", (0, 0, 0), False),
        ("pc-android-web", "PC + Android + web (WebGL)", "PC + Android + web (WebGL)", "1.55", (0, 0, 0), False),
    ]),
    ("game-art", "Art and assets", "Graphismes et assets", ["game-dev"], [
        ("store", "Existing assets, adapted", "Assets existants, adaptés", "1.00", (0, 0, 0), True),
        ("custom", "Custom art and animation", "Graphismes et animations sur mesure", "1.60", (0, 0, 0), False),
    ]),
    ("content", "Texts and images", "Textes et images", APPS, [
        ("client", "I provide them", "Je les fournis", "1.00", (0, 0, 0), True),
        ("written", "Write and prepare them for me", "Rédigez-les et préparez-les pour moi", "1.00", (15000, 120, 130), False),
    ]),
]


class Command(BaseCommand):
    help = "Seed plans, calculator factors and suggested starting prices (idempotent)."

    def add_arguments(self, parser):
        parser.add_argument("--update", action="store_true")

    @transaction.atomic
    def handle(self, *args, update=False, **options):
        for data in PLANS:
            plan, created = CarePlan.objects.get_or_create(code=data["code"], defaults=data)
            if update and not created:
                CarePlan.objects.filter(pk=plan.pk).update(**data)

        for slug, dzd in STARTING.items():
            service = Service.objects.filter(slug=slug).first()
            if not service:
                continue
            row, created = ServicePrice.objects.get_or_create(
                service=service, currency="DZD", kind=ServicePrice.Kind.FROM, defaults={"amount": dzd, "order": 0},
            )
            if update and not created:
                row.amount = dzd
                row.save()

        for order, (key, en, fr, services, choices) in enumerate(FACTORS):
            factor, _ = PricingFactor.objects.update_or_create(
                key=key, defaults={"label_en": en, "label_fr": fr, "order": order},
            )
            if services:
                factor.services.set(Service.objects.filter(slug__in=services))
            for i, (ck, cen, cfr, mult, (dzd, eur, usd), default) in enumerate(choices):
                values = {"label_en": cen, "label_fr": cfr, "multiplier": Decimal(mult), "addon_dzd": dzd,
                          "addon_eur": eur, "addon_usd": usd, "is_default": default, "order": i}
                choice, created = PricingChoice.objects.get_or_create(factor=factor, key=ck, defaults=values)
                if update and not created:
                    PricingChoice.objects.filter(pk=choice.pk).update(**values)

        self.stdout.write(self.style.SUCCESS("Plans, calculator and suggested prices seeded."))
