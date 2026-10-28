"""Card (Chargily) and PayPal payments of a due charge, providers simulated."""

import hashlib
import hmac
import json
from datetime import timedelta
from decimal import Decimal
from unittest import mock

from django.test import TestCase, override_settings
from django.utils import timezone

from content.models import SiteSettings
from engagements import test_lifecycle as lt
from engagements.lifecycle import tick
from engagements.models import Engagement

from . import online
from .models import Charge, Payment, WebhookEvent

KEYS = dict(CHARGILY_SECRET_KEY="test_sk_unit", CHARGILY_MODE="test", PAYPAL_CLIENT_ID="cid-unit", PAYPAL_CLIENT_SECRET="secret-unit",
            PAYPAL_WEBHOOK_ID="WH-UNIT", PAYPAL_MODE="sandbox", SITE_URL="https://originforge.test",
            PRIVATE_MEDIA_ROOT=lt.TMP, MEDIA_ROOT=lt.TMP, NEXT_REVALIDATE_URL="")
CHECKOUT = {"id": "ch_unit_1", "checkout_url": "https://pay.chargily.net/test/checkouts/ch_unit_1/pay"}


def paypal_order(order_id="ORDER-1", status="CREATED", capture=None):
    order = {"id": order_id, "status": status,
             "links": [{"rel": "payer-action", "href": f"https://www.sandbox.paypal.com/checkoutnow?token={order_id}"}]}
    if capture:
        order["purchase_units"] = [{"payments": {"captures": [capture]}}]
    return order


def captured(value, currency="USD"):
    return paypal_order(status="COMPLETED", capture={"id": "CAP-1", "status": "COMPLETED", "amount": {"currency_code": currency, "value": value}})


@override_settings(**KEYS)
class OnlinePaymentTests(TestCase):
    setUp_base = lt.LifecycleTests.setUp
    api = lt.LifecycleTests.api
    ok = lt.LifecycleTests.ok
    submitted_request = lt.LifecycleTests.submitted_request
    offer = lt.LifecycleTests.offer

    def setUp(self):
        self.setUp_base()
        site = SiteSettings.load()
        site.usdt_rate_override = Decimal("258.46")
        site.save()

    def due_deposit(self, price=200000, currency="DZD"):
        alice = self.api(self.alice)
        ref = self.submitted_request()
        v1 = self.offer(ref, price=price, currency=currency)
        self.ok(alice.post(f"/api/proposals/{v1['id']}/respond/", {"action": "accept"}, format="json"))
        contract = self.ok(alice.get(f"/api/requests/{ref}/"))["contract"]
        eng = self.ok(alice.post(f"/api/contracts/{contract['id']}/sign/", {"signed_name": "Alice A", "agree": True}, format="json"), 201)
        return eng, eng["charges"][0]

    def start(self, charge_id, provider, user=None):
        return self.api(user or self.alice).post(f"/api/charges/{charge_id}/checkout/", {"provider": provider}, format="json")

    def chargily_notice(self, data, kind="checkout.paid", event_id="evt_1", key="test_sk_unit", livemode=False):
        body = json.dumps({"id": event_id, "type": kind, "livemode": livemode, "data": data}).encode()
        sig = hmac.new(key.encode(), body, hashlib.sha256).hexdigest()
        return self.client.post("/webhooks/chargily/", body, content_type="application/json", HTTP_SIGNATURE=sig)

    def engagement(self, eng):
        return Engagement.objects.get(pk=eng["id"])

    # ── What the panel offers ──────────────────────────────────────────

    def test_a_dzd_charge_offers_card_and_paypal_converted_up_to_the_cent(self):
        _, deposit = self.due_deposit()
        self.assertEqual(deposit["amount"], 80000)
        self.assertEqual(deposit["online"]["chargily"], {"amount": 80000, "currency": "DZD"})
        pp = deposit["online"]["paypal"]
        # 80 000 / 258.46 = 309.5257…, rounded up: the studio never receives less than the charge.
        self.assertEqual((pp["amount"], pp["currency"], pp["conversion"]["rate"]), ("309.53", "USD", "258.46"))
        self.assertEqual(pp["client_id"], "cid-unit")

    def test_a_euro_charge_is_paid_in_euros_through_paypal_only(self):
        _, deposit = self.due_deposit(price=1500, currency="EUR")
        self.assertNotIn("chargily", deposit["online"])
        self.assertEqual((deposit["online"]["paypal"]["amount"], deposit["online"]["paypal"]["currency"]), ("600.00", "EUR"))
        self.assertNotIn("conversion", deposit["online"]["paypal"])

    @override_settings(CHARGILY_SECRET_KEY="", PAYPAL_CLIENT_ID="")
    def test_nothing_online_without_keys(self):
        _, deposit = self.due_deposit()
        self.assertEqual(deposit["online"], {})
        self.assertEqual(self.start(deposit["id"], "chargily").status_code, 400)

    # ── Chargily ───────────────────────────────────────────────────────

    @mock.patch("billing.chargily.create_checkout", return_value=CHECKOUT)
    def test_card_checkout_opens_once_and_only_for_the_client(self, create):
        eng, deposit = self.due_deposit()
        first = self.ok(self.start(deposit["id"], "chargily"), 201)
        self.assertEqual(first["url"], CHECKOUT["checkout_url"])
        args = create.call_args.kwargs
        self.assertEqual((args["amount"], args["locale"]), (80000, "en"))
        self.assertTrue(args["success_url"].startswith("https://originforge.test/en/portal/requests/"))
        self.assertEqual(args["webhook_endpoint"], "https://originforge.test/webhooks/chargily/")
        # A double click or a reload reuses the open page.
        self.assertEqual(self.ok(self.start(deposit["id"], "chargily"), 201)["id"], first["id"])
        self.assertEqual(create.call_count, 1)
        self.assertEqual(self.start(deposit["id"], "chargily", user=self.bob).status_code, 404)
        self.assertEqual(self.start(deposit["id"], "chargily", user=self.dev).status_code, 403)

    @mock.patch("billing.chargily.create_checkout", return_value=CHECKOUT)
    def test_a_signed_paid_notice_settles_the_deposit_once(self, _):
        eng, deposit = self.due_deposit()
        self.ok(self.start(deposit["id"], "chargily"), 201)
        data = {"id": "ch_unit_1", "status": "paid", "amount": 80000, "currency": "dzd"}
        self.assertEqual(self.chargily_notice(data, key="wrong").status_code, 403)
        self.assertEqual(self.chargily_notice(data).status_code, 200)
        self.assertEqual(Charge.objects.get(pk=deposit["id"]).status, "paid")
        self.assertEqual(self.engagement(eng).status, "in_development")
        # The same notice again changes nothing.
        self.assertEqual(self.chargily_notice(data).status_code, 200)
        self.assertEqual(Payment.objects.filter(charge_id=deposit["id"], status="paid").count(), 1)
        self.assertTrue(WebhookEvent.objects.get(provider="chargily", event_id="evt_1").processed_at)
        panel = self.ok(self.api(self.alice).get(f"/api/engagements/{eng['id']}/"))["charges"][0]
        self.assertEqual((panel["status"], panel["paid_by"], panel["online"]), ("paid", "chargily", {}))

    @mock.patch("billing.chargily.create_checkout", return_value=CHECKOUT)
    def test_a_smaller_amount_or_a_live_notice_on_a_test_server_settles_nothing(self, _):
        _, deposit = self.due_deposit()
        self.ok(self.start(deposit["id"], "chargily"), 201)
        self.assertEqual(self.chargily_notice({"id": "ch_unit_1", "amount": 80000, "currency": "dzd"}, livemode=True).status_code, 400)
        self.chargily_notice({"id": "ch_unit_1", "amount": 8000, "currency": "dzd"}, event_id="evt_2")
        self.assertEqual(Charge.objects.get(pk=deposit["id"]).status, "due")
        self.assertIn("another amount", Payment.objects.get(provider_ref="ch_unit_1").detail)

    @mock.patch("billing.chargily.create_checkout", return_value=CHECKOUT)
    def test_a_failed_card_leaves_the_charge_due_and_the_client_can_retry(self, create):
        _, deposit = self.due_deposit()
        self.ok(self.start(deposit["id"], "chargily"), 201)
        self.chargily_notice({"id": "ch_unit_1", "status": "failed"}, kind="checkout.failed")
        self.assertEqual(Payment.objects.get(provider_ref="ch_unit_1").status, "failed")
        self.assertEqual(Charge.objects.get(pk=deposit["id"]).status, "due")
        create.return_value = {"id": "ch_unit_2", "checkout_url": "https://pay.chargily.net/test/checkouts/ch_unit_2/pay"}
        self.assertEqual(self.ok(self.start(deposit["id"], "chargily"), 201)["url"], create.return_value["checkout_url"])

    @mock.patch("billing.chargily.retrieve_checkout", return_value={"id": "ch_unit_1", "status": "paid", "amount": 80000, "currency": "dzd"})
    @mock.patch("billing.chargily.create_checkout", return_value=CHECKOUT)
    def test_back_on_the_site_a_late_notice_is_chased(self, _, retrieve):
        _, deposit = self.due_deposit()
        pay = self.ok(self.start(deposit["id"], "chargily"), 201)
        # Straight back: the notice gets a few seconds first.
        self.assertEqual(self.ok(self.api(self.alice).get(f"/api/payments/{pay['id']}/"))["status"], "pending")
        retrieve.assert_not_called()
        Payment.objects.filter(pk=pay["id"]).update(created_at=timezone.now() - timedelta(seconds=30))
        state = self.ok(self.api(self.alice).get(f"/api/payments/{pay['id']}/"))
        self.assertEqual((state["status"], state["charge_status"]), ("paid", "paid"))
        self.assertEqual(self.api(self.bob).get(f"/api/payments/{pay['id']}/").status_code, 404)

    # ── PayPal ─────────────────────────────────────────────────────────

    @mock.patch("billing.paypal.capture", return_value=captured("309.53"))
    @mock.patch("billing.paypal.get_order", return_value=paypal_order(status="APPROVED"))
    @mock.patch("billing.paypal.create_order", return_value=paypal_order())
    def test_paypal_locks_the_quote_then_captures_exactly_it(self, create, _, capture):
        eng, deposit = self.due_deposit()
        pay = self.ok(self.start(deposit["id"], "paypal"), 201)
        self.assertEqual((pay["order_id"], pay["provider_amount"], pay["provider_currency"]), ("ORDER-1", "309.53", "USD"))
        args = create.call_args.kwargs
        self.assertEqual((args["amount"], args["currency"]), ("309.53", "USD"))
        # The rate moves after the order is made: the order keeps its amount.
        site = SiteSettings.load()
        site.usdt_rate_override = Decimal("240")
        site.save()
        state = self.ok(self.api(self.alice).post(f"/api/payments/{pay['id']}/approved/"))
        capture.assert_called_once()
        self.assertEqual((state["status"], state["charge_status"]), ("paid", "paid"))
        self.assertEqual(self.engagement(eng).status, "in_development")

    @mock.patch("billing.paypal.capture", return_value=captured("300.00"))
    @mock.patch("billing.paypal.get_order", return_value=paypal_order(status="APPROVED"))
    @mock.patch("billing.paypal.create_order", return_value=paypal_order())
    def test_a_capture_of_another_amount_is_held_for_a_look(self, *_):
        _, deposit = self.due_deposit()
        pay = self.ok(self.start(deposit["id"], "paypal"), 201)
        state = self.ok(self.api(self.alice).post(f"/api/payments/{pay['id']}/approved/"))
        self.assertEqual((state["status"], state["charge_status"]), ("pending", "due"))

    @mock.patch("billing.paypal.verify_webhook", return_value=True)
    @mock.patch("billing.paypal.get_order", return_value=captured("309.53"))
    @mock.patch("billing.paypal.create_order", return_value=paypal_order())
    def test_paypal_notices_settle_then_report_a_refund(self, create, get_order, verify):
        _, deposit = self.due_deposit()
        pay = self.ok(self.start(deposit["id"], "paypal"), 201)
        notice = lambda kind, eid: self.client.post("/webhooks/paypal/", json.dumps({  # noqa: E731
            "id": eid, "event_type": kind, "resource": {"id": "CAP-1", "custom_id": str(pay["id"])}}), content_type="application/json")
        self.assertEqual(notice("PAYMENT.CAPTURE.COMPLETED", "WH-1").status_code, 200)
        self.assertEqual(Charge.objects.get(pk=deposit["id"]).status, "paid")
        notice("PAYMENT.CAPTURE.REFUNDED", "WH-2")
        self.assertEqual(Payment.objects.get(pk=pay["id"]).status, "refunded")
        self.assertEqual(Charge.objects.get(pk=deposit["id"]).status, "paid")  # Younes decides what that means
        verify.return_value = False
        self.assertEqual(notice("PAYMENT.CAPTURE.COMPLETED", "WH-3").status_code, 403)

    @mock.patch("billing.paypal.get_order", return_value=paypal_order(status="APPROVED"))
    @mock.patch("billing.paypal.capture", return_value=captured("309.53"))
    @mock.patch("billing.paypal.create_order", return_value=paypal_order())
    def test_back_from_paypal_s_page_captures_and_lands_on_the_project(self, *_):
        _, deposit = self.due_deposit()
        pay = self.ok(self.start(deposit["id"], "paypal"), 201)
        res = self.client.get("/api/payments/paypal/return/", {"token": "ORDER-1", "PayerID": "P1"})
        self.assertEqual(res.status_code, 302)
        self.assertIn(f"?payment={pay['id']}", res["Location"])
        self.assertEqual(Charge.objects.get(pk=deposit["id"]).status, "paid")

    # ── Edges ──────────────────────────────────────────────────────────

    @mock.patch("billing.chargily.create_checkout", return_value=CHECKOUT)
    def test_paid_online_after_being_paid_another_way_is_flagged_not_counted_twice(self, _):
        _, deposit = self.due_deposit()
        self.ok(self.start(deposit["id"], "chargily"), 201)
        self.ok(self.api(self.dev).post(f"/api/charges/{deposit['id']}/cash/"))
        with mock.patch("billing.online.notify_studio_event") as studio:
            self.chargily_notice({"id": "ch_unit_1", "status": "paid", "amount": 80000, "currency": "dzd"})
        self.assertEqual(studio.call_args.args[0], "studio_payment_attention")
        self.assertEqual(Charge.objects.get(pk=deposit["id"]).payments.filter(status="paid").count(), 2)

    @mock.patch("billing.chargily.retrieve_checkout", return_value={"id": "ch_unit_1", "status": "pending"})
    @mock.patch("billing.chargily.create_checkout", return_value=CHECKOUT)
    def test_the_window_waits_for_someone_on_the_payment_page_then_gives_up(self, _, retrieve):
        eng, deposit = self.due_deposit()
        self.ok(self.start(deposit["id"], "chargily"), 201)
        charge = Charge.objects.get(pk=deposit["id"])
        late = charge.due_at + timedelta(minutes=1)
        Payment.objects.filter(provider_ref="ch_unit_1").update(created_at=late - timedelta(minutes=10))
        tick(now=late)
        self.assertEqual(Charge.objects.get(pk=deposit["id"]).status, "due")
        retrieve.assert_called()
        # Hours later, still unpaid: the page is given up and the window closes.
        later = late + timedelta(hours=7)
        with mock.patch("billing.online.timezone.now", return_value=later):
            tick(now=later)
        self.assertEqual(Payment.objects.get(provider_ref="ch_unit_1").status, "expired")
        tick(now=later)
        self.assertEqual(Charge.objects.get(pk=deposit["id"]).status, "expired")

    def test_cash_by_hand_only_where_younes_allowed_it(self):
        eng, deposit = self.due_deposit()
        self.assertFalse(eng["cash_allowed"])
        res = self.api(self.alice).post(f"/api/charges/{deposit['id']}/proofs/", {"method": "cash"}, format="json")
        self.assertEqual(res.status_code, 400)
        self.assertIn("method", res.data)

    def test_a_trusted_client_can_say_they_paid_cash(self):
        alice = self.api(self.alice)
        ref = self.submitted_request()
        v1 = self.offer(ref, allow_cash=True)
        self.assertTrue(v1["allow_cash"])
        self.ok(alice.post(f"/api/proposals/{v1['id']}/respond/", {"action": "accept"}, format="json"))
        contract = self.ok(alice.get(f"/api/requests/{ref}/"))["contract"]
        eng = self.ok(alice.post(f"/api/contracts/{contract['id']}/sign/", {"signed_name": "Alice A", "agree": True}, format="json"), 201)
        self.assertTrue(eng["cash_allowed"])
        self.ok(alice.post(f"/api/charges/{eng['charges'][0]['id']}/proofs/", {"method": "cash", "note": "Handed over in Dellys"}, format="json"), 201)

    def test_quote_rounds_up_and_never_short_changes(self):
        charge = Charge(amount=1000, currency="DZD", status=Charge.Status.DUE)
        amount, currency = online.quote(charge, Payment.Provider.PAYPAL)
        self.assertEqual((str(amount), currency), ("3.87", "USD"))  # 1000 / 258.46 = 3.8690…
        self.assertGreaterEqual(amount * Decimal("258.46"), 1000)
