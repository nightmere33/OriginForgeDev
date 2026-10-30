"""The maintenance countdown in the conversation: reminders, the end, the close, and extensions that reopen it."""

from datetime import timedelta

from django.core import mail

from live.models import Notification

from .lifecycle import tick
from .models import Engagement, Message
from .test_lifecycle import LifecycleBase


def act(client, eng, action, **body):
    return client.post(f"/api/engagements/{eng}/action/", {"action": action, **body}, format="json")


class CareTests(LifecycleBase):
    def live_project(self) -> Engagement:
        alice, dev = self.api(self.alice), self.api(self.dev)
        eng = self.started_project()
        self.ok(act(dev, eng, "ready_for_review"))
        self.ok(act(alice, eng, "approve"))
        balance = self.ok(alice.get(f"/api/engagements/{eng}/"))["charges"][1]
        self.ok(dev.post(f"/api/charges/{balance['id']}/cash/"))
        self.ok(act(dev, eng, "go_live"))
        return Engagement.objects.select_related("request").get(pk=eng)

    def cards(self, eng):
        return list(Message.objects.filter(request=eng.request, kind="care").values_list("data", flat=True))

    def summary(self, eng):
        rows = self.ok(self.api(self.alice).get("/api/requests/"))["results"]
        return next(r for r in rows if r["reference"] == eng.request.reference)["summary"]

    def test_countdown_reminders_then_the_end_then_the_close(self):
        eng = self.live_project()  # Pro plan: 30 days
        ends = eng.maintenance_ends_at
        self.assertEqual([c["event"] for c in self.cards(eng)], ["started"])
        tick(now=ends - timedelta(days=29, hours=12))  # starts the count, says nothing
        mail.outbox.clear()
        with self.captureOnCommitCallbacks(execute=True):
            tick(now=ends - timedelta(days=14, hours=23))
            tick(now=ends - timedelta(days=14, hours=22))  # the same step: once
        self.assertEqual([(c["event"], c.get("days")) for c in self.cards(eng)][1:], [("reminder", 15)])
        self.assertEqual(len(mail.outbox), 1)
        self.assertIn("15 days of maintenance left", mail.outbox[0].subject)
        self.assertTrue(Notification.objects.filter(user=self.alice, key="maintenance_reminder").exists())

        tick(now=ends - timedelta(hours=20))  # 7 and 3 were skipped by the clock: one reminder, the latest
        self.assertEqual([c.get("days") for c in self.cards(eng) if c["event"] == "reminder"], [15, 1])
        # The last day has its own words (never "1 days"), for the client and the studio.
        self.assertTrue(Notification.objects.filter(user=self.alice, key="maintenance_last_day").exists())
        self.assertTrue(Notification.objects.filter(user=self.dev, key="studio_care_last_day").exists())
        self.assertIn("Last day of maintenance", Message.objects.filter(request=eng.request, kind="care").last().body)

        tick(now=ends + timedelta(minutes=5))
        eng.refresh_from_db()
        self.assertEqual(eng.status, "live")
        self.assertEqual(self.summary(eng)["chat"], "ending")
        self.ok(self.api(self.alice).post(f"/api/requests/{eng.request.reference}/messages/", {"body": "One last fix?"}, format="json"), 201)

        tick(now=ends + timedelta(hours=72, minutes=10))
        eng.refresh_from_db()
        self.assertEqual(eng.status, "closed")
        self.assertEqual(self.cards(eng)[-1]["event"], "closed")
        self.assertEqual(self.summary(eng)["chat"], "closed")
        res = self.api(self.alice).post(f"/api/requests/{eng.request.reference}/messages/", {"body": "Hello?"}, format="json")
        self.assertEqual(res.status_code, 400)

    def test_extending_during_the_grace_reopens_and_restarts_the_count(self):
        dev = self.api(self.dev)
        eng = self.live_project()
        ends = eng.maintenance_ends_at
        tick(now=ends + timedelta(minutes=5))
        self.ok(act(dev, eng.pk, "extend_maintenance", days=20))
        eng.refresh_from_db()
        self.assertEqual((eng.status, eng.care_ended_at), ("live", None))
        self.assertEqual(self.cards(eng)[-1]["event"], "extended")
        self.assertEqual(self.summary(eng)["chat"], "open")

    def test_a_paid_extension_reopens_a_closed_project(self):
        alice, dev = self.api(self.alice), self.api(self.dev)
        eng = self.live_project()
        self.ok(act(dev, eng.pk, "close"))
        offer = self.ok(dev.post(f"/api/engagements/{eng.pk}/extras/", {
            "label": "Maintenance, 3 more months", "amount": 30000, "currency": "DZD", "optional": True, "extends_days": 90,
        }, format="json"), 201)
        self.ok(alice.post(f"/api/charges/{offer['id']}/offer/", {"decision": "accept"}, format="json"))
        with self.captureOnCommitCallbacks(execute=True):
            self.ok(dev.post(f"/api/charges/{offer['id']}/cash/"))
        eng.refresh_from_db()
        self.assertEqual(eng.status, "live")
        self.assertGreater((eng.maintenance_ends_at - eng.production_at).days, 100)
        self.assertEqual(self.cards(eng)[-1]["event"], "extended")

    def test_extensions_are_only_for_live_projects(self):
        dev = self.api(self.dev)
        eng = self.started_project()
        res = dev.post(f"/api/engagements/{eng}/extras/", {"label": "More care", "amount": 1000, "currency": "DZD", "extends_days": 30}, format="json")
        self.assertEqual(res.status_code, 400)
