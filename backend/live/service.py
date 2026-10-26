"""
Live updates over WebSockets (Django Channels).

Every signed-in visitor holds one socket (consumers.LiveConsumer), joined to
their own group and, for the developer, the studio group. Anything that
changes for them is pushed the moment the transaction commits:

  notification  an in-app notification (the twin of a lifecycle e-mail)
  request       a request or project moved (offer, contract, payment, progress)
  message       a new message in a project conversation

Pushes never raise into the request that caused them: a missing channel
layer or a dropped socket only costs the live refresh, never the action.
"""

import logging

from asgiref.sync import async_to_sync
from channels.layers import get_channel_layer
from django.contrib.auth import get_user_model
from django.db import transaction

from .models import Notification

logger = logging.getLogger("originforge.live")

STUDIO = "studio"


def user_group(user_id: int) -> str:
    return f"user.{user_id}"


def push(groups: list[str], event: dict):
    """Send `event` to every socket in `groups`, once the transaction commits."""

    def send():
        layer = get_channel_layer()
        if layer is None:
            return
        for group in groups:
            try:
                async_to_sync(layer.group_send)(group, {"type": "live.event", "event": event})
            except Exception as exc:  # the live refresh is a nicety, never a failure
                logger.warning("Live push to %s failed: %s", group, exc)

    transaction.on_commit(send)


def serialize(n: Notification) -> dict:
    return {
        "id": n.pk,
        "key": n.key,
        "title": n.title,
        "body": n.body,
        "path": n.path,
        "read": n.read_at is not None,
        "created_at": n.created_at.isoformat() if n.created_at else None,
    }


def notify_in_app(user, key: str, title: str, body: str = "", path: str = ""):
    if user is None or not user.is_active:
        return
    n = Notification.objects.create(user=user, key=key, title=title[:200], body=body, path=path[:255])
    push([user_group(user.pk)], {"type": "notification", "notification": serialize(n)})


def notify_studio_in_app(key: str, title: str, body: str = "", path: str = ""):
    User = get_user_model()
    for dev in User.objects.filter(role=User.Role.DEVELOPER, is_active=True):
        notify_in_app(dev, key, title, body, path)


def request_changed(req, action: str):
    """A request or its project moved: both sides refresh what they show."""
    event = {"type": "request", "id": req.pk, "reference": req.reference, "action": action}
    # An unsent draft is the client's own business: the studio hears about it on submit.
    push([user_group(req.client_id)] if req.status == "draft" else [user_group(req.client_id), STUDIO], event)


def message_posted(message):
    req = message.request
    event = {"type": "message", "request": req.pk, "reference": req.reference, "id": message.pk, "sender": message.sender_id}
    push([user_group(req.client_id), STUDIO], event)
