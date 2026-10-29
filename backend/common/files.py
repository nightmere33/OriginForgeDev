"""
Private files: client attachments now, payment receipts later.

They live under PRIVATE_MEDIA_ROOT, which has no URL. The only way out is
`serve_private`, called by a view that has already decided the requester may
see the file. In production nginx streams the bytes from an `internal`
location (X-Accel-Redirect), so gunicorn workers are never tied up by a
download.
"""

import mimetypes
import os
import unicodedata
import uuid
from pathlib import PurePath

from django.conf import settings
from django.core.exceptions import ValidationError
from django.core.files.storage import FileSystemStorage
from django.http import FileResponse, HttpResponse
from django.utils import timezone
from django.utils.deconstruct import deconstructible
from django.utils.http import content_disposition_header


@deconstructible
class PrivateStorage(FileSystemStorage):
    def __init__(self):
        super().__init__(base_url=None)

    # Read at each use, so a test's override_settings(PRIVATE_MEDIA_ROOT=…) is honoured.
    @property
    def base_location(self):
        return str(settings.PRIVATE_MEDIA_ROOT)

    @property
    def location(self):
        return os.path.abspath(self.base_location)

    def url(self, name):  # pragma: no cover - guard rail
        raise RuntimeError("Private files have no URL; serve them through an authorized view.")


private_storage = PrivateStorage()

ALLOWED_EXTENSIONS = {
    ".pdf", ".png", ".jpg", ".jpeg", ".webp", ".gif", ".heic",
    ".doc", ".docx", ".odt", ".rtf", ".txt", ".md", ".csv",
    ".xls", ".xlsx", ".ods", ".ppt", ".pptx", ".odp",
    ".zip", ".mp4", ".mov", ".mp3", ".m4a", ".webm", ".ogg", ".opus", ".wav", ".aac",
}
# Formats that are ZIP containers underneath.
_ZIP_FAMILY = {".docx", ".xlsx", ".pptx", ".odt", ".ods", ".odp", ".zip"}
_IMAGE_FAMILY = {".png", ".jpg", ".jpeg", ".webp", ".gif"}


def safe_original_name(name: str) -> str:
    name = unicodedata.normalize("NFKC", PurePath(name or "file").name)
    name = "".join(ch for ch in name if ch.isprintable() and ch not in '<>:"/\\|?*')
    stem, ext = os.path.splitext(name.strip() or "file")
    return f"{stem[:120]}{ext[:10].lower()}"


@deconstructible
class private_upload_path:
    """upload_to: random names, never the client's filename on disk."""

    def __init__(self, prefix: str):
        self.prefix = prefix

    def __call__(self, instance, filename):
        ext = os.path.splitext(filename)[1].lower()
        return f"{self.prefix}/{timezone.now():%Y/%m}/{uuid.uuid4().hex}{ext}"

    def __eq__(self, other):
        return isinstance(other, private_upload_path) and other.prefix == self.prefix


def validate_upload(upload) -> str:
    """Raise ValidationError for anything we don't accept; return the clean name."""
    name = safe_original_name(upload.name)
    ext = os.path.splitext(name)[1].lower()
    if ext not in ALLOWED_EXTENSIONS:
        raise ValidationError(f"Files of type '{ext or 'unknown'}' are not accepted.")
    if upload.size > settings.UPLOAD_MAX_BYTES:
        raise ValidationError(f"Files must be under {settings.UPLOAD_MAX_BYTES // (1024 * 1024)} MB.")
    if upload.size == 0:
        raise ValidationError("The file is empty.")

    head = upload.read(8)
    upload.seek(0)
    if ext == ".pdf" and not head.startswith(b"%PDF"):
        raise ValidationError("This doesn't look like a valid PDF.")
    if ext in _ZIP_FAMILY and not head.startswith(b"PK"):
        raise ValidationError("This file appears to be damaged.")
    if ext in _IMAGE_FAMILY:
        from PIL import Image, UnidentifiedImageError

        try:
            with Image.open(upload) as img:
                img.verify()
        except (UnidentifiedImageError, OSError, SyntaxError):
            raise ValidationError("This image could not be read.")
        finally:
            upload.seek(0)
    return name


def serve_private(field_file, download_name: str) -> HttpResponse:
    content_type = mimetypes.guess_type(download_name)[0] or "application/octet-stream"
    accel = settings.PRIVATE_MEDIA_ACCEL_PREFIX
    if accel:
        response = HttpResponse(content_type=content_type)
        response["X-Accel-Redirect"] = f"{accel.rstrip('/')}/{field_file.name}"
    else:
        response = FileResponse(field_file.open("rb"), content_type=content_type)
    response["Content-Disposition"] = content_disposition_header(as_attachment=True, filename=download_name)
    response["X-Content-Type-Options"] = "nosniff"
    response["Cache-Control"] = "private, no-store"
    response["Content-Security-Policy"] = "default-src 'none'; sandbox"
    return response
