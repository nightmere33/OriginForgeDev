from django.conf import settings
from django.contrib import admin
from django.core.cache import cache
from django.http import HttpResponse, JsonResponse
from django.urls import include, path, re_path

from billing import webhooks as billing_webhooks

admin.site.site_header = "OriginForge"
admin.site.site_title = "OriginForge admin"
admin.site.index_title = "Studio data"


def _limited(login_view):
    """The admin's own password form, held to the site login's limit: 10 wrong tries per address in 15 minutes."""

    def view(request, *args, **kwargs):
        key = f"admin-login-fails:{request.META.get('REMOTE_ADDR', '')}"
        if request.method == "POST" and cache.get(key, 0) >= 10:
            return HttpResponse("Too many sign-in attempts. Try again in 15 minutes.", status=429, content_type="text/plain")
        response = login_view(request, *args, **kwargs)
        if request.method == "POST" and not request.user.is_authenticated:
            cache.add(key, 0, 15 * 60)
            cache.incr(key)
        return response

    return view


admin.site.login = _limited(admin.site.login)


def health(request):
    return JsonResponse({"status": "ok"})


urlpatterns = [
    path("api/health/", health),
    path("api/auth/", include("accounts.urls")),
    path("api/content/", include("content.urls")),
    path("api/rates/", include("fx.urls")),
    path("api/live/", include("live.urls")),
    path("api/reviews/", include("reviews.urls")),
    path("api/studio/", include("studio.urls")),
    path("api/support/", include("support.urls")),
    path("api/assistant/", include("assistant.urls")),
    path("api/", include("engagements.urls")),
    path("api/", include("billing.urls")),
    # Provider notices (nginx routes /webhooks/ here): Chargily and PayPal.
    path("webhooks/chargily/", billing_webhooks.chargily_webhook),
    path("webhooks/paypal/", billing_webhooks.paypal_webhook),
    path(settings.DJANGO_ADMIN_PATH, admin.site.urls),
]

if settings.DEBUG:
    # Range-aware, like nginx in production (videos need 206 responses on iOS).
    from common.media_dev import serve_media

    urlpatterns += [re_path(rf"^{settings.MEDIA_URL.lstrip('/')}(?P<path>.*)$", serve_media)]
