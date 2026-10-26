"""
Make anything uploaded in the admin web-ready, so adding a project is just
"upload the clip, tick the boxes, save".

  video → silent H.264 loop with faststart, sized for its use, + first-frame
          poster (if none was given) + real width/height
  image → at most 1920px wide, JPEG q82 (PNG screenshots are often 5–10 MB)

Output files carry a "-web" suffix: that marks them as processed, so saving
the row again does not re-encode. Same encoder settings as
scripts/media/build_media.py. Needs ffmpeg/ffprobe on the server (provision.sh
installs them); without them the upload is kept as-is and a warning is logged.
"""

import json
import logging
import shutil
import subprocess
import tempfile
from pathlib import Path

from celery import shared_task
from django.core.files import File
from django.db import transaction
from django.db.models.signals import post_save
from django.dispatch import receiver
from PIL import Image

from .models import CaseStudy, CaseStudyMedia

logger = logging.getLogger("originforge.media")

WEB = "-web"
MAX_IMAGE_WIDTH = 1920
# The galaxy textures its cards from small stills (one decode each, many cards).
THUMB_WIDTH = 640
# Loop heights: vertical clips are shown on phone stages, landscape in cells.
VERTICAL_HEIGHT = 960
LANDSCAPE_HEIGHT = 720


def processed(name: str) -> bool:
    return Path(name).stem.endswith(WEB)


def _run(*args: str) -> subprocess.CompletedProcess:
    return subprocess.run(args, capture_output=True, text=True, timeout=600)


def probe(path: Path) -> tuple[int, int]:
    out = _run("ffprobe", "-v", "error", "-select_streams", "v:0", "-show_entries", "stream=width,height",
               "-of", "json", str(path))
    stream = json.loads(out.stdout or "{}").get("streams", [{}])[0]
    return int(stream.get("width", 0)), int(stream.get("height", 0))


def encode_loop(src: Path, dest: Path) -> tuple[int, int]:
    w, h = probe(src)
    height = VERTICAL_HEIGHT if h > w else LANDSCAPE_HEIGHT
    result = _run(
        "ffmpeg", "-v", "error", "-y", "-i", str(src), "-an",
        "-vf", f"scale=-2:'min({height},ih)':flags=lanczos,fps=30,format=yuv420p",
        "-c:v", "libx264", "-preset", "slow", "-crf", "27", "-profile:v", "high", "-movflags", "+faststart",
        str(dest),
    )
    if result.returncode != 0:
        raise RuntimeError(result.stderr[-500:])
    return probe(dest)


def first_frame(src: Path, dest: Path):
    result = _run("ffmpeg", "-v", "error", "-y", "-i", str(src), "-frames:v", "1", "-q:v", "4", str(dest))
    if result.returncode != 0:
        raise RuntimeError(result.stderr[-500:])


def shrink_image(src: Path, dest: Path) -> tuple[int, int]:
    with Image.open(src) as img:
        img = img.convert("RGB")
        if img.width > MAX_IMAGE_WIDTH:
            img = img.resize((MAX_IMAGE_WIDTH, round(img.height * MAX_IMAGE_WIDTH / img.width)), Image.LANCZOS)
        img.save(dest, "JPEG", quality=82, optimize=True, progressive=True)
        return img.width, img.height


def make_thumb(src: Path, dest: Path):
    with Image.open(src) as img:
        img = img.convert("RGB")
        if img.width > THUMB_WIDTH:
            img = img.resize((THUMB_WIDTH, round(img.height * THUMB_WIDTH / img.width)), Image.LANCZOS)
        img.save(dest, "JPEG", quality=78, optimize=True, progressive=True)


def _thumb(media: CaseStudyMedia, tmp: str):
    """The 640px galaxy still, from the poster (video) or the picture itself."""
    still = media.poster if media.kind == CaseStudyMedia.Kind.VIDEO else media.file
    if not still or not still.storage.exists(still.name):
        return
    out = Path(tmp) / "thumb.jpg"
    try:
        make_thumb(Path(still.path), out)
    except OSError as exc:  # unreadable image: the galaxy falls back to the poster
        logger.warning("No galaxy still for media %s: %s", media.pk, exc)
        return
    with out.open("rb") as fh:
        media.thumb.save(f"{Path(media.file.name).stem}-thumb.jpg", File(fh), save=False)


def _web_name(field_file, ext: str) -> str:
    return f"{Path(field_file.name).stem}{WEB}{ext}"


def _store(field_file, path: Path, ext: str):
    with path.open("rb") as fh:
        field_file.save(_web_name(field_file, ext), File(fh), save=False)


@shared_task
def process_media(media_id: int):
    media = CaseStudyMedia.objects.filter(pk=media_id).first()
    if media and processed(media.file.name) and not media.thumb:
        # Already web-ready (or seeded by build_media.py): only the galaxy still is missing.
        with tempfile.TemporaryDirectory() as tmp:
            _thumb(media, tmp)
        if media.thumb:
            media.save(update_fields=["thumb"])
        return
    if not media or processed(media.file.name) or not shutil.which("ffmpeg"):
        if media and not shutil.which("ffmpeg"):
            logger.warning("ffmpeg not found; media %s kept as uploaded", media_id)
        return
    old = media.file.name
    with tempfile.TemporaryDirectory() as tmp:
        src = Path(media.file.path)
        if media.kind == CaseStudyMedia.Kind.VIDEO:
            out = Path(tmp) / "loop.mp4"
            media.width, media.height = encode_loop(src, out)
            _store(media.file, out, ".mp4")
            if not media.poster:
                poster = Path(tmp) / "poster.jpg"
                first_frame(out, poster)
                _store(media.poster, poster, ".jpg")
        else:
            out = Path(tmp) / "image.jpg"
            media.width, media.height = shrink_image(src, out)
            _store(media.file, out, ".jpg")
        _thumb(media, tmp)
    media.save(update_fields=["file", "poster", "thumb", "width", "height"])
    media.file.storage.delete(old)
    logger.info("Processed media %s → %s (%sx%s)", media_id, media.file.name, media.width, media.height)


@shared_task
def process_cover(study_id: int):
    study = CaseStudy.objects.filter(pk=study_id).first()
    if not study or not study.cover_video or processed(study.cover_video.name) or not shutil.which("ffmpeg"):
        return
    old = study.cover_video.name
    with tempfile.TemporaryDirectory() as tmp:
        out = Path(tmp) / "cover.mp4"
        encode_loop(Path(study.cover_video.path), out)
        _store(study.cover_video, out, ".mp4")
        if not study.cover_image:
            poster = Path(tmp) / "cover.jpg"
            first_frame(out, poster)
            _store(study.cover_image, poster, ".jpg")
    study.save(update_fields=["cover_video", "cover_image"])
    study.cover_video.storage.delete(old)


@receiver(post_save, sender=CaseStudyMedia)
def on_media_saved(sender, instance, raw=False, **kwargs):
    if not raw and instance.file and (not processed(instance.file.name) or not instance.thumb):
        transaction.on_commit(lambda: process_media.delay(instance.pk))


@receiver(post_save, sender=CaseStudy)
def on_study_saved(sender, instance, raw=False, **kwargs):
    if not raw and instance.cover_video and not processed(instance.cover_video.name):
        transaction.on_commit(lambda: process_cover.delay(instance.pk))
