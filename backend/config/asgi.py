"""
ASGI entry point: Django for HTTP, Channels for the live socket (/ws/live/).

Production runs this under an ASGI server (daphne or uvicorn) behind nginx,
which forwards /ws/ with the Upgrade headers (see deploy/).
"""

import os

from django.core.asgi import get_asgi_application

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings")
django_asgi = get_asgi_application()  # set up Django before importing anything that touches models

from channels.auth import AuthMiddlewareStack  # noqa: E402
from channels.routing import ProtocolTypeRouter, URLRouter  # noqa: E402
from channels.security.websocket import AllowedHostsOriginValidator  # noqa: E402

from live.routing import websocket_urlpatterns  # noqa: E402

application = ProtocolTypeRouter({
    "http": django_asgi,
    # The session cookie authenticates the socket; the Origin must be one of ALLOWED_HOSTS.
    "websocket": AllowedHostsOriginValidator(AuthMiddlewareStack(URLRouter(websocket_urlpatterns))),
})
