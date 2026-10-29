"""Studio → People (standing, filters, one person's detail) and Studio → Media (originals to download)."""

import shutil
import tempfile
from pathlib import Path

from django.core.management import call_command
from django.test import override_settings

from engagements.test_lifecycle import LifecycleBase


class PeopleTests(LifecycleBase):
    def test_people_show_their_standing_and_filter_by_it(self):
        dev = self.api(self.dev)
        self.started_project()  # Alice: Pro project
        rows = {r["email"]: r for r in self.ok(dev.get("/api/studio/clients/"))["results"]}
        self.assertEqual(rows["alice@example.com"]["standing"]["tier"], "pro")
        self.assertEqual(rows["bob@example.com"]["standing"]["tier"], "newcomer")
        self.assertEqual([r["email"] for r in self.ok(dev.get("/api/studio/clients/?show=newcomers"))["results"]], ["bob@example.com"])
        self.assertEqual([r["email"] for r in self.ok(dev.get("/api/studio/clients/?show=clients"))["results"]], ["alice@example.com"])
        one = self.ok(dev.get(f"/api/studio/clients/{self.alice.pk}/"))
        self.assertEqual(len(one["requests_list"]), 1)
        self.assertEqual(one["requests_list"][0]["engagement_status"], "in_development")
        self.assertEqual(self.api(self.alice).get(f"/api/studio/clients/{self.alice.pk}/").status_code, 403)


class MediaTests(LifecycleBase):
    def test_originals_are_listed_and_downloaded_by_the_studio_only(self):
        tmp = Path(tempfile.mkdtemp(prefix="of-lib-"))
        try:
            film = tmp / "OriginForge-Promo-EN.mp4"
            film.write_bytes(b"\x00\x00\x00\x18ftypmp42" + b"0" * 2048)
            caption = tmp / "caption.txt"
            caption.write_text("Software, forged to order. #originforge", encoding="utf-8")
            with override_settings(PRIVATE_MEDIA_ROOT=tmp / "private"):
                call_command("add_library_film", str(film), "--title", "Promo", "--kind", "promo", "--caption", str(caption), verbosity=0)
                call_command("add_library_film", str(film), "--title", "Promo", "--kind", "promo", verbosity=0)  # replaces
                data = self.ok(self.api(self.dev).get("/api/studio/media/"))
                self.assertEqual(len(data["originals"]), 1)
                item = data["originals"][0]
                res = self.api(self.dev).get(item["download"])
                self.assertEqual(res.status_code, 200)
                self.assertIn("attachment", res["Content-Disposition"])
                self.assertEqual(self.api(self.alice).get(item["download"]).status_code, 403)
                self.assertEqual(self.api(self.alice).get("/api/studio/media/").status_code, 403)
        finally:
            shutil.rmtree(tmp, ignore_errors=True)
