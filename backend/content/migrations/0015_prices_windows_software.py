"""
Prices and services set by Younes on 27 October 2026:

- starting prices in DZD: web platforms 150 000, websites and landing pages
  45 000, mobile apps 100 000, Windows software 100 000 (new), product films
  3 500 per minute of a single film;
- Windows software takes game development's place on the site; games are
  taken on request only;
- every other currency follows the live street rate, so EUR and USD lines
  set by hand are removed.
"""

from django.db import migrations

PRICES = {
    "web-platforms": (150000, "from"),
    "websites": (45000, "from"),
    "mobile-apps": (100000, "from"),
    "windows-software": (100000, "from"),
    "product-films": (3500, "per_minute"),
}

WINDOWS = {
    "slug": "windows-software", "icon": "app-window", "order": 4, "active": True,
    "title_en": "Windows software", "title_fr": "Logiciels Windows",
    "summary_en": "Desktop programs in C# for Windows: stock, sales, point of sale and the tools your team uses every day.",
    "summary_fr": "Des logiciels de bureau en C# pour Windows : stock, ventes, caisse et les outils que votre équipe utilise chaque jour.",
    "description_en": "Fast native apps that keep working without internet, share one database across the office or sync to a server, print receipts and reports, and install in one click.",
    "description_fr": "Des applications natives rapides qui fonctionnent sans internet, partagent une base de données au bureau ou se synchronisent avec un serveur, impriment tickets et rapports, et s'installent en un clic.",
    "deliverables_en": "Workflow & screens\nC# / .NET desktop app\nLocal or shared database\nReports, printing & exports\nInstaller & updates",
    "deliverables_fr": "Parcours & écrans\nApplication C# / .NET\nBase de données locale ou partagée\nRapports, impression & exports\nInstallateur & mises à jour",
    "timeline_en": "3–10 weeks", "timeline_fr": "3 à 10 semaines",
}

ORDER = ["web-platforms", "websites", "mobile-apps", "windows-software", "automation", "product-films"]


def forward(apps, schema_editor):
    Service = apps.get_model("content", "Service")
    ServicePrice = apps.get_model("content", "ServicePrice")

    slug = WINDOWS["slug"]
    if not Service.objects.filter(slug=slug).exists():
        Service.objects.create(**WINDOWS)
    Service.objects.filter(slug="game-dev").update(active=False)
    for i, s in enumerate(ORDER, start=1):
        Service.objects.filter(slug=s).update(order=i)

    ServicePrice.objects.exclude(currency="DZD").delete()
    for s, (amount, kind) in PRICES.items():
        service = Service.objects.filter(slug=s).first()
        if not service:
            continue
        ServicePrice.objects.filter(service=service, currency="DZD").exclude(kind=kind).delete()
        ServicePrice.objects.update_or_create(service=service, currency="DZD", kind=kind, defaults={"amount": amount, "order": 0})


class Migration(migrations.Migration):
    dependencies = [("content", "0014_per_minute_price")]

    operations = [migrations.RunPython(forward, migrations.RunPython.noop)]
