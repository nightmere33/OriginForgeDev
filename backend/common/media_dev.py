"""
Development media server with HTTP Range support.

django.views.static.serve answers every request with the whole file (200).
Safari and iOS need byte ranges (206) to start, seek and loop a video, and
every browser re-downloads the clip on each loop without them. Production
media is served by nginx (ranges and long cache headers built in); this only
makes `runserver` behave the same, so phones on the LAN test what visitors get.
"""

import mimetypes
import re
from pathlib import Path

from django.conf import settings
from django.core.exceptions import SuspiciousFileOperation
from django.http import FileResponse, Http404, HttpResponse, StreamingHttpResponse
from django.utils._os import safe_join

RANGE = re.compile(r"bytes=(\d*)-(\d*)$")
CHUNK = 256 * 1024
CACHE = "public, max-age=86400"  # nginx sends a year + immutable in production


def _chunks(path: Path, start: int, length: int):
    with path.open("rb") as f:
        f.seek(start)
        while length > 0:
            data = f.read(min(CHUNK, length))
            if not data:
                break
            length -= len(data)
            yield data


def serve_media(request, path: str):
    try:
        full = Path(safe_join(settings.MEDIA_ROOT, path))
    except (SuspiciousFileOperation, ValueError):  # the path escapes MEDIA_ROOT
        raise Http404
    if not full.is_file():
        raise Http404
    size = full.stat().st_size
    ctype = mimetypes.guess_type(full.name)[0] or "application/octet-stream"
    match = RANGE.match(request.headers.get("Range", "").strip())
    if not match:
        response = FileResponse(full.open("rb"), content_type=ctype)
        response["Accept-Ranges"] = "bytes"
        response["Cache-Control"] = CACHE
        return response
    first, last = match.groups()
    if first == "":  # suffix range: the last N bytes
        start, end = max(0, size - int(last or 0)), size - 1
    else:
        start, end = int(first), min(int(last) if last else size - 1, size - 1)
    if start > end or start >= size:
        response = HttpResponse(status=416)
        response["Content-Range"] = f"bytes */{size}"
        return response
    length = end - start + 1
    response = StreamingHttpResponse(_chunks(full, start, length), status=206, content_type=ctype)
    response["Content-Range"] = f"bytes {start}-{end}/{size}"
    response["Content-Length"] = str(length)
    response["Accept-Ranges"] = "bytes"
    response["Cache-Control"] = CACHE
    return response

