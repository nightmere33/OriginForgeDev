"""
Add a film to the studio's media library (Studio → Media), from a file
already on the server:

    python manage.py add_library_film /tmp/OriginForge-Promo-EN-v5.1.mp4 \
        --title "Promo v5.1" --kind promo --lang en --caption /tmp/post-description.txt

The same title and language replaces the earlier cut.
"""

import json
import shutil
import subprocess
from pathlib import Path

from django.core.files import File
from django.core.management.base import BaseCommand, CommandError

from studio.models import LibraryFilm


def probe(path: Path) -> dict:
    if not shutil.which("ffprobe"):
        return {}
    out = subprocess.run(["ffprobe", "-v", "error", "-select_streams", "v:0", "-show_entries", "stream=width,height:format=duration",
                          "-of", "json", str(path)], capture_output=True, text=True, timeout=60)
    try:
        data = json.loads(out.stdout or "{}")
        stream = (data.get("streams") or [{}])[0]
        return {"width": int(stream.get("width", 0)), "height": int(stream.get("height", 0)),
                "duration": round(float((data.get("format") or {}).get("duration", 0) or 0))}
    except (ValueError, TypeError):
        return {}


class Command(BaseCommand):
    help = "Add (or replace) a full-quality film in Studio → Media."

    def add_arguments(self, parser):
        parser.add_argument("path")
        parser.add_argument("--title", required=True)
        parser.add_argument("--kind", default="promo")
        parser.add_argument("--lang", default="en")
        parser.add_argument("--caption", default="", help="A text file with the post caption")
        parser.add_argument("--order", type=int, default=0)

    def handle(self, *args, **opts):
        path = Path(opts["path"])
        if not path.is_file():
            raise CommandError(f"No file at {path}.")
        caption = Path(opts["caption"]).read_text(encoding="utf-8").strip() if opts["caption"] else ""
        old = LibraryFilm.objects.filter(title=opts["title"], language=opts["lang"]).first()
        film = LibraryFilm(title=opts["title"], language=opts["lang"], kind=opts["kind"], caption=caption,
                           original_name=path.name, size=path.stat().st_size, order=opts["order"], **probe(path))
        with path.open("rb") as fh:
            film.file.save(path.name, File(fh), save=False)
        film.save()
        if old:
            old.file.delete(save=False)
            old.delete()
        self.stdout.write(self.style.SUCCESS(f"{film.title} ({film.language}): {film.width}x{film.height}, {film.duration} s, "
                                             f"{film.size // (1024 * 1024)} MB"))
