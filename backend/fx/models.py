from django.db import models


class Rate(models.Model):
    """How many Algerian dinars one unit is worth on the street (parallel) market."""

    class Code(models.TextChoices):
        USDT = "USDT", "USDT (Tether)"
        USD = "USD", "US dollar"
        EUR = "EUR", "Euro"

    code = models.CharField(max_length=8, choices=Code.choices, primary_key=True)
    dzd = models.DecimalField("DZD per unit", max_digits=12, decimal_places=4)
    buy = models.DecimalField(max_digits=12, decimal_places=4, null=True, blank=True, help_text="Binance P2P median, buying USDT")
    sell = models.DecimalField(max_digits=12, decimal_places=4, null=True, blank=True, help_text="Binance P2P median, selling USDT")
    source = models.CharField(max_length=60)
    fetched_at = models.DateTimeField()

    class Meta:
        ordering = ["code"]

    def __str__(self):
        return f"1 {self.code} = {self.dzd} DZD"
