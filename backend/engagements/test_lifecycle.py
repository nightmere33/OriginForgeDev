"""The client lifecycle, end to end, against docs/BUSINESS_RULES.md."""

import io
import shutil
import tempfile
from datetime import timedelta

from django.core.cache import cache
from django.core.files.uploadedfile import SimpleUploadedFile
from django.core.management import call_command
from django.test import TestCase, override_settings
from django.utils import timezone
from PIL import Image
from rest_framework.test import APIClient

from accounts.models import User
from billing.models import Charge
from content.models import Service

from .lifecycle import tick
from .models import Engagement, ProjectRequest, Proposal

TMP = tempfile.mkdtemp()


def png() -> SimpleUploadedFile:
    buf = io.BytesIO()
    Image.new("RGB", (8, 8), "orange").save(buf, "PNG")
    return SimpleUploadedFile("receipt.png", buf.getvalue(), content_type="image/png")


@override_settings(PRIVATE_MEDIA_ROOT=TMP, MEDIA_ROOT=TMP, NEXT_REVALIDATE_URL="")
class LifecycleBase(TestCase):
    """Clients, the studio, and the shortcuts every lifecycle test starts from."""

    @classmethod
    def tearDownClass(cls):
        super().tearDownClass()
        shutil.rmtree(TMP, ignore_errors=True)

    def setUp(self):
        cache.clear()  # throttle counters live in the cache
        Service.objects.create(slug="web-platforms", title_en="Web platforms", summary_en="Platforms")
        call_command("seed_pricing", verbosity=0)
        self.alice = User.objects.create_user("alice@example.com", "pass-pass-1", full_name="Alice A", email_verified_at=timezone.now())
        self.bob = User.objects.create_user("bob@example.com", "pass-pass-2", full_name="Bob B", email_verified_at=timezone.now())
        self.dev = User.objects.create_user("younes@example.com", "pass-pass-3", full_name="Younes", role="developer", email_verified_at=timezone.now())

    def api(self, user) -> APIClient:
        c = APIClient()
        c.force_authenticate(user)
        return c

    def ok(self, res, code=200):
        self.assertEqual(res.status_code, code, getattr(res, "data", res))
        return res.data

    def submitted_request(self) -> str:
        alice = self.api(self.alice)
        draft = self.ok(alice.post("/api/requests/", {
            "draft": True, "title": "Rental site", "objectives": "Bookings online", "service": "web-platforms",
            "plan": "pro", "options": {"speed": "fast"}, "budget_currency": "DZD",
        }, format="json"), 201)
        ref = draft["reference"]
        self.assertEqual(draft["status"], "draft")
        self.assertEqual(draft["estimate_low"], 216000)  # 150 000 × 1.25 × 1.15, rounded
        self.ok(alice.post(f"/api/requests/{ref}/submit/"))
        return ref

    def offer(self, ref, price=200000, **extra):
        body = {"scope": "Booking platform", "price": price, "currency": "DZD", "plan": "pro", "timeline_days": 30,
                "milestones": [{"title": "Design", "days": 10}, {"title": "Build", "days": 20}], **extra}
        return self.ok(self.api(self.dev).post(f"/api/requests/{ref}/proposals/", body, format="json"), 201)

    def started_project(self, price=200000):
        """A signed project with its deposit confirmed: in development."""
        alice, dev = self.api(self.alice), self.api(self.dev)
        ref = self.submitted_request()
        v1 = self.offer(ref, price=price)
        self.ok(alice.post(f"/api/proposals/{v1['id']}/respond/", {"action": "accept"}, format="json"))
        contract = self.ok(alice.get(f"/api/requests/{ref}/"))["contract"]
        eng = self.ok(alice.post(f"/api/contracts/{contract['id']}/sign/", {"signed_name": "Alice A", "agree": True}, format="json"), 201)
        self.ok(dev.post(f"/api/charges/{eng['charges'][0]['id']}/cash/"))
        return eng["id"]


class LifecycleTests(LifecycleBase):
    def test_full_lifecycle(self):
        alice, dev, bob = self.api(self.alice), self.api(self.dev), self.api(self.bob)
        ref = self.submitted_request()
        self.assertEqual(bob.patch(f"/api/requests/{ref}/", {"title": "x"}, format="json").status_code, 404)
        self.assertEqual(alice.patch(f"/api/requests/{ref}/", {"title": "x"}, format="json").status_code, 403)  # no longer a draft

        # Proposal, counter-offer, accepted counter → contract.
        v1 = self.offer(ref)
        self.assertEqual(v1["schedule"], [{"label": "Deposit", "percent": 40}, {"label": "Final payment", "percent": 60}])
        self.assertFalse(v1["can_respond"])  # Younes does not answer his own offer
        seen = self.ok(alice.get(f"/api/requests/{ref}/"))["proposals"][0]
        self.assertTrue(seen["can_respond"] and seen["can_counter"])
        v2 = self.ok(alice.post(f"/api/proposals/{v1['id']}/respond/", {"action": "counter", "price": 180000, "note": "Tight budget"}, format="json"))
        self.assertEqual((v2["version"], v2["from_client"]), (2, True))
        self.ok(dev.post(f"/api/proposals/{v2['id']}/respond/", {"action": "accept"}, format="json"))
        detail = self.ok(alice.get(f"/api/requests/{ref}/"))
        self.assertEqual(detail["status"], "accepted")
        contract = detail["contract"]
        self.assertIn("180 000 DZD", contract["body"])
        self.assertEqual(len(contract["sha256"]), 64)

        # Signature opens the project with a deposit due in 5 days.
        self.assertEqual(alice.post(f"/api/contracts/{contract['id']}/sign/", {"signed_name": "Alice A", "agree": False}, format="json").status_code, 400)
        eng = self.ok(alice.post(f"/api/contracts/{contract['id']}/sign/", {"signed_name": "Alice A", "agree": True}, format="json"), 201)
        self.assertEqual(eng["status"], "awaiting_deposit")
        deposit, balance = eng["charges"]
        self.assertEqual((deposit["amount"], deposit["status"], balance["amount"], balance["status"]), (72000, "due", 108000, "scheduled"))
        self.assertEqual(bob.get(f"/api/engagements/{eng['id']}/").status_code, 404)
        self.ok(alice.get("/api/payments/instructions/"))
        self.assertEqual(bob.get("/api/payments/instructions/").status_code, 403)

        # Manual CCP payment: receipt → review → work starts.
        proof = self.ok(alice.post(f"/api/charges/{deposit['id']}/proofs/", {"method": "ccp", "receipt": png()}), 201)
        self.assertEqual(bob.get(f"/api/files/receipts/{proof['id']}/").status_code, 404)
        self.assertEqual(dev.post(f"/api/proofs/{proof['id']}/review/", {"decision": "reject"}, format="json").status_code, 400)
        self.ok(dev.post(f"/api/proofs/{proof['id']}/review/", {"decision": "approve"}, format="json"))
        eng = self.ok(alice.get(f"/api/engagements/{eng['id']}/"))
        self.assertEqual(eng["status"], "in_development")
        self.assertEqual([m["status"] for m in eng["milestones"]], ["active", "planned"])
        self.assertIsNotNone(eng["deadline"])

        # Milestone review, then the whole project review with one change round.
        m1 = eng["milestones"][0]["id"]
        self.ok(dev.post(f"/api/milestones/{m1}/move/", {"status": "review"}, format="json"))
        self.ok(alice.post(f"/api/milestones/{m1}/review/", {"decision": "approve"}, format="json"))
        self.ok(dev.post(f"/api/engagements/{eng['id']}/tasks/", {"title": "Payment page", "eta": (timezone.now() + timedelta(days=3)).isoformat()}, format="json"), 201)
        self.ok(dev.post(f"/api/engagements/{eng['id']}/action/", {"action": "ready_for_review"}, format="json"))
        self.assertEqual(alice.post(f"/api/engagements/{eng['id']}/action/", {"action": "request_changes"}, format="json").status_code, 400)
        eng = self.ok(alice.post(f"/api/engagements/{eng['id']}/action/", {"action": "request_changes", "note": "Bigger logo"}, format="json"))
        self.assertEqual((eng["status"], eng["revisions_used"]), ("in_development", 1))
        self.ok(dev.post(f"/api/engagements/{eng['id']}/action/", {"action": "ready_for_review"}, format="json"))
        eng = self.ok(alice.post(f"/api/engagements/{eng['id']}/action/", {"action": "approve"}, format="json"))
        self.assertEqual((eng["status"], eng["charges"][1]["status"]), ("awaiting_balance", "due"))

        # Launch only once everything is paid; maintenance follows the plan.
        self.assertEqual(dev.post(f"/api/engagements/{eng['id']}/action/", {"action": "go_live"}, format="json").status_code, 400)
        self.ok(dev.post(f"/api/charges/{balance['id']}/cash/"))
        eng = self.ok(dev.post(f"/api/engagements/{eng['id']}/action/", {"action": "go_live"}, format="json"))
        self.assertEqual(eng["status"], "live")
        live = Engagement.objects.get(pk=eng["id"])
        self.assertEqual((live.maintenance_ends_at - live.production_at).days, 30)  # Pro plan
        tick(now=live.maintenance_ends_at + timedelta(minutes=1))
        live.refresh_from_db()
        self.assertEqual(live.status, "closed")

    def test_three_versions_then_final_offer(self):
        alice, dev = self.api(self.alice), self.api(self.dev)
        ref = self.submitted_request()
        v1 = self.offer(ref)
        v2 = self.ok(alice.post(f"/api/proposals/{v1['id']}/respond/", {"action": "counter", "price": 150000}, format="json"))
        v3 = self.offer(ref, price=170000)
        self.assertEqual(Proposal.objects.get(pk=v2["id"]).status, "superseded")
        seen = self.ok(alice.get(f"/api/requests/{ref}/"))["proposals"][-1]
        self.assertEqual((seen["version"], seen["can_respond"], seen["can_counter"]), (3, True, False))
        self.assertEqual(alice.post(f"/api/proposals/{v3['id']}/respond/", {"action": "counter", "price": 160000}, format="json").status_code, 400)
        self.ok(alice.post(f"/api/proposals/{v3['id']}/respond/", {"action": "accept"}, format="json"))
        self.assertEqual(dev.post(f"/api/requests/{ref}/proposals/", {"scope": "x", "price": 1, "currency": "DZD", "plan": "pro", "timeline_days": 1}, format="json").status_code, 400)

    def test_deposit_window_reminds_then_expires(self):
        alice = self.api(self.alice)
        ref = self.submitted_request()
        v1 = self.offer(ref, price=40000)
        self.assertEqual(v1["deposit_percent"], 50)  # small project
        self.ok(alice.post(f"/api/proposals/{v1['id']}/respond/", {"action": "accept"}, format="json"))
        contract = self.ok(alice.get(f"/api/requests/{ref}/"))["contract"]
        eng = self.ok(alice.post(f"/api/contracts/{contract['id']}/sign/", {"signed_name": "Alice A", "agree": True}, format="json"), 201)
        deposit = Charge.objects.get(pk=eng["charges"][0]["id"])
        self.assertEqual(tick(now=deposit.due_from + timedelta(days=2, minutes=1))["reminders"], 1)
        self.assertEqual(tick(now=deposit.due_from + timedelta(days=4, minutes=1))["reminders"], 1)
        self.assertEqual(tick(now=deposit.due_from + timedelta(days=4, hours=2))["reminders"], 0)
        self.assertEqual(tick(now=deposit.due_at + timedelta(minutes=1))["deposits_expired"], 1)
        self.assertEqual(ProjectRequest.objects.get(reference=ref).status, "expired")
        self.assertEqual(Engagement.objects.get(pk=eng["id"]).status, "expired")

    def test_unanswered_proposal_expires(self):
        ref = self.submitted_request()
        v1 = self.offer(ref)
        proposal = Proposal.objects.get(pk=v1["id"])
        self.assertEqual(tick(now=proposal.expires_at + timedelta(minutes=1))["proposals_expired"], 1)
        self.assertEqual(ProjectRequest.objects.get(reference=ref).status, "expired")

    def test_large_project_uses_milestone_payments(self):
        ref = self.submitted_request()
        v1 = self.offer(ref, price=600000)
        self.assertEqual([x["percent"] for x in v1["schedule"]], [40, 30, 30])

    def test_conversation_with_voice_note_is_private(self):
        alice, dev, bob = self.api(self.alice), self.api(self.dev), self.api(self.bob)
        ref = self.submitted_request()
        self.ok(alice.post(f"/api/requests/{ref}/messages/", {"body": "Hello!"}, format="json"), 201)
        voice = SimpleUploadedFile("note.webm", b"\x1aE\xdf\xa3voice", content_type="audio/webm")
        msg = self.ok(alice.post(f"/api/requests/{ref}/messages/", {"file": voice, "duration": "7"}), 201)
        self.assertTrue(msg["attachment"]["is_voice"])
        self.assertEqual(self.ok(dev.get(f"/api/requests/{ref}/"))["unread"], 2)
        self.ok(dev.get(f"/api/requests/{ref}/messages/"))
        self.assertEqual(self.ok(dev.get(f"/api/requests/{ref}/"))["unread"], 0)
        self.assertEqual(bob.get(f"/api/requests/{ref}/messages/").status_code, 404)

    def test_waitlist_is_open_to_visitors(self):
        self.assertEqual(APIClient().post("/api/waitlist/", {"email": "Later@Example.com"}, format="json").status_code, 201)
        self.assertEqual(APIClient().post("/api/waitlist/", {"email": "nope"}, format="json").status_code, 400)

    def test_at_the_project_cap_requests_queue_and_are_released_in_order(self):
        from django.core import mail

        from content.models import SiteSettings
        from engagements.models import Engagement

        site = SiteSettings.load()
        site.max_active_projects = 1
        site.save()
        eng_id = self.started_project()
        public = self.ok(APIClient().get("/api/content/site/"))
        self.assertEqual((public["is_available"], public["at_capacity"]), (False, True))
        preview = self.ok(APIClient().get("/api/queue/?service=web-platforms"))
        self.assertEqual((preview["queued"], preview["position"]), (True, 1))
        self.assertIsNotNone(preview["start"])  # after the running project's timeline

        # Never refused: two requests join the queue, first come first served.
        mail.outbox.clear()
        with self.captureOnCommitCallbacks(execute=True):
            first = self.ok(self.api(self.bob).post("/api/requests/", {"title": "Second", "objectives": "More", "service": "web-platforms"}, format="json"), 201)
        second = self.ok(self.api(self.alice).post("/api/requests/", {"title": "Third", "objectives": "Even more", "service": "web-platforms"}, format="json"), 201)
        self.assertEqual((first["queue"]["position"], second["queue"]["position"]), (1, 2))
        self.assertIn("#1", mail.outbox[0].subject)  # the first e-mail says where they stand

        # The studio sees the board, and can reorder it.
        board = self.ok(self.api(self.dev).get("/api/studio/queue/"))
        self.assertEqual([r["reference"] for r in board[0]["queue"]], [first["reference"], second["reference"]])
        self.ok(self.api(self.dev).post(f"/api/studio/queue/{second['reference']}/up/"))
        self.assertEqual(self.ok(self.api(self.alice).get(f"/api/requests/{second['reference']}/"))["queue"]["position"], 1)
        self.ok(self.api(self.dev).post(f"/api/studio/queue/{second['reference']}/down/"))

        # The running project ships: its place goes to the head of the queue.
        mail.outbox.clear()
        with self.captureOnCommitCallbacks(execute=True):
            eng = Engagement.objects.get(pk=eng_id)
            eng.status = Engagement.Status.LIVE
            eng.save()
        self.assertIsNone(self.ok(self.api(self.bob).get(f"/api/requests/{first['reference']}/"))["queue"])
        self.assertEqual(self.ok(self.api(self.alice).get(f"/api/requests/{second['reference']}/"))["queue"]["position"], 1)
        self.assertTrue(any("your turn" in m.subject.lower() and m.to == ["bob@example.com"] for m in mail.outbox))
        # The released request holds the place: nobody else is let through.
        self.assertEqual(tick()["queue_released"], 0)

    def test_direct_services_never_queue_and_the_studio_can_take_one_now(self):
        from content.models import Service, SiteSettings

        Service.objects.create(slug="product-films", title_en="Films", summary_en="Films", accept_directly=True)
        site = SiteSettings.load()
        site.is_available = False  # starts paused: everything else queues
        site.save()
        film = self.ok(self.api(self.alice).post("/api/requests/", {"title": "Ad", "objectives": "Launch", "service": "product-films"}, format="json"), 201)
        self.assertIsNone(film["queue"])
        self.assertTrue(self.ok(APIClient().get("/api/queue/?service=product-films"))["direct"])

        web = self.ok(self.api(self.bob).post("/api/requests/", {"title": "Site", "objectives": "Sell", "service": "web-platforms"}, format="json"), 201)
        self.assertEqual(web["queue"]["position"], 1)
        self.ok(self.api(self.dev).post(f"/api/studio/queue/{web['reference']}/take/"))
        self.assertIsNone(self.ok(self.api(self.bob).get(f"/api/requests/{web['reference']}/"))["queue"])
        self.ok(self.api(self.dev).post(f"/api/studio/queue/{web['reference']}/requeue/"))
        self.assertEqual(self.ok(self.api(self.bob).get(f"/api/requests/{web['reference']}/"))["queue"]["position"], 1)
        self.assertEqual(self.api(self.bob).post(f"/api/studio/queue/{web['reference']}/take/").status_code, 403)

    def test_unanswered_requests_remind_the_studio_once(self):
        from datetime import timedelta

        from django.utils import timezone

        ref = self.submitted_request()
        ProjectRequest.objects.filter(reference=ref).update(created_at=timezone.now() - timedelta(hours=30))
        self.assertEqual(tick()["review_reminders"], 1)
        self.assertEqual(tick()["review_reminders"], 0)

    def test_revision_rounds_are_capped_by_the_plan(self):
        alice, dev = self.api(self.alice), self.api(self.dev)
        eng = self.started_project()
        for _ in range(3):  # Pro plan: 3 rounds
            self.ok(dev.post(f"/api/engagements/{eng}/action/", {"action": "ready_for_review"}, format="json"))
            self.ok(alice.post(f"/api/engagements/{eng}/action/", {"action": "request_changes", "note": "Tweak"}, format="json"))
        self.ok(dev.post(f"/api/engagements/{eng}/action/", {"action": "ready_for_review"}, format="json"))
        res = alice.post(f"/api/engagements/{eng}/action/", {"action": "request_changes", "note": "One more"}, format="json")
        self.assertEqual(res.status_code, 400)
        self.assertEqual(self.ok(alice.get(f"/api/engagements/{eng}/"))["revisions_left"], 0)

    def test_french_client_gets_french_payment_labels(self):
        self.alice.language = "fr"
        self.alice.save()
        alice = self.api(self.alice)
        draft = self.ok(alice.post("/api/requests/", {"draft": True, "title": "Site", "objectives": "Vitrine",
                                                     "service": "web-platforms", "language": "fr"}, format="json"), 201)
        self.ok(alice.post(f"/api/requests/{draft['reference']}/submit/"))
        v1 = self.offer(draft["reference"])
        self.assertEqual([x["label"] for x in v1["schedule"]], ["Acompte", "Solde"])
