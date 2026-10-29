from decimal import Decimal
from unittest import mock

from django.core.cache import cache
from django.core.management import call_command
from django.test import TestCase, override_settings
from rest_framework.test import APIClient

from accounts.models import User
from content.models import Service, ServicePrice, SiteSettings
from engagements.models import ProjectRequest

from . import service as fx
from .models import Rate

TX = "0x" + "ab" * 32


@override_settings(NEXT_REVALIDATE_URL="")
class RatesTests(TestCase):
    def setUp(self):
        cache.clear()

    def refresh(self, buy="257", sell="255", eur="0.9"):
        with mock.patch.object(fx, "_p2p_median", side_effect=[Decimal(buy), Decimal(sell)]), \
             mock.patch.object(fx, "_eur_per_usd", return_value=Decimal(eur)):
            return fx.refresh()

    def test_refresh_stores_street_rates(self):
        rates = self.refresh()
        self.assertEqual(rates["USDT"], Decimal("256.00"))  # buy/sell midpoint
        self.assertEqual(rates["USD"], Decimal("256.00"))
        self.assertEqual(rates["EUR"], Decimal("284.44"))  # 256 / 0.9
        self.assertFalse(fx.status()["stale"])

    def test_a_failed_source_keeps_the_last_rates(self):
        self.refresh()
        with mock.patch.object(fx, "_p2p_median", side_effect=fx.httpx.ConnectError("down")):
            rates = fx.refresh()
        self.assertEqual(rates["USDT"], Decimal("256.00"))

    def test_fallback_then_override(self):
        self.assertEqual(fx.current()["USDT"], fx.FALLBACK["USDT"])
        self.refresh()
        site = SiteSettings.load()
        site.usdt_rate_override = Decimal("260")
        site.save()
        rates = fx.current()
        self.assertEqual((rates["USDT"], rates["EUR"]), (Decimal("260"), Decimal("288.88")))  # keeps the stored EUR/USD ratio
        self.assertEqual(fx.status()["source"], "manual")

    def test_usdt_amount_rounds_up(self):
        self.refresh()
        self.assertEqual(fx.to_usdt(100000, "DZD"), Decimal("390.63"))  # 390.625 → never short
        self.assertEqual(fx.to_usdt(100, "USD"), Decimal("100.00"))

    def test_public_endpoint(self):
        self.refresh()
        data = APIClient().get("/api/rates/").json()
        self.assertEqual((data["base"], data["rates"]["USDT"], data["source"]), ("DZD", 256.0, "Binance P2P"))

    def test_estimates_are_never_converted_from_dinars(self):
        # Prices abroad are their own list (content migration 0018); the rate only serves payments.
        self.refresh()
        service = Service.objects.create(slug="sites", title_en="Sites", summary_en="Sites")
        ServicePrice.objects.create(service=service, currency="DZD", amount=128000, kind=ServicePrice.Kind.FROM)
        res = APIClient().post("/api/content/estimate/", {"service": "sites", "currency": "EUR"}, format="json").json()
        self.assertEqual((res["low"], res["converted"]), (None, False))


@override_settings(NEXT_REVALIDATE_URL="")
class UsdtPaymentTests(TestCase):
    def setUp(self):
        cache.clear()
        Rate.objects.create(code="USDT", dzd=Decimal("256"), source="test", fetched_at="2026-10-22T10:00:00Z")
        Service.objects.create(slug="web-platforms", title_en="Web", summary_en="Web")
        call_command("seed_pricing", verbosity=0)
        self.client_user = User.objects.create_user("c@example.com", "pass-pass-1", full_name="Client C")
        self.dev = User.objects.create_user("d@example.com", "pass-pass-2", full_name="Dev", role="developer")
        self.c, self.d = APIClient(), APIClient()
        self.c.force_authenticate(self.client_user)
        self.d.force_authenticate(self.dev)
        req = ProjectRequest.objects.create(client=self.client_user, title="Site", objectives="Site", status="submitted")
        offer = self.d.post(f"/api/requests/{req.reference}/proposals/", {
            "scope": "Site", "price": 51200, "currency": "DZD", "plan": "starter", "timeline_days": 10,
        }, format="json").json()
        self.c.post(f"/api/proposals/{offer['id']}/respond/", {"action": "accept"}, format="json")
        contract = self.c.get(f"/api/requests/{req.reference}/").json()["contract"]
        eng = self.c.post(f"/api/contracts/{contract['id']}/sign/", {"signed_name": "Client C", "agree": True}, format="json").json()
        self.deposit = eng["charges"][0]

    def pay(self, tx=TX):
        return self.c.post(f"/api/charges/{self.deposit['id']}/proofs/", {"method": "usdt", "tx_hash": tx})

    def test_usdt_needs_an_address_a_valid_hash_and_is_single_use(self):
        self.assertEqual(self.deposit["usdt_amount"], "100.00")  # 25 600 DZD deposit / 256
        self.assertEqual(self.pay().status_code, 400)  # no address yet
        site = SiteSettings.load()
        site.usdt_bep20_address = "0x" + "1" * 40
        site.save()
        self.assertEqual(self.pay("0x123").status_code, 400)
        proof = self.pay()
        self.assertEqual(proof.status_code, 201, proof.data)
        self.assertEqual((proof.data["crypto_amount"], proof.data["explorer_url"]), ("100.00", f"https://bscscan.com/tx/{TX}"))
        self.assertEqual(self.pay().status_code, 400)  # pending already
        self.d.post(f"/api/proofs/{proof.data['id']}/review/", {"decision": "approve"}, format="json")
        eng = self.c.get("/api/engagements/").json()["results"][0]
        self.assertEqual(eng["status"], "in_development")
        self.assertEqual(eng["charges"][0]["proofs"][0]["tx_hash"], TX)
