"""
Profile pictures: checked, cleaned and re-encoded before anyone sees them.

An upload must open as a real picture (JPEG, PNG, WebP or GIF, read by
Pillow with a pixel ceiling against decompression bombs). It is turned
upright, cropped to a centred square, scaled to 384 px and saved as a new
WebP: no EXIF (location, camera, date) survives, only pixels.

Before it is kept, that square, exactly what people will see, goes through
an on-device classifier (Marqo nsfw-image-detection-384, Apache-2.0, run by
onnxruntime). Explicit pictures are refused. Nothing leaves the server, and
if the classifier can't run the upload is refused rather than let through
unchecked.
"""

import io
import logging
import threading
from pathlib import Path

from django.conf import settings
from django.core.files.base import ContentFile
from PIL import Image, ImageOps, UnidentifiedImageError

logger = logging.getLogger("originforge.avatar")

MAX_BYTES = 8 * 1024 * 1024
MAX_PIXELS = 40_000_000
SIDE = 384
FORMATS = {"JPEG", "PNG", "WEBP", "GIF", "MPO"}  # MPO: the JPEG some phones write
MODEL = Path(__file__).resolve().parent / "moderation" / "nsfw-384.onnx"


class Refused(Exception):
    """The upload can't be used; the message is shown to the person."""

    def __init__(self, message: str, status: int = 400):
        super().__init__(message)
        self.status = status


def square(upload) -> Image.Image:
    """The upload as an upright RGB(A) square of SIDE px, or Refused."""
    if upload.size > MAX_BYTES:
        raise Refused(f"Pictures must be under {MAX_BYTES // (1024 * 1024)} MB.")
    try:
        img = Image.open(upload)
        # Only the header is read so far: check the size before decoding any pixels.
        if img.format not in FORMATS:
            raise Refused("Use a JPEG, PNG, WebP or GIF picture.")
        if img.width * img.height > MAX_PIXELS:
            raise Refused("That picture is too large. Use one under 40 megapixels.")
        img.load()
    except (UnidentifiedImageError, OSError, Image.DecompressionBombError, ValueError):
        raise Refused("That file doesn't open as a picture.")
    img = ImageOps.exif_transpose(img)
    alpha = img.mode in ("RGBA", "LA") or (img.mode == "P" and "transparency" in img.info)
    img = img.convert("RGBA" if alpha else "RGB")
    return ImageOps.fit(img, (SIDE, SIDE), Image.Resampling.LANCZOS, centering=(0.5, 0.4))


_session = None
_lock = threading.Lock()


def _classifier():
    """Loaded once per process, on the first upload (about 25 MB in memory)."""
    global _session
    if _session is None:
        with _lock:
            if _session is None:
                import onnxruntime

                opts = onnxruntime.SessionOptions()
                opts.intra_op_num_threads = 1  # one vCPU: never starve the requests around it
                _session = onnxruntime.InferenceSession(str(MODEL), opts, providers=["CPUExecutionProvider"])
    return _session


def nsfw_score(img: Image.Image) -> float:
    """Probability (0 to 1) that the picture is explicit."""
    import numpy as np

    flat = Image.new("RGB", img.size, (255, 255, 255))
    flat.paste(img, mask=img.getchannel("A") if img.mode == "RGBA" else None)
    pixels = np.asarray(flat, dtype=np.float32) / 255.0
    pixels = (pixels - 0.5) / 0.5  # the model's normalisation (mean 0.5, std 0.5)
    batch = pixels.transpose(2, 0, 1)[None]
    session = _classifier()
    logits = session.run(None, {session.get_inputs()[0].name: batch})[0][0]
    odds = np.exp(logits - logits.max())
    return float(odds[0] / odds.sum())  # label order: NSFW, SFW


def process(upload) -> tuple[ContentFile, float]:
    """The cleaned WebP ready to save, and its score; Refused if it can't be used."""
    img = square(upload)
    try:
        score = nsfw_score(img)
    except Exception:
        logger.exception("Avatar check failed")
        raise Refused("Pictures can't be checked right now. Try again in a little while.", status=503)
    if score >= settings.AVATAR_NSFW_THRESHOLD:
        raise Refused("This picture can't be used as a profile picture. Choose another one.", status=422)
    out = io.BytesIO()
    img.save(out, "WEBP", quality=84, method=5)
    return ContentFile(out.getvalue(), name="avatar.webp"), score
