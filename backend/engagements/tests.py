import io
import shutil
import tempfile

from django.core.cache import cache
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import TestCase, override_settings
from django.utils import timezone
from PIL import Image
from rest_framework.test import APIClient

from accounts.models import User
from audit.models import AuditLog
from content.models import CaseStudy, Service, SiteSettings

from .models import ProjectRequest

TMP_PRIVATE = tempfile.mkdtemp()


def png_bytes() -> bytes:
    buf = io.BytesIO()
    Image.new("RGB", (4, 4), "orange").save(buf, "PNG")
    return buf.getvalue()


@override_settings(PRIVATE_MEDIA_ROOT=TMP_PRIVATE)
class RequestLifecycleTests(TestCase):
    @classmethod
    def tearDownClass(cls):
        super().tearDownClass()
        shutil.rmtree(TMP_PRIVATE, ignore_errors=True)

    def setUp(self):
        cache.clear()  # throttle counters live in the cache
        self.alice = User.objects.create_user("alice@example.com", "s3cret-pass-1", full_name="Alice A", email_verified_at=timezone.now())
        self.bob = User.objects.create_user("bob@example.com", "s3cret-pass-2", full_name="Bob B", email_verified_at=timezone.now())
        self.dev = User.objects.create_user(
            "younes@example.com", "s3cret-pass-3", full_name="Younes", role=User.Role.DEVELOPER,
        )
        self.service = Service.objects.create(slug="web", title_en="Web", summary_en="Sites")

    def client_for(self, user) -> APIClient:
        c = APIClient()
        c.force_authenticate(user)
        return c

    def create_request(self, user, **extra) -> dict:
        body = {"title": "Booking site", "objectives": "Take bookings online", "service": "web", **extra}
        res = self.client_for(user).post("/api/requests/", body, format="json")
        self.assertEqual(res.status_code, 201, res.data)
        return res.data

    def test_create_assigns_owner_and_audits(self):
        data = self.create_request(self.alice)
        req = ProjectRequest.objects.get(reference=data["reference"])
        self.assertEqual(req.client, self.alice)
        self.assertEqual(req.status, "submitted")
        self.assertTrue(AuditLog.objects.filter(action="request.submitted", target_id=str(req.pk)).exists())

    def test_brief_keeps_answers_and_drops_empty_ones(self):
        data = self.create_request(self.alice, brief={"kind": "launch", "platforms": ["tiktok", "tiktok", "youtube"], "note": "  ", "cta": None})
        self.assertEqual(data["brief"], {"kind": "launch", "platforms": ["tiktok", "youtube"]})

    def test_brief_refuses_other_shapes(self):
        c = self.client_for(self.alice)
        body = {"title": "T", "objectives": "O", "service": "web"}
        for brief in (["a"], {"k": {"nested": 1}}, {"k": "x" * 2001}, {f"k{i}": "v" for i in range(41)}):
            res = c.post("/api/requests/", {**body, "brief": brief}, format="json")
            self.assertEqual(res.status_code, 400, brief)

    def test_clients_only_see_their_own_requests(self):
        ref = self.create_request(self.alice)["reference"]
        self.assertEqual(self.client_for(self.bob).get(f"/api/requests/{ref}/").status_code, 404)
        self.assertEqual(self.client_for(self.bob).get("/api/requests/").data["count"], 0)
        self.assertEqual(self.client_for(self.dev).get(f"/api/requests/{ref}/").status_code, 200)

    def test_client_can_withdraw_but_not_review(self):
        ref = self.create_request(self.alice)["reference"]
        alice = self.client_for(self.alice)
        res = alice.post(f"/api/requests/{ref}/transition/", {"to": "in_review"}, format="json")
        self.assertEqual(res.status_code, 400)
        res = alice.post(f"/api/requests/{ref}/transition/", {"to": "withdrawn"}, format="json")
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.data["status"], "withdrawn")

    def test_decline_requires_a_reason(self):
        ref = self.create_request(self.alice)["reference"]
        dev = self.client_for(self.dev)
        self.assertEqual(dev.post(f"/api/requests/{ref}/transition/", {"to": "declined"}, format="json").status_code, 400)
        res = dev.post(f"/api/requests/{ref}/transition/", {"to": "declined", "note": "Out of scope"}, format="json")
        self.assertEqual(res.status_code, 200)

    def test_cannot_skip_to_accepted(self):
        ref = self.create_request(self.alice)["reference"]
        res = self.client_for(self.dev).post(f"/api/requests/{ref}/transition/", {"to": "accepted"}, format="json")
        self.assertEqual(res.status_code, 400)

    def test_upload_rules_and_private_download(self):
        ref = self.create_request(self.alice)["reference"]
        alice = self.client_for(self.alice)
        bad = SimpleUploadedFile("run.exe", b"MZ....", content_type="application/octet-stream")
        self.assertEqual(alice.post(f"/api/requests/{ref}/attachments/", {"file": bad}).status_code, 400)
        fake_pdf = SimpleUploadedFile("brief.pdf", b"not a pdf", content_type="application/pdf")
        self.assertEqual(alice.post(f"/api/requests/{ref}/attachments/", {"file": fake_pdf}).status_code, 400)

        good = SimpleUploadedFile("mock up.png", png_bytes(), content_type="image/png")
        res = alice.post(f"/api/requests/{ref}/attachments/", {"file": good})
        self.assertEqual(res.status_code, 201, res.data)
        url = res.data["url"]

        self.assertEqual(alice.get(url).status_code, 200)
        self.assertEqual(self.client_for(self.dev).get(url).status_code, 200)
        self.assertEqual(self.client_for(self.bob).get(url).status_code, 404)
        self.assertEqual(APIClient().get(url).status_code, 403)

    def test_paused_starts_queue_new_requests_instead_of_refusing(self):
        site = SiteSettings.load()
        site.is_available = False
        site.save()
        res = self.client_for(self.alice).post("/api/requests/", {"title": "x", "objectives": "y"}, format="json")
        self.assertEqual(res.status_code, 201, res.data)
        self.assertEqual(res.data["queue"]["position"], 1)

    def test_past_deadline_rejected(self):
        res = self.client_for(self.alice).post(
            "/api/requests/", {"title": "x", "objectives": "y", "deadline": "2001-01-01"}, format="json",
        )
        self.assertEqual(res.status_code, 400)


class AuthTests(TestCase):
    def test_register_is_always_a_client_and_logs_in(self):
        c = APIClient()
        res = c.post("/api/auth/register/", {
            "email": "New@Example.com", "full_name": "New Person", "password": "a-long-pass-phrase", "role": "developer",
        }, format="json")
        self.assertEqual(res.status_code, 201, res.data)
        self.assertEqual(res.data["role"], "client")
        self.assertEqual(res.data["email"], "new@example.com")
        self.assertEqual(c.get("/api/auth/me/").status_code, 200)

    def test_login_is_csrf_protected(self):
        User.objects.create_user("a@example.com", "a-long-pass-phrase", full_name="A")
        c = APIClient(enforce_csrf_checks=True)
        res = c.post("/api/auth/login/", {"email": "a@example.com", "password": "a-long-pass-phrase"}, format="json")
        self.assertEqual(res.status_code, 403)
        c.get("/api/auth/csrf/")
        token = c.cookies["of_csrftoken"].value
        res = c.post("/api/auth/login/", {"email": "a@example.com", "password": "a-long-pass-phrase"},
                     format="json", HTTP_X_CSRFTOKEN=token)
        self.assertEqual(res.status_code, 200)

    def test_me_is_a_quiet_204_when_signed_out(self):
        self.assertEqual(APIClient().get("/api/auth/me/").status_code, 204)
        self.assertEqual(APIClient().patch("/api/auth/me/", {"full_name": "x"}, format="json").status_code, 403)

    def test_wrong_password_message_does_not_reveal_accounts(self):
        User.objects.create_user("a@example.com", "a-long-pass-phrase", full_name="A")
        c = APIClient()
        known = c.post("/api/auth/login/", {"email": "a@example.com", "password": "nope"}, format="json")
        unknown = c.post("/api/auth/login/", {"email": "z@example.com", "password": "nope"}, format="json")
        self.assertEqual(known.data, unknown.data)


class PublicContentTests(TestCase):
    def test_site_settings_never_expose_payment_details(self):
        s = SiteSettings.load()
        s.ccp_account = "0012345678"
        s.save()
        data = APIClient().get("/api/content/site/").data
        self.assertNotIn("ccp_account", data)
        self.assertNotIn("0012345678", str(data))

    def test_unpublished_work_is_hidden(self):
        CaseStudy.objects.create(slug="draft", title="Draft", tagline_en="t", summary_en="s", published=False)
        CaseStudy.objects.create(slug="live", title="Live", tagline_en="t", summary_en="s", published=True)
        c = APIClient()
        self.assertEqual([w["slug"] for w in c.get("/api/content/work/").data], ["live"])
        self.assertEqual(c.get("/api/content/work/draft/").status_code, 404)
        self.assertEqual(c.get("/api/content/work/live/?lang=fr").data["tagline"], "t")
