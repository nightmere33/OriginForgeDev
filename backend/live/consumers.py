from channels.generic.websocket import AsyncJsonWebsocketConsumer

from .service import STUDIO, user_group


class LiveConsumer(AsyncJsonWebsocketConsumer):
    """One socket per signed-in visitor: their own group, plus the studio's for the developer.

    Authentication is the site's session cookie (AuthMiddlewareStack); the
    Origin header is checked against ALLOWED_HOSTS (config/asgi.py). The
    socket only receives: every action still goes through the REST API.
    """

    async def connect(self):
        user = self.scope.get("user")
        if user is None or not user.is_authenticated or not user.is_active:
            await self.close(code=4401)
            return
        self.groups_joined = [user_group(user.pk)]
        if getattr(user, "is_developer", False):
            self.groups_joined.append(STUDIO)
        for group in self.groups_joined:
            await self.channel_layer.group_add(group, self.channel_name)
        await self.accept()
        await self.send_json({"type": "hello"})

    async def disconnect(self, code):
        for group in getattr(self, "groups_joined", []):
            await self.channel_layer.group_discard(group, self.channel_name)

    async def receive_json(self, content, **kwargs):
        # Keep-alive only; the client pings so idle proxies don't drop the socket.
        if content.get("type") == "ping":
            await self.send_json({"type": "pong"})

    async def live_event(self, message):
        await self.send_json(message["event"])
