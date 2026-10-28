from django.contrib.auth import get_user_model
from django.core.cache import cache
from django.test import TestCase, override_settings
from rest_framework.test import APIClient

from engagements.models import ProjectRequest

MEMORY = {"default": {"BACKEND": "channels.layers.InMemoryChannelLayer"}}
PASSWORD = "a-long-test-password-1"


def make_user(email="client@example.com", **extra):
    return get_user_model().objects.create_user(email=email, password=PASSWORD, full_name="Sam Client", **extra)


@override_settings(CHANNEL_LAYERS=MEMORY)
class OnboardingTests(TestCase):
    def setUp(self):
        cache.clear()
        self.user = make_user()
        self.api = APIClient()
        self.api.force_authenticate(self.user)

    def test_new_clients_start_not_onboarded(self):
        self.assertFalse(self.api.get("/api/auth/me/").json()["onboarded"])

    def test_answers_are_saved_and_the_account_marked_set_up(self):
        res = self.api.post("/api/auth/onboarding/", {
            "language": "fr", "currency": "EUR", "heard_from": "instagram",
            "contact_channel": "discord", "contact_handle": "sam#1",
        }, format="json")
        self.assertEqual(res.status_code, 200, res.content)
        self.user.refresh_from_db()
        self.assertIsNotNone(self.user.onboarded_at)
        self.assertEqual((self.user.language, self.user.currency, self.user.contact_channel), ("fr", "EUR", "discord"))
        self.assertTrue(res.json()["onboarded"])

    def test_a_social_channel_needs_a_handle(self):
        res = self.api.post("/api/auth/onboarding/", {"contact_channel": "instagram", "contact_handle": ""}, format="json")
        self.assertEqual(res.status_code, 400)
        self.assertIn("contact_handle", res.json())

    def test_the_developer_never_needs_onboarding(self):
        dev = make_user("dev@example.com", role="developer")
        api = APIClient()
        api.force_authenticate(dev)
        self.assertTrue(api.get("/api/auth/me/").json()["onboarded"])


@override_settings(CHANNEL_LAYERS=MEMORY)
class DeleteAccountTests(TestCase):
    def setUp(self):
        cache.clear()
        self.user = make_user()
        self.api = APIClient()
        self.api.login(email="client@example.com", password=PASSWORD)

    def test_wrong_password_or_missing_confirmation_is_refused(self):
        self.assertEqual(self.api.post("/api/auth/delete/", {"password": "nope", "confirm": "DELETE"}, format="json").status_code, 400)
        self.assertEqual(self.api.post("/api/auth/delete/", {"password": PASSWORD, "confirm": "yes"}, format="json").status_code, 400)
        self.user.refresh_from_db()
        self.assertTrue(self.user.is_active)

    def test_deletion_anonymises_logs_out_and_drops_drafts(self):
        ProjectRequest.objects.create(client=self.user, title="Draft", status=ProjectRequest.Status.DRAFT)
        self.user.address, self.user.city, self.user.postal_code = "12 rue des Oliviers", "Tizi Ouzou", "15000"
        self.user.save()
        with self.captureOnCommitCallbacks(execute=True):
            res = self.api.post("/api/auth/delete/", {"password": PASSWORD, "confirm": "DELETE"}, format="json")
        self.assertEqual(res.status_code, 204, res.content)
        self.user.refresh_from_db()
        self.assertFalse(self.user.is_active)
        self.assertFalse(self.user.has_usable_password())
        self.assertTrue(self.user.email.endswith("@deleted.invalid"))
        self.assertEqual(self.user.full_name, "Deleted user")
        self.assertEqual((self.user.address, self.user.city, self.user.postal_code), ("", "", ""))
        self.assertFalse(ProjectRequest.objects.filter(client=self.user).exists())
        # Signed out: the session no longer answers as this user.
        self.assertEqual(self.api.get("/api/auth/me/").status_code, 204)
        # The old address can't sign in any more.
        self.assertFalse(APIClient().login(email="client@example.com", password=PASSWORD))

    def test_the_studio_account_cannot_be_deleted_here(self):
        dev = make_user("dev@example.com", role="developer")
        api = APIClient()
        api.login(email="dev@example.com", password=PASSWORD)
        self.assertEqual(api.post("/api/auth/delete/", {"password": PASSWORD, "confirm": "DELETE"}, format="json").status_code, 400)
        dev.refresh_from_db()
        self.assertTrue(dev.is_active)
