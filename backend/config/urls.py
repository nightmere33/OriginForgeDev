from django.conf import settings
from django.contrib import admin
from django.http import JsonResponse
from django.urls import include, path, re_path

admin.site.site_header = "OriginForge"
admin.site.site_title = "OriginForge admin"
admin.site.index_title = "Studio data"


def health(request):
    return JsonResponse({"status": "ok"})


urlpatterns = [
    path("api/health/", health),
    path("api/auth/", include("accounts.urls")),
    path("api/content/", include("content.urls")),
    path("api/rates/", include("fx.urls")),
    path("api/live/", include("live.urls")),
    path("api/reviews/", include("reviews.urls")),
    path("api/", include("engagements.urls")),
    path("api/", include("billing.urls")),
    path(settings.DJANGO_ADMIN_PATH, admin.site.urls),
]

if settings.DEBUG:
    # Range-aware, like nginx in production (videos need 206 responses on iOS).
    from common.media_dev import serve_media

    urlpatterns += [re_path(rf"^{settings.MEDIA_URL.lstrip('/')}(?P<path>.*)$", serve_media)]
