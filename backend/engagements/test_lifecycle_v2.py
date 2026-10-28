"""
Lifecycle v2 (docs/ROADMAP_V2.md): the payment schedule, extra costs and
offers, invoices, revision rounds, live projects, negotiation and the chat.
"""

from datetime import timedelta

from django.core import mail
from django.utils import timezone

from billing.models import Invoice
from content.models import Service, SiteSettings
from live.models import Notification

from .lifecycle import tick
from .models import Engagement
from .test_lifecycle import LifecycleBase, png


def act(client, eng, action, **body):
    return client.post(f"/api/engagements/{eng}/action/", {"action": action, **body}, format="json")


class ScheduleTests(LifecycleBase):
    def test_the_client_pays_a_scheduled_part_early_without_reminders(self):
        alice, bob = self.api(self.alice), self.api(self.bob)
        eng = self.started_project()
        balance = self.ok(alice.get(f"/api/engagements/{eng}/"))["charges"][1]
        self.assertEqual((balance["status"], balance["can_pay_early"]), ("scheduled", True))
        self.assertEqual(bob.post(f"/api/charges/{balance['id']}/pay-early/").status_code, 404)
        self.assertEqual(self.ok(alice.post(f"/api/charges/{balance['id']}/pay-early/"))["status"], "due")
        self.assertEqual(tick(now=timezone.now() + timedelta(days=4, minutes=1))["reminders"], 0)

    def test_parts_are_asked_once_work_started_and_the_rest_at_review(self):
        alice, dev = self.api(self.alice), self.api(self.dev)
        ref = self.submitted_request()
        v1 = self.offer(ref, price=600000)  # 40 / 30 / 30
        self.ok(alice.post(f"/api/proposals/{v1['id']}/respond/", {"action": "accept"}, format="json"))
        contract = self.ok(alice.get(f"/api/requests/{ref}/"))["contract"]
        eng = self.ok(alice.post(f"/api/contracts/{contract['id']}/sign/", {"signed_name": "Alice A", "agree": True}, format="json"), 201)
        deposit, milestone, _ = eng["charges"]
        self.assertEqual(dev.post(f"/api/charges/{milestone['id']}/request/").status_code, 400)  # the deposit comes first
        self.assertEqual(alice.post(f"/api/charges/{milestone['id']}/pay-early/").status_code, 400)
        self.ok(dev.post(f"/api/charges/{deposit['id']}/cash/"))
        self.assertEqual(self.ok(dev.post(f"/api/charges/{milestone['id']}/request/"))["status"], "due")
        self.ok(act(dev, eng["id"], "ready_for_review"))
        charges = self.ok(alice.get(f"/api/engagements/{eng['id']}/"))["charges"]
        self.assertEqual([c["status"] for c in charges], ["paid", "due", "due"])


class ExtrasTests(LifecycleBase):
    def test_a_required_extra_is_due_at_once_with_a_card_and_its_own_invoice(self):
        alice, dev, bob = self.api(self.alice), self.api(self.dev), self.api(self.bob)
        self.ok(dev.patch("/api/studio/settings/", {"seller_name": "Younes Ouali (auto-entrepreneur)",
                                                     "seller_tax_ids": "NIF: 123\nNIS: 456"}, format="json"))
        eng = self.started_project()
        ref = Engagement.objects.get(pk=eng).request.reference
        self.assertEqual(alice.post(f"/api/engagements/{eng}/extras/", {"label": "x", "amount": 1, "currency": "DZD"}, format="json").status_code, 403)
        mail.outbox.clear()
        with self.captureOnCommitCallbacks(execute=True):
            extra = self.ok(dev.post(f"/api/engagements/{eng}/extras/", {
                "label": "AI credits", "description": "OpenAI usage for the chatbot", "amount": 5000, "currency": "DZD",
            }, format="json"), 201)
        self.assertEqual((extra["kind"], extra["status"], extra["optional"]), ("extra", "due", False))
        self.assertTrue(any("AI credits" in m.subject for m in mail.outbox))
        card = self.ok(alice.get(f"/api/requests/{ref}/messages/"))[-1]
        self.assertEqual((card["kind"], card["charge"]["id"], card["charge"]["label"]), ("charge", extra["id"], "AI credits"))
        self.assertEqual(self.ok(alice.get(f"/api/engagements/{eng}/"))["price"], 200000)  # never in the contract total

        # Paid like any payment, with the next invoice number and the PDF attached.
        mail.outbox.clear()
        with self.captureOnCommitCallbacks(execute=True):
            self.ok(dev.post(f"/api/charges/{extra['id']}/cash/"))
        year = timezone.now().year
        self.assertEqual(sorted(Invoice.objects.values_list("number", flat=True)), [f"OF-{year}-0001", f"OF-{year}-0002"])
        receipt = next(m for m in mail.outbox if "received" in m.subject.lower())
        self.assertEqual(receipt.attachments[0][0], f"OF-{year}-0002.pdf")
        self.assertTrue(receipt.attachments[0][1].startswith(b"%PDF"))
        invoice = Invoice.objects.get(number=f"OF-{year}-0002")
        self.assertEqual((invoice.seller["name"], invoice.seller["tax_ids"]), ("Younes Ouali (auto-entrepreneur)", ["NIF: 123", "NIS: 456"]))
        self.assertIsNotNone(invoice.emailed_at)

        listed = self.ok(alice.get(f"/api/invoices/?reference={ref}"))["results"]
        self.assertEqual([i["number"] for i in listed], [f"OF-{year}-0002", f"OF-{year}-0001"])
        pdf = alice.get(f"/api/invoices/{invoice.pk}/pdf/")
        self.assertEqual(pdf.status_code, 200)
        self.assertTrue(b"".join(pdf.streaming_content).startswith(b"%PDF"))
        self.assertEqual(bob.get(f"/api/invoices/{invoice.pk}/pdf/").status_code, 404)
        self.assertEqual(self.ok(bob.get("/api/invoices/"))["count"], 0)
        charge = self.ok(alice.get(f"/api/engagements/{eng}/"))["charges"][-1]
        self.assertEqual(charge["invoice"]["number"], f"OF-{year}-0002")

    def test_offers_are_accepted_or_declined_and_only_money_owed_blocks_launch(self):
        alice, dev, bob = self.api(self.alice), self.api(self.dev), self.api(self.bob)
        eng = self.started_project()

        def offer(label):
            return self.ok(dev.post(f"/api/engagements/{eng}/extras/", {
                "label": label, "amount": 15000, "currency": "DZD", "optional": True}, format="json"), 201)

        seo, logo, hosting = offer("SEO pack"), offer("Logo animation"), offer("Hosting, one year")
        self.assertEqual(seo["status"], "proposed")
        self.assertEqual(bob.post(f"/api/charges/{seo['id']}/offer/", {"decision": "accept"}, format="json").status_code, 404)
        self.assertEqual(self.ok(alice.post(f"/api/charges/{seo['id']}/offer/", {"decision": "decline"}, format="json"))["status"], "declined")
        self.assertEqual(self.ok(alice.post(f"/api/charges/{logo['id']}/offer/", {"decision": "accept"}, format="json"))["status"], "due")
        self.assertEqual(alice.post(f"/api/charges/{logo['id']}/offer/", {"decision": "decline"}, format="json").status_code, 400)
        self.assertEqual(self.ok(dev.post(f"/api/charges/{hosting['id']}/withdraw/"))["status"], "void")
        self.assertEqual(dev.post(f"/api/charges/{seo['id']}/withdraw/").status_code, 400)  # already answered

        self.ok(act(dev, eng, "ready_for_review"))
        self.ok(act(alice, eng, "approve"))
        balance = self.ok(alice.get(f"/api/engagements/{eng}/"))["charges"][1]
        self.ok(dev.post(f"/api/charges/{balance['id']}/cash/"))
        self.assertEqual(act(dev, eng, "go_live").status_code, 400)  # the accepted offer is owed
        self.ok(dev.post(f"/api/charges/{logo['id']}/cash/"))
        self.assertEqual(self.ok(act(dev, eng, "go_live"))["status"], "live")


class RoundsAndLiveTests(LifecycleBase):
    def test_every_round_is_listed_and_the_studio_can_grant_one_more(self):
        alice, dev = self.api(self.alice), self.api(self.dev)
        eng = self.started_project()
        m1 = self.ok(alice.get(f"/api/engagements/{eng}/"))["milestones"][0]["id"]
        self.ok(dev.post(f"/api/milestones/{m1}/move/", {"status": "review"}, format="json"))
        self.ok(alice.post(f"/api/milestones/{m1}/review/", {"decision": "changes", "note": "Warmer colours"}, format="json"))
        for note in ("Bigger logo", "New footer"):
            self.ok(act(dev, eng, "ready_for_review"))
            self.ok(act(alice, eng, "request_changes", note=note))
        self.ok(act(dev, eng, "ready_for_review"))
        self.assertEqual(act(alice, eng, "request_changes", note="More").status_code, 400)  # Pro: 3 rounds
        self.assertEqual(act(alice, eng, "grant_revision").status_code, 403)
        with self.captureOnCommitCallbacks(execute=True):
            e = self.ok(act(dev, eng, "grant_revision"))
        self.assertEqual((e["revisions_left"], e["revisions_granted"], e["revision_rounds"]), (1, 1, 4))
        self.assertTrue(Notification.objects.filter(user=self.alice, key="revision_granted", path__endswith="?tab=progress").exists())
        e = self.ok(act(alice, eng, "request_changes", note="More"))
        self.assertEqual([(r["number"], r["milestone"], r["note"]) for r in e["revisions"]], [
            (1, "Design", "Warmer colours"), (2, None, "Bigger logo"), (3, None, "New footer"), (4, None, "More")])

    def live_project(self) -> int:
        alice, dev = self.api(self.alice), self.api(self.dev)
        eng = self.started_project()
        self.ok(act(dev, eng, "ready_for_review"))
        self.ok(act(alice, eng, "approve"))
        balance = self.ok(alice.get(f"/api/engagements/{eng}/"))["charges"][1]
        self.ok(dev.post(f"/api/charges/{balance['id']}/cash/"))
        self.ok(act(dev, eng, "go_live"))
        return eng

    def test_a_live_project_takes_problem_reports_more_maintenance_and_closes(self):
        alice, dev = self.api(self.alice), self.api(self.dev)
        eng = self.live_project()
        ref = Engagement.objects.get(pk=eng).request.reference
        self.assertEqual(act(alice, eng, "report_issue").status_code, 400)  # say what is wrong
        with self.captureOnCommitCallbacks(execute=True):
            self.ok(act(alice, eng, "report_issue", note="The checkout button does nothing"))
        issue = self.ok(alice.get(f"/api/requests/{ref}/messages/"))[-1]
        self.assertEqual((issue["kind"], issue["from_studio"]), ("issue", False))
        self.assertTrue(Notification.objects.filter(user=self.dev, key="studio_issue", path__endswith="?tab=messages").exists())

        ends = Engagement.objects.get(pk=eng).maintenance_ends_at
        self.assertEqual(act(dev, eng, "extend_maintenance").status_code, 400)
        self.assertEqual(act(alice, eng, "extend_maintenance", days=30).status_code, 403)
        self.ok(act(dev, eng, "extend_maintenance", days=30))
        self.assertEqual(Engagement.objects.get(pk=eng).maintenance_ends_at, ends + timedelta(days=30))

        self.assertEqual(self.ok(act(dev, eng, "close"))["status"], "closed")
        self.assertEqual(act(alice, eng, "report_issue", note="Again").status_code, 400)
        self.assertEqual(self.ok(act(dev, eng, "extend_maintenance", days=10))["status"], "live")  # back in care

    def test_a_progress_update_is_a_card_in_the_conversation(self):
        alice, dev = self.api(self.alice), self.api(self.dev)
        eng = self.started_project()
        ref = Engagement.objects.get(pk=eng).request.reference
        with self.captureOnCommitCallbacks(execute=True):
            self.ok(dev.post(f"/api/engagements/{eng}/updates/", {"title": "Home page done", "body": "Preview: https://dev.example.com",
                                                                  "files": png()}, format="multipart"), 201)
        card = self.ok(alice.get(f"/api/requests/{ref}/messages/"))[-1]
        self.assertEqual((card["kind"], card["update"]["title"], len(card["update"]["attachments"])), ("update", "Home page done", 1))
        self.assertTrue(Notification.objects.filter(user=self.alice, key="update_posted", path__endswith="?tab=progress").exists())


class SummaryTests(LifecycleBase):
    def test_the_list_summarises_each_project_for_its_card(self):
        alice, dev = self.api(self.alice), self.api(self.dev)
        eng = self.started_project()
        ref = Engagement.objects.get(pk=eng).request.reference
        self.ok(dev.post(f"/api/requests/{ref}/messages/", {"body": "Kick-off notes attached", "file": png()}), 201)
        s = self.ok(alice.get("/api/requests/"))["results"][0]["summary"]
        self.assertEqual((s["percent"], s["paid"], s["total"], s["unread"], s["waiting"]), (40, 80000, 200000, 1, ""))
        self.assertTrue(s["plan"])
        self.assertEqual(self.ok(dev.get("/api/requests/"))["results"][0]["summary"]["unread"], 0)  # his own message
        self.ok(dev.post(f"/api/engagements/{eng}/extras/", {"label": "Hosting", "amount": 9000, "currency": "DZD", "optional": True}, format="json"), 201)
        self.assertEqual(self.ok(alice.get("/api/requests/"))["results"][0]["summary"]["waiting"], "offer")
        files = self.ok(alice.get(f"/api/requests/{ref}/"))["files"]
        self.assertEqual([(f["original_name"], f["source"]) for f in files], [("receipt.png", "chat")])


class NegotiationAndChatTests(LifecycleBase):
    def test_a_fixed_price_offer_can_only_be_accepted_or_declined(self):
        alice = self.api(self.alice)
        ref = self.submitted_request()
        v1 = self.offer(ref, negotiable=False)
        seen = self.ok(alice.get(f"/api/requests/{ref}/"))["proposals"][0]
        self.assertEqual((seen["negotiable"], seen["can_respond"], seen["can_counter"]), (False, True, False))
        self.assertEqual(alice.post(f"/api/proposals/{v1['id']}/respond/", {"action": "counter", "price": 1000}, format="json").status_code, 400)
        self.ok(alice.post(f"/api/proposals/{v1['id']}/respond/", {"action": "accept"}, format="json"))

    def test_product_films_are_a_fixed_price_unless_opened(self):
        Service.objects.create(slug="product-films", title_en="Films", summary_en="Films", accept_directly=True)
        site = SiteSettings.load()
        site.save()
        alice, bob = self.api(self.alice), self.api(self.bob)
        a = self.ok(alice.post("/api/requests/", {"title": "Ad", "objectives": "Launch", "service": "product-films"}, format="json"), 201)
        b = self.ok(bob.post("/api/requests/", {"title": "Teaser", "objectives": "Launch", "service": "product-films"}, format="json"), 201)
        self.assertFalse(self.offer(a["reference"], price=30000)["negotiable"])
        self.assertTrue(self.offer(b["reference"], price=30000, negotiable=True)["negotiable"])
        self.assertTrue(self.offer(self.submitted_request())["negotiable"])

    def test_replies_quote_and_reactions_toggle(self):
        alice, dev, bob = self.api(self.alice), self.api(self.dev), self.api(self.bob)
        ref = self.submitted_request()
        first = self.ok(alice.post(f"/api/requests/{ref}/messages/", {"body": "Can we add a blog?"}, format="json"), 201)
        reply = self.ok(dev.post(f"/api/requests/{ref}/messages/", {"body": "Yes, easily.", "reply_to": first["id"]}, format="json"), 201)
        self.assertEqual((reply["reply_to"]["id"], reply["reply_to"]["body"], reply["reply_to"]["from_studio"]),
                         (first["id"], "Can we add a blog?", False))
        self.assertEqual(dev.post(f"/api/requests/{ref}/messages/", {"body": "x", "reply_to": 999999}, format="json").status_code, 400)

        url = f"/api/messages/{reply['id']}/react/"
        self.assertEqual(self.ok(alice.post(url, {"emoji": "\U0001f44d"}, format="json"))["reactions"],
                         [{"emoji": "\U0001f44d", "count": 1, "mine": True}])
        self.ok(dev.post(url, {"emoji": "❤️"}, format="json"))
        mine = self.ok(alice.post(url, {"emoji": "\U0001f525"}, format="json"))["reactions"]
        self.assertEqual(sorted((r["emoji"], r["count"], r["mine"]) for r in mine),
                         sorted([("❤️", 1, False), ("\U0001f525", 1, True)]))
        self.assertEqual(len(self.ok(alice.post(url, {"emoji": "\U0001f525"}, format="json"))["reactions"]), 1)  # taken back
        self.assertEqual(alice.post(url, {"emoji": "x"}, format="json").status_code, 400)
        self.assertEqual(bob.post(url, {"emoji": "\U0001f44d"}, format="json").status_code, 404)
        listed = self.ok(alice.get(f"/api/requests/{ref}/messages/"))[-1]
        self.assertEqual(listed["reactions"], [{"emoji": "❤️", "count": 1, "mine": False}])
