import shutil
import tempfile

from django.core.cache import cache
from django.core.management import call_command
from django.test import TestCase, override_settings
from rest_framework.test import APIClient

from accounts.models import User
from content.models import CaseStudy, Service
from engagements.models import Engagement

from .models import Review

TMP = tempfile.mkdtemp()
MEMORY = {"default": {"BACKEND": "channels.layers.InMemoryChannelLayer"}}
GOOD = {"rating": 5, "body": "Clear communication, delivered early and the site works great.", "display_name": "Alice A.", "consent": True}


@override_settings(PRIVATE_MEDIA_ROOT=TMP, MEDIA_ROOT=TMP, NEXT_REVALIDATE_URL="", CHANNEL_LAYERS=MEMORY)
class ReviewTests(TestCase):
    @classmethod
    def tearDownClass(cls):
        super().tearDownClass()
        shutil.rmtree(TMP, ignore_errors=True)

    def setUp(self):
        cache.clear()
        Service.objects.create(slug="web-platforms", title_en="Web platforms", summary_en="Platforms")
        call_command("seed_pricing", verbosity=0)
        self.alice = User.objects.create_user("alice@example.com", "pass-pass-1", full_name="Alice A")
        self.bob = User.objects.create_user("bob@example.com", "pass-pass-2", full_name="Bob B")
        self.dev = User.objects.create_user("younes@example.com", "pass-pass-3", full_name="Younes", role="developer")

    def api(self, user) -> APIClient:
        c = APIClient()
        c.force_authenticate(user)
        return c

    def ok(self, res, code=200):
        self.assertEqual(res.status_code, code, getattr(res, "data", res))
        return res.data

    def engagement(self, live=True, nda=False) -> int:
        """A project for Alice, taken through the lifecycle (to launch if `live`)."""
        alice, dev = self.api(self.alice), self.api(self.dev)
        req = self.ok(alice.post("/api/requests/", {
            "title": "Rental site", "objectives": "Bookings online", "service": "web-platforms", "plan": "pro", "budget_currency": "DZD",
            "wants_nda": nda,
        }, format="json"), 201)
        ref = req["reference"]
        offer = self.ok(dev.post(f"/api/requests/{ref}/proposals/", {
            "scope": "Booking platform", "price": 200000, "currency": "DZD", "plan": "pro", "timeline_days": 30,
            "milestones": [{"title": "Build", "days": 30}],
        }, format="json"), 201)
        self.ok(alice.post(f"/api/proposals/{offer['id']}/respond/", {"action": "accept"}, format="json"))
        contract = self.ok(alice.get(f"/api/requests/{ref}/"))["contract"]
        eng = self.ok(alice.post(f"/api/contracts/{contract['id']}/sign/", {"signed_name": "Alice A", "agree": True}, format="json"), 201)
        if not live:
            return eng["id"]
        deposit, balance = eng["charges"]
        self.ok(dev.post(f"/api/charges/{deposit['id']}/cash/"))
        self.ok(dev.post(f"/api/engagements/{eng['id']}/action/", {"action": "ready_for_review"}, format="json"))
        self.ok(alice.post(f"/api/engagements/{eng['id']}/action/", {"action": "approve"}, format="json"))
        self.ok(dev.post(f"/api/charges/{balance['id']}/cash/"))
        self.ok(dev.post(f"/api/engagements/{eng['id']}/action/", {"action": "go_live"}, format="json"))
        return eng["id"]

    def test_only_the_client_of_a_live_project_can_review_it_once(self):
        early = self.engagement(live=False)
        alice, bob = self.api(self.alice), self.api(self.bob)
        self.assertEqual(alice.post("/api/reviews/mine/", {**GOOD, "engagement": early}, format="json").status_code, 400)

        eng = self.engagement()
        self.assertEqual([e["engagement"] for e in self.ok(alice.get("/api/reviews/mine/"))["eligible"]], [eng])
        self.assertEqual(bob.post("/api/reviews/mine/", {**GOOD, "engagement": eng}, format="json").status_code, 400)
        self.assertEqual(alice.post("/api/reviews/mine/", {**GOOD, "consent": False, "engagement": eng}, format="json").status_code, 400)
        self.ok(alice.post("/api/reviews/mine/", {**GOOD, "engagement": eng}, format="json"), 201)
        self.assertEqual(alice.post("/api/reviews/mine/", {**GOOD, "engagement": eng}, format="json").status_code, 400)
        self.assertEqual(self.ok(alice.get("/api/reviews/mine/"))["eligible"], [])

    def test_nothing_is_public_until_approved(self):
        eng = self.engagement()
        mine = self.ok(self.api(self.alice).post("/api/reviews/mine/", {**GOOD, "engagement": eng}, format="json"), 201)
        public = APIClient()
        self.assertEqual(self.ok(public.get("/api/reviews/"))["summary"]["count"], 0)

        dev = self.api(self.dev)
        self.assertEqual(self.api(self.alice).post(f"/api/reviews/studio/{mine['id']}/moderate/", {"decision": "approve"}, format="json").status_code, 403)
        self.assertEqual(dev.post(f"/api/reviews/studio/{mine['id']}/moderate/", {"decision": "reject"}, format="json").status_code, 400)
        self.ok(dev.post(f"/api/reviews/studio/{mine['id']}/moderate/", {"decision": "approve", "reply": "Thank you!"}, format="json"))
        data = self.ok(public.get("/api/reviews/"))
        self.assertEqual((data["summary"]["count"], data["summary"]["average"], data["summary"]["distribution"]["5"]), (1, 5.0, 1))
        item = data["items"][0]
        self.assertEqual((item["display_name"], item["reply"], item["project_label"]), ("Alice A.", "Thank you!", "Web platforms"))
        self.assertNotIn("author", item)

    def test_a_rejected_review_can_be_reworked(self):
        eng = self.engagement()
        alice, dev = self.api(self.alice), self.api(self.dev)
        mine = self.ok(alice.post("/api/reviews/mine/", {**GOOD, "engagement": eng}, format="json"), 201)
        self.ok(dev.post(f"/api/reviews/studio/{mine['id']}/moderate/", {"decision": "reject", "reason": "Please remove the phone number."}, format="json"))
        self.assertEqual(Review.objects.get(pk=mine["id"]).status, "rejected")
        again = self.ok(alice.patch(f"/api/reviews/mine/{mine['id']}/", {**GOOD, "rating": 4}, format="json"))
        self.assertEqual((again["status"], again["rating"], again["rejection_reason"]), ("pending", 4, ""))
        self.assertEqual(self.api(self.bob).patch(f"/api/reviews/mine/{mine['id']}/", GOOD, format="json").status_code, 404)

    def test_launch_drafts_a_case_study_unless_under_nda(self):
        eng = self.engagement()
        study = CaseStudy.objects.get(source_engagement_id=eng)
        self.assertFalse(study.published)
        self.assertEqual(study.title, "Rental site")
        secret = self.engagement(nda=True)
        self.assertFalse(CaseStudy.objects.filter(source_engagement_id=secret).exists())
        self.assertEqual(Engagement.objects.get(pk=secret).status, "live")
