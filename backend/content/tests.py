import io
import shutil
import subprocess
import tempfile
import unittest
from pathlib import Path

from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import TestCase, TransactionTestCase, override_settings
from PIL import Image
from rest_framework.test import APIClient

from .models import CaseStudy, CaseStudyMedia, Service, ServicePrice

TMP_MEDIA = tempfile.mkdtemp()


@override_settings(MEDIA_ROOT=TMP_MEDIA, NEXT_REVALIDATE_URL="")
class ServicePriceTests(TestCase):
    def test_prices_are_listed_per_currency(self):
        web = Service.objects.create(slug="web", title_en="Web", summary_en="Sites")
        ServicePrice.objects.create(service=web, currency="DZD", amount=60000, order=0)
        ServicePrice.objects.create(service=web, currency="EUR", amount=450, order=1)
        data = APIClient().get("/api/content/services/").data
        self.assertEqual(data[0]["prices"], [
            {"currency": "DZD", "amount": 60000, "kind": "from"},
            {"currency": "EUR", "amount": 450, "kind": "from"},
        ])

    def test_no_prices_means_quoted(self):
        Service.objects.create(slug="x", title_en="X", summary_en="x")
        self.assertEqual(APIClient().get("/api/content/services/").data[0]["prices"], [])


@override_settings(NEXT_REVALIDATE_URL="")
class FilmPricingTests(TestCase):
    """Films: a price per minute of a clean edit, scaled by length and production."""

    def setUp(self):
        from django.core.management import call_command

        from .management.commands.seed_pricing import STARTING

        # The services the factors attach to (a factor with none applies to all).
        for slug in STARTING:
            Service.objects.get_or_create(slug=slug, defaults={"title_en": slug, "summary_en": slug})
        call_command("seed_pricing", stdout=io.StringIO())

    def estimate(self, **choices):
        body = {"service": "product-films", "currency": "DZD", "plan": "starter", "choices": choices}
        return APIClient().post("/api/content/estimate/", body, format="json").json()

    def test_one_minute_clean_edit_is_the_listed_price(self):
        price = ServicePrice.objects.get(service__slug="product-films")
        self.assertEqual((price.kind, price.amount), ("per_minute", 3500))
        self.assertEqual((self.estimate()["low"], self.estimate()["high"]), (3500, 4500))

    def test_length_and_production_scale_it(self):
        data = self.estimate(**{"film-length": "3", "film-style": "3d"})
        self.assertEqual(data["low"], 44000)  # 3 500 x 2.5 x 5 = 43 750, to the nearest 500 up

    def test_films_are_not_asked_about_payments_or_admin(self):
        self.assertNotIn("payments", self.estimate()["choices"])
        self.assertNotIn("admin", self.estimate()["choices"])


@override_settings(MEDIA_ROOT=TMP_MEDIA, NEXT_REVALIDATE_URL="")
class MediaProcessingTests(TestCase):
    @classmethod
    def tearDownClass(cls):
        super().tearDownClass()
        shutil.rmtree(TMP_MEDIA, ignore_errors=True)

    def setUp(self):
        self.study = CaseStudy.objects.create(slug="demo", title="Demo", tagline_en="t", summary_en="s", published=True)

    def test_large_png_becomes_web_jpeg_with_dimensions(self):
        buf = io.BytesIO()
        Image.new("RGB", (3000, 2000), "orange").save(buf, "PNG")
        # Processing runs on commit, as it does after a real admin save.
        with self.captureOnCommitCallbacks(execute=True):
            media = CaseStudyMedia.objects.create(
                case_study=self.study, kind="image", file=SimpleUploadedFile("shot.png", buf.getvalue()),
            )
        media.refresh_from_db()
        self.assertTrue(media.file.name.endswith("-web.jpg"), media.file.name)
        self.assertEqual((media.width, media.height), (1920, 1280))

    @unittest.skipUnless(shutil.which("ffmpeg"), "ffmpeg not installed")
    def test_uploaded_clip_becomes_silent_web_loop_with_poster(self):
        with tempfile.TemporaryDirectory() as tmp:
            raw = f"{tmp}/raw.mp4"
            subprocess.run(
                ["ffmpeg", "-v", "error", "-f", "lavfi", "-i", "testsrc=size=1080x1920:rate=30:duration=1",
                 "-f", "lavfi", "-i", "sine=duration=1", "-shortest", "-c:v", "libx264", "-c:a", "aac", raw],
                check=True,
            )
            with open(raw, "rb") as fh, self.captureOnCommitCallbacks(execute=True):
                media = CaseStudyMedia.objects.create(
                    case_study=self.study, kind="video", file=SimpleUploadedFile("raw.mp4", fh.read()),
                )
        media.refresh_from_db()
        self.assertTrue(media.file.name.endswith("-web.mp4"), media.file.name)
        self.assertTrue(media.poster.name.endswith("-web.jpg"), media.poster.name)
        self.assertEqual((media.width, media.height), (540, 960))
        streams = subprocess.run(
            ["ffprobe", "-v", "error", "-show_entries", "stream=codec_type", "-of", "csv=p=0", media.file.path],
            capture_output=True, text=True,
        ).stdout.split()
        self.assertEqual(streams, ["video"])  # audio stripped

    def test_processed_files_are_not_processed_again(self):
        with self.captureOnCommitCallbacks(execute=True):
            media = CaseStudyMedia.objects.create(case_study=self.study, kind="image", file="work/stills/x-web.jpg")
            media.save()
        self.assertEqual(media.file.name, "work/stills/x-web.jpg")


class AutocommitRevalidationTests(TransactionTestCase):
    """Outside a transaction on_commit runs at once: the tags must already be queued."""

    def test_outside_a_transaction_the_ping_carries_the_tags(self):
        from unittest import mock

        from content import revalidate

        revalidate._pending.tags = set()  # earlier tests roll back with tags still queued
        with mock.patch.object(revalidate.revalidate_task, "delay") as delay:
            revalidate.queue(["services"])
            revalidate.queue(["faqs"])
        self.assertEqual([c.args[0] for c in delay.call_args_list], [["services"], ["faqs"]])


class RevalidationQueueTests(TestCase):
    def test_a_transaction_sends_one_ping(self):
        from unittest import mock

        from content import revalidate

        with mock.patch.object(revalidate.revalidate_task, "delay") as delay:
            with self.captureOnCommitCallbacks(execute=True):
                revalidate.queue(["services"])
                revalidate.queue(["services", "work"])
        self.assertEqual([c.args[0] for c in delay.call_args_list], [["services", "work"]])


class DevMediaRangeTests(TestCase):
    """runserver media must answer byte ranges like nginx (iOS needs 206 to play video)."""

    def setUp(self):
        self.root = tempfile.mkdtemp()
        (Path(self.root) / "clip.mp4").write_bytes(bytes(range(256)) * 4)  # 1024 bytes

    def tearDown(self):
        shutil.rmtree(self.root, ignore_errors=True)

    def get(self, rng=None):
        from django.test import RequestFactory

        from common.media_dev import serve_media

        headers = {"HTTP_RANGE": rng} if rng else {}
        with self.settings(MEDIA_ROOT=self.root):
            return serve_media(RequestFactory().get("/media/clip.mp4", **headers), "clip.mp4")

    def test_whole_file_advertises_ranges(self):
        res = self.get()
        self.assertEqual((res.status_code, res["Accept-Ranges"]), (200, "bytes"))

    def test_ranges(self):
        res = self.get("bytes=0-99")
        self.assertEqual((res.status_code, res["Content-Range"], res["Content-Length"]), (206, "bytes 0-99/1024", "100"))
        self.assertEqual(b"".join(res.streaming_content), bytes(range(100)))
        self.assertEqual(self.get("bytes=1000-")["Content-Range"], "bytes 1000-1023/1024")
        self.assertEqual(self.get("bytes=-24")["Content-Range"], "bytes 1000-1023/1024")
        self.assertEqual(self.get("bytes=2000-").status_code, 416)

    def test_no_escape_from_media_root(self):
        from django.http import Http404

        with self.assertRaises(Http404):
            self.get_path("../settings.py")

    def get_path(self, path):
        from django.test import RequestFactory

        from common.media_dev import serve_media

        with self.settings(MEDIA_ROOT=self.root):
            return serve_media(RequestFactory().get("/media/x"), path)
