import re
from datetime import timedelta

from django.core import mail
from django.core.cache import cache
from django.test import TestCase, override_settings
from django.utils import timezone
from rest_framework.test import APIClient

from .models import EmailCode, User


@override_settings(NEXT_REVALIDATE_URL="")
class EmailCodeTests(TestCase):
    def setUp(self):
        cache.clear()

    def register(self) -> tuple[APIClient, str]:
        c = APIClient()
        with self.captureOnCommitCallbacks(execute=True):
            res = c.post("/api/auth/register/", {"email": "new@example.com", "full_name": "New One", "password": "long-enough-pass-1"}, format="json")
        self.assertEqual(res.status_code, 201, res.data)
        code = re.search(r"\b(\d{6})\b", mail.outbox[-1].body).group(1)
        self.assertIn(code, mail.outbox[-1].subject)
        return c, code

    def test_sign_up_sends_a_code_that_confirms_the_address(self):
        c, code = self.register()
        self.assertFalse(c.get("/api/auth/me/").json()["email_verified"])
        wrong = "000000" if code != "000000" else "111111"
        res = c.post("/api/auth/verify-email/code/", {"code": wrong}, format="json")
        self.assertEqual((res.status_code, res.data["code"]), (400, "wrong"))
        res = c.post("/api/auth/verify-email/code/", {"code": f"{code[:3]} {code[3:]}"}, format="json")  # spaces are fine
        self.assertEqual(res.status_code, 200, res.data)
        self.assertTrue(res.data["email_verified"])
        self.assertIsNotNone(EmailCode.objects.get().used_at)

    def test_five_wrong_tries_or_time_spend_the_code(self):
        c, code = self.register()
        wrong = "000000" if code != "000000" else "111111"
        for _ in range(4):
            self.assertEqual(c.post("/api/auth/verify-email/code/", {"code": wrong}, format="json").data["code"], "wrong")
        self.assertEqual(c.post("/api/auth/verify-email/code/", {"code": wrong}, format="json").data["code"], "expired")
        self.assertEqual(c.post("/api/auth/verify-email/code/", {"code": code}, format="json").data["code"], "expired")

        EmailCode.objects.all().delete()
        user = User.objects.get(email="new@example.com")
        from .tokens import new_email_code

        fresh = new_email_code(user)
        EmailCode.objects.update(expires_at=timezone.now() - timedelta(seconds=1))
        self.assertEqual(c.post("/api/auth/verify-email/code/", {"code": fresh}, format="json").data["code"], "expired")

    def test_resend_waits_a_moment_then_replaces_the_code(self):
        c, first = self.register()
        res = c.post("/api/auth/verify-email/resend/")
        self.assertEqual(res.status_code, 429)
        self.assertGreater(res.data["retry_after"], 0)
        EmailCode.objects.update(created_at=timezone.now() - timedelta(minutes=1))
        with self.captureOnCommitCallbacks(execute=True):
            self.assertEqual(c.post("/api/auth/verify-email/resend/").status_code, 200)
        second = re.search(r"\b(\d{6})\b", mail.outbox[-1].body).group(1)
        self.assertEqual(EmailCode.objects.count(), 1)
        if second != first:
            self.assertEqual(c.post("/api/auth/verify-email/code/", {"code": first}, format="json").status_code, 400)
        self.assertEqual(c.post("/api/auth/verify-email/code/", {"code": second}, format="json").status_code, 200)

    def test_requests_need_a_confirmed_address(self):
        c, code = self.register()
        res = c.post("/api/requests/", {"title": "Site", "objectives": "Sell"}, format="json")
        self.assertEqual(res.status_code, 400)
        self.assertEqual(str(res.data["code"]), "email_unverified")
        c.post("/api/auth/verify-email/code/", {"code": code}, format="json")
        self.assertEqual(c.post("/api/requests/", {"title": "Site", "objectives": "Sell"}, format="json").status_code, 201)
