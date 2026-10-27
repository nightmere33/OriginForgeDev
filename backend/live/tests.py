from asgiref.sync import async_to_sync
from channels.testing import WebsocketCommunicator
from django.contrib.auth import get_user_model
from django.contrib.auth.models import AnonymousUser
from django.test import TestCase, override_settings
from rest_framework.test import APIClient

from notifications.events import notify_client

from .consumers import LiveConsumer
from .models import Notification
from .service import STUDIO, push, user_group

MEMORY = {"default": {"BACKEND": "channels.layers.InMemoryChannelLayer"}}


def make_user(email="client@example.com", **extra):
    User = get_user_model()
    return User.objects.create_user(email=email, password="a-long-test-password-1", full_name="Test Client", **extra)


@override_settings(CHANNEL_LAYERS=MEMORY)
class LiveSocketTests(TestCase):
    def connect(self, user):
        comm = WebsocketCommunicator(LiveConsumer.as_asgi(), "/ws/live/")
        comm.scope["user"] = user
        return comm

    def test_anonymous_socket_is_refused(self):
        async def run():
            comm = self.connect(AnonymousUser())
            connected, code = await comm.connect()
            self.assertFalse(connected)
            self.assertEqual(code, 4401)

        async_to_sync(run)()

    def test_signed_in_socket_receives_its_own_events_only(self):
        me, other = make_user(), make_user("other@example.com")

        async def run():
            comm = self.connect(me)
            connected, _ = await comm.connect()
            self.assertTrue(connected)
            self.assertEqual((await comm.receive_json_from())["type"], "hello")
            from channels.layers import get_channel_layer

            layer = get_channel_layer()
            await layer.group_send(user_group(other.pk), {"type": "live.event", "event": {"type": "x"}})
            await layer.group_send(user_group(me.pk), {"type": "live.event", "event": {"type": "request", "id": 7}})
            self.assertEqual(await comm.receive_json_from(), {"type": "request", "id": 7})
            self.assertTrue(await comm.receive_nothing())
            await comm.disconnect()

        async_to_sync(run)()

    def test_clients_never_join_the_studio_group(self):
        me = make_user()

        async def run():
            comm = self.connect(me)
            await comm.connect()
            await comm.receive_json_from()
            from channels.layers import get_channel_layer

            await get_channel_layer().group_send(STUDIO, {"type": "live.event", "event": {"type": "secret"}})
            self.assertTrue(await comm.receive_nothing())
            await comm.disconnect()

        async_to_sync(run)()

    def test_push_waits_for_commit(self):
        # Outside a transaction on_commit runs at once; inside, only on commit.
        with self.captureOnCommitCallbacks() as callbacks:
            push([user_group(1)], {"type": "x"})
        self.assertEqual(len(callbacks), 1)


@override_settings(CHANNEL_LAYERS=MEMORY)
class InAppNotificationTests(TestCase):
    def test_client_events_create_an_in_app_notification(self):
        user = make_user()
        with self.captureOnCommitCallbacks(execute=True):
            notify_client("new_message", user, "/portal/requests/OF-TEST", title="Site", sender="Younes", preview="Hi")
        n = Notification.objects.get(user=user)
        self.assertEqual(n.path, "/portal/requests/OF-TEST")
        self.assertIn("Site", n.title + n.body)

    def test_list_and_mark_read(self):
        user = make_user()
        Notification.objects.create(user=user, key="k", title="One")
        Notification.objects.create(user=user, key="k", title="Two")
        api = APIClient()
        api.force_authenticate(user)
        data = api.get("/api/live/notifications/").json()
        self.assertEqual(data["unread"], 2)
        self.assertEqual(api.post("/api/live/notifications/read/", {}, format="json").json()["unread"], 0)

    def test_notifications_are_private(self):
        mine, theirs = make_user(), make_user("other@example.com")
        Notification.objects.create(user=theirs, key="k", title="Theirs")
        api = APIClient()
        api.force_authenticate(mine)
        self.assertEqual(api.get("/api/live/notifications/").json()["items"], [])

    def test_clear_deletes_only_my_notifications(self):
        mine, theirs = make_user(), make_user("other@example.com")
        keep = Notification.objects.create(user=mine, key="k", title="Keep")
        Notification.objects.create(user=mine, key="k", title="Gone")
        Notification.objects.create(user=theirs, key="k", title="Theirs")
        api = APIClient()
        api.force_authenticate(mine)
        gone = Notification.objects.get(title="Gone")
        api.post("/api/live/notifications/clear/", {"ids": [gone.pk]}, format="json")
        self.assertEqual(list(Notification.objects.filter(user=mine)), [keep])
        self.assertEqual(api.post("/api/live/notifications/clear/", {}, format="json").json()["unread"], 0)
        self.assertFalse(Notification.objects.filter(user=mine).exists())
        self.assertTrue(Notification.objects.filter(user=theirs).exists())
