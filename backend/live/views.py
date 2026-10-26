from django.utils import timezone
from rest_framework import permissions
from rest_framework.response import Response
from rest_framework.views import APIView

from .models import Notification
from .service import serialize


class NotificationsView(APIView):
    """The visitor's latest notifications and how many are unread."""

    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        qs = Notification.objects.filter(user=request.user)
        return Response({
            "unread": qs.filter(read_at__isnull=True).count(),
            "items": [serialize(n) for n in qs[:30]],
        })


class NotificationsReadView(APIView):
    """Mark some (ids) or all notifications read."""

    permission_classes = [permissions.IsAuthenticated]

    def post(self, request):
        qs = Notification.objects.filter(user=request.user, read_at__isnull=True)
        ids = request.data.get("ids")
        if isinstance(ids, list):
            qs = qs.filter(pk__in=[i for i in ids if isinstance(i, int)])
        qs.update(read_at=timezone.now())
        return Response({"unread": Notification.objects.filter(user=request.user, read_at__isnull=True).count()})
