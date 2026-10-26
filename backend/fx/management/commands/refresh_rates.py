from django.core.management.base import BaseCommand

from fx.service import refresh, status


class Command(BaseCommand):
    help = "Fetch the street DZD rates (Binance P2P USDT/DZD, crossed with ECB EUR/USD)."

    def handle(self, *args, **options):
        rates = refresh()
        self.stdout.write(", ".join(f"1 {k} = {v} DZD" for k, v in rates.items() if k != "DZD"))
        self.stdout.write(str(status()))
