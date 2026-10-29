"""
Seed the approved plans and calculator (docs/BUSINESS_RULES.md §1 and §2).

    python manage.py seed_pricing            # create what's missing
    python manage.py seed_pricing --update   # also reset values edited in the admin

Starting prices are Younes's (27 Oct 2026); he edits them in the admin.
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

# Starting prices per currency, with how to read them: dinars for the
# Algerian market, standard rates in euros and dollars for clients abroad
# (content migration 0018 has the benchmarks). Nothing is converted. Films are
# priced per minute of a single film, and their length is one of the factors.
STARTING = {
    "web-platforms": ((150000, 6500, 7000), "from"), "websites": ((45000, 900, 990), "from"),
    "mobile-apps": ((100000, 5000, 5500), "from"), "windows-software": ((100000, 4500, 4900), "from"),
    "automation": ((25000, 450, 490), "from"), "product-films": ((3500, 400, 450), "per_minute"),
}

PLATFORMS = ["web-platforms"]
APPS = ["web-platforms", "websites", "mobile-apps"]
SOFTWARE = ["web-platforms", "websites", "mobile-apps", "windows-software"]
BACKOFFICE = ["web-platforms", "mobile-apps"]
WINDOWS = ["windows-software"]
AUTOMATION = ["automation"]
FILMS = ["product-films"]

# (key, label_en, label_fr, services or None, [(key, en, fr, multiplier, (dzd, eur, usd), default)])
FACTORS = [
    ("speed", "Delivery speed", "Délai de livraison", None, [
        ("standard", "Standard", "Standard", "1.00", (0, 0, 0), True),
        ("fast", "Fast, about 30 % sooner", "Rapide, environ 30 % plus tôt", "1.25", (0, 0, 0), False),
        ("rush", "Rush, about 50 % sooner", "Urgent, environ 50 % plus tôt", "1.50", (0, 0, 0), False),
    ]),
    ("site-pages", "Size", "Taille", ["websites"], [
        ("one", "One page (landing page)", "Une page (landing page)", "1.00", (0, 0, 0), True),
        ("five", "Up to 5 pages", "Jusqu'à 5 pages", "1.50", (0, 0, 0), False),
        ("ten", "6 to 10 pages", "6 à 10 pages", "2.20", (0, 0, 0), False),
        ("twenty", "11 to 20 pages", "11 à 20 pages", "3.20", (0, 0, 0), False),
    ]),
    ("design", "Design", "Design", SOFTWARE, [
        ("proven", "Clean, on a proven layout", "Épuré, sur une base éprouvée", "1.00", (0, 0, 0), True),
        ("custom", "Fully custom, with motion", "Sur mesure, avec animations", "1.35", (0, 0, 0), False),
    ]),
    ("languages", "Languages", "Langues", SOFTWARE, [
        ("one", "One language", "Une langue", "1.00", (0, 0, 0), True),
        ("two", "Two languages", "Deux langues", "1.10", (0, 0, 0), False),
        ("three", "Three languages", "Trois langues", "1.20", (0, 0, 0), False),
    ]),
    ("rtl", "Arabic (right to left)", "Arabe (de droite à gauche)", SOFTWARE, [
        ("no", "Not needed", "Pas nécessaire", "1.00", (0, 0, 0), True),
        ("yes", "Include Arabic RTL", "Inclure l'arabe RTL", "1.15", (0, 0, 0), False),
    ]),
    ("platforms", "Platforms", "Plateformes", PLATFORMS, [
        ("web", "Web only", "Web uniquement", "1.00", (0, 0, 0), True),
        ("android", "Web + Android app", "Web + application Android", "1.60", (0, 0, 0), False),
        ("android-ios", "Web + Android + iOS apps", "Web + applications Android et iOS", "1.90", (0, 0, 0), False),
    ]),
    ("mobile-platforms", "Platforms", "Plateformes", ["mobile-apps"], [
        ("android", "Android", "Android", "1.00", (0, 0, 0), True),
        ("android-ios", "Android and iOS", "Android et iOS", "1.35", (0, 0, 0), False),
        ("android-ios-web", "Android, iOS and a web app", "Android, iOS et une application web", "1.70", (0, 0, 0), False),
    ]),
    ("payments", "Online payments", "Paiement en ligne", APPS, [
        ("none", "None", "Aucun", "1.00", (0, 0, 0), True),
        ("chargily", "Card payments (Chargily, Stripe)", "Paiement par carte (Chargily, Stripe)", "1.00", (25000, 600, 650), False),
        ("chargily-paypal", "Cards and PayPal", "Cartes et PayPal", "1.00", (45000, 900, 990), False),
    ]),
    ("admin", "Admin back-office", "Back-office", BACKOFFICE, [
        ("basic", "Basic", "Simple", "1.00", (0, 0, 0), True),
        ("full", "Full: stats, roles, exports", "Complet : statistiques, rôles, exports", "1.00", (30000, 800, 880), False),
    ]),
    ("site-editor", "After launch", "Après la mise en ligne", ["websites"], [
        ("on-request", "I ask you for changes", "Je vous demande les modifications", "1.00", (0, 0, 0), True),
        ("editor", "I edit texts and photos myself", "Je modifie textes et photos moi-même", "1.00", (15000, 400, 440), False),
    ]),
    ("content", "Texts and images", "Textes et images", APPS, [
        ("client", "I provide them", "Je les fournis", "1.00", (0, 0, 0), True),
        ("written", "Write and prepare them for me", "Rédigez-les et préparez-les pour moi", "1.00", (15000, 350, 390), False),
    ]),
    ("win-data", "Data", "Données", WINDOWS, [
        ("local", "On one PC", "Sur un seul PC", "1.00", (0, 0, 0), True),
        ("network", "Shared by several PCs on a network", "Partagées entre plusieurs PC en réseau", "1.30", (0, 0, 0), False),
        ("online", "Synced online between several sites", "Synchronisées en ligne entre plusieurs sites", "1.60", (0, 0, 0), False),
    ]),
    ("win-devices", "Devices", "Périphériques", WINDOWS, [
        ("none", "None", "Aucun", "1.00", (0, 0, 0), True),
        ("pos", "Receipt printer, barcode scanner", "Imprimante de tickets, lecteur code-barres", "1.00", (15000, 400, 440), False),
    ]),
    ("win-updates", "Updates", "Mises à jour", WINDOWS, [
        ("manual", "Installer, updated by hand", "Installateur, mis à jour à la main", "1.00", (0, 0, 0), True),
        ("auto", "Automatic updates", "Mises à jour automatiques", "1.00", (10000, 300, 330), False),
    ]),
    ("auto-sources", "Sites or tools", "Sites ou outils", AUTOMATION, [
        ("one", "One", "Un seul", "1.00", (0, 0, 0), True),
        ("few", "2 to 5", "2 à 5", "1.70", (0, 0, 0), False),
        ("many", "More than 5", "Plus de 5", "2.60", (0, 0, 0), False),
    ]),
    ("auto-runs", "Runs", "Exécution", AUTOMATION, [
        ("on-demand", "When I start it", "Quand je la lance", "1.00", (0, 0, 0), True),
        ("scheduled", "On a schedule, with alerts", "Planifiée, avec alertes", "1.25", (0, 0, 0), False),
        ("always", "Around the clock on a server", "En continu sur un serveur", "1.50", (0, 0, 0), False),
    ]),
    ("auto-output", "Results go to", "Résultats vers", AUTOMATION, [
        ("file", "A file (Excel, CSV)", "Un fichier (Excel, CSV)", "1.00", (0, 0, 0), True),
        ("system", "Google Sheets, a database or an API", "Google Sheets, une base de données ou une API", "1.00", (10000, 200, 220), False),
    ]),
    # Films: the base price is one minute of a clean edit.
    ("film-length", "Length", "Durée", FILMS, [
        ("1", "Up to 1 minute", "Jusqu'à 1 minute", "1.00", (0, 0, 0), True),
        ("2", "1 to 2 minutes", "1 à 2 minutes", "1.80", (0, 0, 0), False),
        ("3", "2 to 3 minutes", "2 à 3 minutes", "2.50", (0, 0, 0), False),
        ("5", "3 to 5 minutes", "3 à 5 minutes", "3.80", (0, 0, 0), False),
    ]),
    ("film-style", "Production", "Réalisation", FILMS, [
        ("edit", "Clean edit: captures, captions, music", "Montage soigné : captures, sous-titres, musique", "1.00", (0, 0, 0), True),
        ("motion", "Motion design: animated text and screens", "Motion design : textes et écrans animés", "2.50", (0, 0, 0), False),
        ("3d", "3D: devices and product in 3D", "3D : appareils et produit en 3D", "5.00", (0, 0, 0), False),
    ]),
    ("film-voice", "Voice-over", "Voix off", FILMS, [
        ("none", "None, music only", "Aucune, musique seule", "1.00", (0, 0, 0), True),
        ("client", "I send the recording", "J'envoie l'enregistrement", "1.00", (0, 0, 0), False),
        ("ai", "Generated voice (Arabic, French, English)", "Voix générée (arabe, français, anglais)", "1.00", (2000, 60, 65), False),
    ]),
    ("film-languages", "Language versions", "Versions linguistiques", FILMS, [
        ("one", "One", "Une", "1.00", (0, 0, 0), True),
        ("two", "Two", "Deux", "1.35", (0, 0, 0), False),
        ("three", "Three", "Trois", "1.60", (0, 0, 0), False),
    ]),
    ("film-formats", "Formats", "Formats", FILMS, [
        ("one", "One format", "Un format", "1.00", (0, 0, 0), True),
        ("all", "Vertical, square and wide", "Vertical, carré et horizontal", "1.20", (0, 0, 0), False),
    ]),
]

# Factors of a service taken off the site (kept for old requests, switched off).
RETIRED_FACTORS = ["game-platforms", "game-art"]


class Command(BaseCommand):
    help = "Seed plans, calculator factors and starting prices (idempotent)."

    def add_arguments(self, parser):
        parser.add_argument("--update", action="store_true")

    @transaction.atomic
    def handle(self, *args, update=False, **options):
        for data in PLANS:
            plan, created = CarePlan.objects.get_or_create(code=data["code"], defaults=data)
            if update and not created:
                CarePlan.objects.filter(pk=plan.pk).update(**data)

        for slug, (amounts, kind) in STARTING.items():
            service = Service.objects.filter(slug=slug).first()
            if not service:
                continue
            # A service keeps the prices Younes set; --update resets them.
            for currency, amount in zip(("DZD", "EUR", "USD"), amounts):
                rows = ServicePrice.objects.filter(service=service, currency=currency)
                if not rows.exists():
                    ServicePrice.objects.create(service=service, currency=currency, kind=kind, amount=amount, order=0)
                elif update:
                    rows.exclude(kind=kind).delete()
                    ServicePrice.objects.update_or_create(service=service, currency=currency, kind=kind,
                                                          defaults={"amount": amount, "order": 0})

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
        PricingFactor.objects.filter(key__in=RETIRED_FACTORS).update(active=False)

        self.stdout.write(self.style.SUCCESS("Plans, calculator and starting prices seeded."))
