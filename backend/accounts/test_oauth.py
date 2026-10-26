from unittest import mock
from urllib.parse import parse_qs, urlparse

from django.contrib.auth import get_user_model
from django.core.cache import cache
from django.test import TestCase, override_settings
from rest_framework.test import APIClient

from .models import SocialAccount

MEMORY = {"default": {"BACKEND": "channels.layers.InMemoryChannelLayer"}}
KEYS = dict(GOOGLE_CLIENT_ID="gid", GOOGLE_CLIENT_SECRET="gsecret", FACEBOOK_APP_ID="fid", FACEBOOK_APP_SECRET="fsecret",
            SITE_URL="https://originforge.test", CHANNEL_LAYERS=MEMORY)


class FakeResponse:
    def __init__(self, data):
        self._data = data

    def raise_for_status(self):
        return None

    def json(self):
        return self._data


@override_settings(**KEYS)
class OAuthTests(TestCase):
    def setUp(self):
        cache.clear()
        self.api = APIClient()

    def start(self, provider="google", **query):
        res = self.api.get(f"/api/auth/oauth/{provider}/start/", {"lang": "fr", "next": "/fr/start", **query})
        self.assertEqual(res.status_code, 302)
        return parse_qs(urlparse(res["Location"]).query)

    def callback(self, provider, state, profile, token_extra=None):
        token = FakeResponse({"access_token": "tok", **(token_extra or {})})
        with mock.patch("accounts.oauth.httpx.post", return_value=token) as post, \
             mock.patch("accounts.oauth.httpx.get", side_effect=[token, FakeResponse(profile)] if provider == "facebook" else [FakeResponse(profile)]) as get:
            res = self.api.get(f"/api/auth/oauth/{provider}/callback/", {"code": "c0de", "state": state})
        return res, post, get

    def test_providers_listed_only_when_configured(self):
        self.assertEqual(self.api.get("/api/auth/providers/").json()["providers"], ["google", "facebook"])
        with override_settings(FACEBOOK_APP_SECRET=""):
            self.assertEqual(self.api.get("/api/auth/providers/").json()["providers"], ["google"])

    def test_start_sends_state_and_pkce(self):
        q = self.start()
        self.assertEqual(q["redirect_uri"], ["https://originforge.test/api/auth/oauth/google/callback/"])
        self.assertEqual(q["code_challenge_method"], ["S256"])
        self.assertTrue(q["state"][0] and q["code_challenge"][0])

    def test_a_forged_state_is_refused(self):
        self.start()
        res, post, _ = self.callback("google", "not-the-state", {})
        self.assertIn("oauth=expired", res["Location"])
        post.assert_not_called()

    def test_new_google_user_is_created_signed_in_and_welcomed(self):
        state = self.start()["state"][0]
        res, post, _ = self.callback("google", state, {"sub": "g-1", "email": "Sam@Example.com", "email_verified": True, "name": "Sam K"})
        self.assertTrue(res["Location"].startswith("/fr/welcome"))
        self.assertIn("code_verifier", post.call_args.kwargs["data"])
        user = get_user_model().objects.get(email="sam@example.com")
        self.assertFalse(user.has_usable_password())
        self.assertEqual((user.language, user.full_name), ("fr", "Sam K"))
        self.assertTrue(SocialAccount.objects.filter(user=user, provider="google", uid="g-1").exists())
        self.assertEqual(self.api.get("/api/auth/me/").json()["email"], "sam@example.com")
        # The state is single-use.
        res, _, _ = self.callback("google", state, {})
        self.assertIn("oauth=expired", res["Location"])

    def test_existing_account_is_linked_by_verified_email_only(self):
        alice = get_user_model().objects.create_user("alice@example.com", "a-long-test-password-1", full_name="Alice")
        state = self.start()["state"][0]
        res, _, _ = self.callback("google", state, {"sub": "g-2", "email": "alice@example.com", "email_verified": False})
        self.assertIn("oauth=no_email", res["Location"])  # unverified: never linked
        state = self.start()["state"][0]
        res, _, _ = self.callback("google", state, {"sub": "g-2", "email": "alice@example.com", "email_verified": True})
        self.assertEqual(res["Location"], "/fr/start")
        self.assertEqual(SocialAccount.objects.get(uid="g-2").user, alice)

    def test_facebook_uses_appsecret_proof(self):
        state = self.start("facebook")["state"][0]
        res, _, get = self.callback("facebook", state, {"id": "f-1", "email": "lina@example.com", "name": "Lina"})
        self.assertTrue(res["Location"].startswith("/fr/welcome"))
        me_params = get.call_args_list[1].kwargs["params"]
        self.assertEqual(len(me_params["appsecret_proof"]), 64)

    def test_deleted_accounts_cannot_come_back_through_a_provider(self):
        user = get_user_model().objects.create_user("gone@example.com", "a-long-test-password-1", full_name="Gone", is_active=False)
        SocialAccount.objects.create(user=user, provider="google", uid="g-3", email="gone@example.com")
        state = self.start()["state"][0]
        res, _, _ = self.callback("google", state, {"sub": "g-3", "email": "gone@example.com", "email_verified": True})
        self.assertIn("oauth=disabled", res["Location"])

    def test_unsafe_next_is_ignored(self):
        state = self.start(next="//evil.example/x")["state"][0]
        get_user_model().objects.create_user("bob@example.com", "a-long-test-password-1", full_name="Bob")
        res, _, _ = self.callback("google", state, {"sub": "g-4", "email": "bob@example.com", "email_verified": True})
        self.assertEqual(res["Location"], "/fr/portal")

    def test_a_social_only_account_can_be_deleted_without_a_password(self):
        state = self.start()["state"][0]
        self.callback("google", state, {"sub": "g-5", "email": "temp@example.com", "email_verified": True, "name": "Temp"})
        with self.captureOnCommitCallbacks(execute=True):
            res = self.api.post("/api/auth/delete/", {"confirm": "DELETE"}, format="json")
        self.assertEqual(res.status_code, 204, res.content)
        self.assertFalse(SocialAccount.objects.filter(uid="g-5").exists())
