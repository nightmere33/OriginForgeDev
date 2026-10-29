"""Profile pictures: cleaned, squared, checked for explicit content, and gone with the account."""

import io
import os
import shutil
import tempfile
from unittest.mock import patch

from django.core.cache import cache
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import TestCase, override_settings
from django.utils import timezone
from PIL import Image
from rest_framework.test import APIClient

from accounts.models import User

TMP = tempfile.mkdtemp(prefix="of-avatar-")


def picture(size=(900, 600), fmt="JPEG", exif=True, name="me.jpg") -> SimpleUploadedFile:
    img = Image.new("RGB", size, (40, 90, 160))
    buf = io.BytesIO()
    extra = {}
    if exif:
        data = Image.Exif()
        data[0x010F] = "PhoneMaker"  # Make
        data[0x8825] = {2: (36.0, 45.0, 0.0)}  # GPS latitude
        extra["exif"] = data.tobytes()
    img.save(buf, fmt, **extra)
    return SimpleUploadedFile(name, buf.getvalue(), content_type=f"image/{fmt.lower()}")


@override_settings(MEDIA_ROOT=TMP)
class AvatarTests(TestCase):
    @classmethod
    def tearDownClass(cls):
        super().tearDownClass()
        shutil.rmtree(TMP, ignore_errors=True)

    def setUp(self):
        cache.clear()
        self.user = User.objects.create_user("alice@example.com", "pass-pass-1", full_name="Alice A", email_verified_at=timezone.now())
        self.client = APIClient()
        self.client.force_authenticate(self.user)

    def upload(self, file):
        return self.client.post("/api/auth/me/avatar/", {"file": file}, format="multipart")

    def test_a_picture_is_squared_reencoded_and_stripped(self):
        res = self.upload(picture())
        self.assertEqual(res.status_code, 200, res.data)
        url = res.data["avatar_url"]
        self.assertRegex(url, r"^/media/avatars/[0-9a-f]{32}\.webp$")
        self.user.refresh_from_db()
        with Image.open(self.user.avatar.path) as saved:
            self.assertEqual((saved.format, saved.size), ("WEBP", (384, 384)))
            self.assertEqual(len(saved.getexif()), 0)  # no camera, no location
        self.assertEqual(self.client.get("/api/auth/me/").data["avatar_url"], url)

    def test_replacing_removes_the_old_file_and_delete_clears_it(self):
        self.upload(picture())
        self.user.refresh_from_db()
        first = self.user.avatar.path
        self.upload(picture(fmt="PNG", exif=False, name="me.png"))
        self.user.refresh_from_db()
        self.assertNotEqual(self.user.avatar.path, first)
        self.assertFalse(os.path.exists(first))
        second = self.user.avatar.path
        self.assertEqual(self.client.delete("/api/auth/me/avatar/").data["avatar_url"], "")
        self.assertFalse(os.path.exists(second))

    def test_explicit_pictures_are_refused_and_nothing_is_kept(self):
        with patch("accounts.avatar.nsfw_score", return_value=0.93):
            res = self.upload(picture())
        self.assertEqual(res.status_code, 422)
        self.assertIn("can't be used", res.data["file"][0])
        self.user.refresh_from_db()
        self.assertFalse(self.user.avatar)

    def test_the_check_failing_refuses_rather_than_lets_through(self):
        with patch("accounts.avatar._classifier", side_effect=RuntimeError("no model")):
            res = self.upload(picture())
        self.assertEqual(res.status_code, 503)
        self.user.refresh_from_db()
        self.assertFalse(self.user.avatar)

    def test_files_that_are_not_pictures_are_refused(self):
        fake = SimpleUploadedFile("me.jpg", b"<svg onload=alert(1)>", content_type="image/jpeg")
        self.assertEqual(self.upload(fake).status_code, 400)
        buf = io.BytesIO()
        Image.new("RGB", (8, 8)).save(buf, "BMP")
        self.assertEqual(self.upload(SimpleUploadedFile("me.bmp", buf.getvalue())).status_code, 400)
        self.assertEqual(self.client.post("/api/auth/me/avatar/", {}, format="multipart").status_code, 400)

    def test_signed_out_visitors_cannot_upload(self):
        self.assertIn(APIClient().post("/api/auth/me/avatar/", {"file": picture()}, format="multipart").status_code, (401, 403))

    def test_the_real_model_passes_an_ordinary_picture(self):
        from accounts.avatar import nsfw_score, square

        score = nsfw_score(square(picture()))
        self.assertLess(score, 0.5)

    def test_deleting_the_account_deletes_the_picture(self):
        self.upload(picture())
        self.user.refresh_from_db()
        path = self.user.avatar.path
        self.assertEqual(self.client.post("/api/auth/delete/", {"password": "pass-pass-1", "confirm": "DELETE"}, format="json").status_code, 204)
        self.assertFalse(os.path.exists(path))
