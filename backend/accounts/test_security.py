from django.conf import settings
from django.contrib.auth import get_user_model
from django.core.cache import cache
from django.test import Client, TestCase, override_settings
from rest_framework.test import APIClient

MEMORY = {"default": {"BACKEND": "channels.layers.InMemoryChannelLayer"}}
PASSWORD = "a-long-test-password-1"


@override_settings(CHANNEL_LAYERS=MEMORY)
class SignInLimitTests(TestCase):
    def setUp(self):
        cache.clear()
        self.user = get_user_model().objects.create_user(email="client@example.com", password=PASSWORD, full_name="Sam Client")

    def login(self, email, password, ip="198.51.100.1", **headers):
        return APIClient(REMOTE_ADDR=ip, **headers).post("/api/auth/login/", {"email": email, "password": password}, format="json")

    def test_a_forged_forwarded_header_does_not_reset_the_limit(self):
        # The same visitor, a new X-Forwarded-For each time (and a new e-mail,
        # so the per-account limit stays out of it): still 10 a minute.
        codes = [self.login(f"guess{i}@example.com", "wrong", HTTP_X_FORWARDED_FOR=f"203.0.113.{i}").status_code for i in range(11)]
        self.assertEqual(codes[:10], [400] * 10)
        self.assertEqual(codes[10], 429)

    def test_wrong_passwords_from_many_addresses_lock_the_account_for_a_while(self):
        for i in range(10):
            self.assertEqual(self.login("client@example.com", "wrong", ip=f"203.0.113.{i}").status_code, 400)
        # Even the right password waits, from yet another address.
        self.assertEqual(self.login("client@example.com", PASSWORD, ip="192.0.2.50").status_code, 429)
        cache.clear()
        self.assertEqual(self.login("client@example.com", PASSWORD, ip="192.0.2.50").status_code, 200)

    def test_a_successful_sign_in_clears_the_count(self):
        for i in range(9):
            self.login("client@example.com", "wrong", ip=f"203.0.113.{i}")
        self.assertEqual(self.login("client@example.com", PASSWORD, ip="192.0.2.1").status_code, 200)
        self.assertEqual(self.login("client@example.com", "wrong", ip="192.0.2.2").status_code, 400)
        self.assertEqual(self.login("client@example.com", PASSWORD, ip="192.0.2.3").status_code, 200)

    def test_unknown_addresses_are_limited_the_same_way(self):
        for i in range(10):
            self.login("nobody@example.com", "wrong", ip=f"203.0.113.{i}")
        res = self.login("nobody@example.com", "wrong", ip="192.0.2.9")
        self.assertEqual(res.status_code, 429)

    def test_the_admin_password_form_is_limited_too(self):
        url = f"/{settings.DJANGO_ADMIN_PATH}login/"
        browser = Client(REMOTE_ADDR="198.51.100.7")
        for _ in range(10):
            self.assertEqual(browser.post(url, {"username": "client@example.com", "password": "wrong"}).status_code, 200)
        self.assertEqual(browser.post(url, {"username": "client@example.com", "password": "wrong"}).status_code, 429)
        # Another address is not affected.
        self.assertEqual(Client(REMOTE_ADDR="198.51.100.8").post(url, {"username": "x@example.com", "password": "wrong"}).status_code, 200)
