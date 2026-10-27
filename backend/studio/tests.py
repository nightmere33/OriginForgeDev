from django.core.cache import cache
from django.test import TestCase, override_settings
from rest_framework.test import APIClient

from accounts.models import User
from audit.models import AuditLog
from content.models import Service, ServicePrice, SiteSettings
from engagements.models import ProjectRequest


@override_settings(NEXT_REVALIDATE_URL="")
class StudioTests(TestCase):
    def setUp(self):
        cache.clear()
        self.dev = User.objects.create_user("younes@example.com", "s3cret-pass-3", full_name="Younes", role=User.Role.DEVELOPER)
        self.alice = User.objects.create_user("alice@example.com", "s3cret-pass-1", full_name="Alice A", heard_from="instagram")
        self.web = Service.objects.create(slug="web", title_en="Web", summary_en="Sites")

    def as_user(self, user) -> APIClient:
        c = APIClient()
        c.force_authenticate(user)
        return c

    def test_only_the_developer_gets_in(self):
        for path in ("overview/", "clients/", "payments/", "settings/", "prices/"):
            self.assertEqual(self.as_user(self.alice).get(f"/api/studio/{path}").status_code, 403, path)
            self.assertEqual(APIClient().get(f"/api/studio/{path}").status_code, 403, path)
            self.assertEqual(self.as_user(self.dev).get(f"/api/studio/{path}").status_code, 200, path)

    def test_overview_counts_clients_and_requests(self):
        ProjectRequest.objects.create(client=self.alice, service=self.web, title="T", objectives="O")
        ProjectRequest.objects.create(client=self.alice, service=self.web, title="D", objectives="O", status="draft")
        data = self.as_user(self.dev).get("/api/studio/overview/").json()
        self.assertEqual(data["clients"]["total"], 1)
        self.assertEqual(data["clients"]["sources"][0]["key"], "instagram")
        self.assertEqual((data["requests"]["total"], data["requests"]["new"], data["requests"]["drafts"]), (1, 1, 1))
        self.assertEqual(data["requests"]["by_service"][0]["slug"], "web")

    def test_clients_search_and_counts(self):
        ProjectRequest.objects.create(client=self.alice, service=self.web, title="T", objectives="O")
        res = self.as_user(self.dev).get("/api/studio/clients/?q=alice").json()
        self.assertEqual(res["count"], 1)
        self.assertEqual(res["results"][0]["requests"], 1)
        self.assertEqual(self.as_user(self.dev).get("/api/studio/clients/?q=nobody").json()["count"], 0)

    def test_settings_validate_and_log_field_names_only(self):
        c = self.as_user(self.dev)
        self.assertEqual(c.patch("/api/studio/settings/", {"baridimob_rip": "123"}, format="json").status_code, 400)
        self.assertEqual(c.patch("/api/studio/settings/", {"usdt_bep20_address": "abc"}, format="json").status_code, 400)
        rip = "00799999001234567890"
        res = c.patch("/api/studio/settings/", {"baridimob_rip": rip, "ccp_account": "0012 3456", "phone": "+213 555"}, format="json")
        self.assertEqual(res.status_code, 200, res.data)
        site = SiteSettings.load()
        self.assertEqual((site.baridimob_rip, site.ccp_account), (rip, "00123456"))
        log = AuditLog.objects.get(action="studio.settings_changed")
        self.assertEqual(log.data["fields"], ["baridimob_rip", "ccp_account", "phone"])
        self.assertNotIn(rip, str(log.data))

    def test_prices_set_kind_and_hide_a_service(self):
        c = self.as_user(self.dev)
        res = c.patch("/api/studio/prices/", {"slug": "web", "amount": 3500, "kind": "per_minute"}, format="json")
        self.assertEqual(res.status_code, 200, res.data)
        self.assertEqual(list(ServicePrice.objects.filter(service=self.web).values_list("amount", "kind")), [(3500, "per_minute")])
        c.patch("/api/studio/prices/", {"slug": "web", "active": False}, format="json")
        self.web.refresh_from_db()
        self.assertFalse(self.web.active)
        c.patch("/api/studio/prices/", {"slug": "web", "amount": None}, format="json")
        self.assertFalse(ServicePrice.objects.filter(service=self.web).exists())
        self.assertEqual(c.patch("/api/studio/prices/", {"slug": "nope", "amount": 1}, format="json").status_code, 400)
