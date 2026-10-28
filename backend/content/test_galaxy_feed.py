from django.test import TestCase, override_settings
from rest_framework.test import APIClient

from .models import CaseStudy, CaseStudyMedia


def study(slug, published=True):
    return CaseStudy.objects.create(slug=slug, title=slug, published=published, tagline_en="t", summary_en="s")


def media(cs, n, kind="image", galaxy=False, gallery=True):
    return CaseStudyMedia.objects.create(case_study=cs, order=n, kind=kind, file=f"work/media/{cs.slug}-{n}-web.jpg", in_galaxy=galaxy, in_gallery=gallery)


@override_settings(NEXT_REVALIDATE_URL="")
class GalaxyFeedTests(TestCase):
    def slugs(self):
        return [item["slug"] for item in APIClient().get("/api/content/galaxy/").json()]

    def test_a_new_published_project_joins_with_its_gallery(self):
        fresh = study("fresh")
        for n in range(5):
            media(fresh, n)
        media(fresh, 9, kind="video")
        items = APIClient().get("/api/content/galaxy/").json()
        self.assertEqual(len(items), 3)  # capped
        self.assertEqual(items[0]["kind"], "video")  # videos first

    def test_picked_clips_win_and_drafts_stay_out(self):
        picked = study("picked")
        media(picked, 0, galaxy=True)
        media(picked, 1)  # gallery only: not added, the project chose its clips
        hidden = study("hidden", published=False)
        media(hidden, 0, galaxy=True)
        media(study("private"), 0, gallery=False)
        self.assertEqual(self.slugs(), ["picked"])


@override_settings(NEXT_REVALIDATE_URL="")
class GalaxyBalanceTests(TestCase):
    def test_capped_at_35_and_shared_fairly(self):
        big, small = study("big"), study("small")
        for n in range(40):
            media(big, n, kind="video" if n % 3 else "image", galaxy=True)
        for n in range(3):
            media(small, n, kind="video", galaxy=True)
        slugs = [i["slug"] for i in APIClient().get("/api/content/galaxy/").json()]
        self.assertEqual(len(slugs), 35)
        self.assertEqual(slugs.count("small"), 3)  # a small project keeps everything
        self.assertEqual(slugs[:6], ["big", "small", "big", "small", "big", "small"])  # taking turns

    def test_mostly_clips_inside_a_project(self):
        cs = study("mixed")
        for n in range(6):
            media(cs, n, kind="image", galaxy=True)
        for n in range(6, 12):
            media(cs, n, kind="video", galaxy=True)
        kinds = [i["kind"] for i in APIClient().get("/api/content/galaxy/").json()]
        self.assertEqual(kinds[:6], ["video", "video", "image", "video", "video", "image"])
