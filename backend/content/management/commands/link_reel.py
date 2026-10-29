"""
Point the showreel and the case-study films at the files listed in
media/work/manifest.json, and nothing else (no copy, covers or galleries):

    python manage.py link_reel

Used after uploading a new cut of the promo (scripts/media/build_media.py
--only films), so the full seed never has to run in production.
"""

import json

from django.conf import settings
from django.core.files.storage import default_storage
from django.core.management.base import BaseCommand, CommandError

from content.models import CaseStudy, SiteSettings


class Command(BaseCommand):
    help = "Link the showreel and films from the media manifest."

    def handle(self, *args, **options):
        path = settings.MEDIA_ROOT / "work" / "manifest.json"
        if not path.exists():
            raise CommandError(f"No manifest at {path}.")
        manifest = json.loads(path.read_text())
        reel = manifest.get("reel")
        if not reel:
            raise CommandError("The manifest has no reel.")
        missing = [f for f in (reel["file"], reel.get("file_av1"), reel["poster"]) if f and not default_storage.exists(f)]
        if missing:
            raise CommandError(f"Upload these first: {', '.join(missing)}")

        site = SiteSettings.load()
        site.showreel.name, site.showreel_av1.name = reel["file"], reel.get("file_av1", "")
        site.showreel_poster.name = reel["poster"]
        site.showreel_width, site.showreel_height = reel["width"], reel["height"]
        site.save()
        self.stdout.write(f"showreel: {reel['file']} ({reel['width']}x{reel['height']}, {reel.get('duration')} s)")

        studies = {s.slug: s for s in CaseStudy.objects.all()}
        for film in manifest.get("films", []):
            study = studies.get(film["slug"])
            if not study or not default_storage.exists(film["file"]):
                continue
            if study.film.name == film["file"]:
                continue
            study.film.name, study.film_av1.name, study.film_poster.name = film["file"], film["file_av1"], film["poster"]
            study.film_width, study.film_height, study.film_duration = film["width"], film["height"], film["duration"]
            study.save(update_fields=["film", "film_av1", "film_poster", "film_width", "film_height", "film_duration"])
            self.stdout.write(f"film for {study.slug}: {film['file']}")
        self.stdout.write(self.style.SUCCESS("Showreel and films linked."))
