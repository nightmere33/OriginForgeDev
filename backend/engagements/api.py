"""Lifecycle endpoints. Every state change delegates to engagements.lifecycle."""

from django.core.exceptions import ValidationError as DjangoValidationError
from django.utils import timezone
from rest_framework import mixins, permissions, status, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import ValidationError
from rest_framework.parsers import FormParser, MultiPartParser
from rest_framework.response import Response
from rest_framework.views import APIView

from accounts.permissions import IsDeveloper
from audit.service import record
from common.files import validate_upload
from content.models import Service
from notifications.events import notify_client

from . import lifecycle
from .lifecycle_serializers import (
    ChargeSerializer, ContractSerializer, EngagementActionSerializer, EngagementSerializer, ExtraSerializer, MessageSerializer,
    MilestoneSerializer, ProposalSerializer, RespondSerializer, SignSerializer, TaskSerializer, UpdateSerializer,
)
from .models import (
    Attachment, Contract, Engagement, Message, Milestone, ProgressUpdate, ProjectRequest, Proposal, Task, WaitlistEntry,
)

VOICE_TYPES = ("audio/",)


def store_upload(request, req: ProjectRequest, upload, voice=False, duration=None) -> Attachment:
    try:
        name = validate_upload(upload)
    except DjangoValidationError as exc:
        raise ValidationError({"file": exc.messages})
    is_voice = voice or (upload.content_type or "").startswith(VOICE_TYPES)
    return Attachment.objects.create(
        request=req, uploaded_by=request.user, file=upload, original_name=name, size=upload.size,
        is_voice=is_voice, duration=int(duration) if str(duration or "").isdigit() else None,
    )


def scoped(qs, user, field="request__client"):
    return qs if user.is_developer else qs.filter(**{field: user})


class ProposalViewSet(mixins.RetrieveModelMixin, viewsets.GenericViewSet):
    serializer_class = ProposalSerializer

    def get_queryset(self):
        return scoped(Proposal.objects.select_related("request"), self.request.user)

    @action(detail=True, methods=["post"])
    def respond(self, request, pk=None):
        proposal = self.get_object()
        body = RespondSerializer(data=request.data)
        body.is_valid(raise_exception=True)
        result = lifecycle.respond(request, proposal.pk, **body.validated_data)
        return Response(ProposalSerializer(result, context={"request": request}).data)


class ContractViewSet(mixins.RetrieveModelMixin, viewsets.GenericViewSet):
    serializer_class = ContractSerializer

    def get_queryset(self):
        return scoped(Contract.objects.select_related("request"), self.request.user)

    @action(detail=True, methods=["post"])
    def sign(self, request, pk=None):
        contract = self.get_object()
        body = SignSerializer(data=request.data)
        body.is_valid(raise_exception=True)
        engagement = lifecycle.sign_contract(request, contract.pk, **body.validated_data)
        return Response(EngagementSerializer(engagement, context={"request": request}).data, status=status.HTTP_201_CREATED)


class EngagementViewSet(mixins.ListModelMixin, mixins.RetrieveModelMixin, viewsets.GenericViewSet):
    serializer_class = EngagementSerializer

    def get_queryset(self):
        qs = Engagement.objects.select_related("request", "contract__proposal__plan").prefetch_related(
            "charges__proofs", "charges__payments", "charges__invoices__charge__engagement__request", "milestones",
            "tasks", "updates__attachments__uploaded_by", "revisions__milestone")
        return scoped(qs, self.request.user, field="client")

    @action(detail=True, methods=["post"], url_path="action")
    def act(self, request, pk=None):
        eng = self.get_object()
        body = EngagementActionSerializer(data=request.data)
        body.is_valid(raise_exception=True)
        eng = lifecycle.engagement_action(request, eng.pk, **body.validated_data)
        return Response(self.get_serializer(eng).data)

    @action(detail=True, methods=["post"], permission_classes=[IsDeveloper])
    def extras(self, request, pk=None):
        """Studio: a cost outside the contract (required) or an offer the client may decline (optional)."""
        body = ExtraSerializer(data=request.data)
        body.is_valid(raise_exception=True)
        charge = lifecycle.add_extra(request, self.get_object().pk, **body.validated_data)
        return Response(ChargeSerializer(charge).data, status=status.HTTP_201_CREATED)

    @action(detail=True, methods=["post"], permission_classes=[IsDeveloper])
    def tasks(self, request, pk=None):
        eng = self.get_object()
        serializer = TaskSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        task = serializer.save(engagement=eng)
        record(request, "task.created", eng.request, task=task.title)
        return Response(TaskSerializer(task).data, status=status.HTTP_201_CREATED)

    @action(detail=True, methods=["post"], permission_classes=[IsDeveloper], parser_classes=[MultiPartParser, FormParser])
    def updates(self, request, pk=None):
        """A progress post with screenshots or clips (several `files`)."""
        eng = self.get_object()
        title = (request.data.get("title") or "").strip()
        if not title:
            raise ValidationError({"title": "Give the update a title."})
        update = ProgressUpdate.objects.create(engagement=eng, author=request.user, title=title[:160],
                                               body=(request.data.get("body") or "").strip())
        for upload in request.FILES.getlist("files")[:10]:
            update.attachments.add(store_upload(request, eng.request, upload))
        # The same news as a card in the conversation, where it can be discussed.
        card = Message.objects.create(request=eng.request, sender=request.user, kind=Message.Kind.UPDATE, update=update, body=title[:160])
        lifecycle._announce(card)
        record(request, "update.posted", eng.request, update=title)
        notify_client("update_posted", eng.client, f"/portal/requests/{eng.request.reference}?tab=progress", title=eng.title, update=title)
        return Response(UpdateSerializer(update).data, status=status.HTTP_201_CREATED)


class MilestoneViewSet(mixins.UpdateModelMixin, viewsets.GenericViewSet):
    serializer_class = MilestoneSerializer

    def get_queryset(self):
        return scoped(Milestone.objects.select_related("engagement__request"), self.request.user, field="engagement__client")

    def get_permissions(self):
        if self.action in ("update", "partial_update", "move"):
            return [IsDeveloper()]
        return super().get_permissions()

    @action(detail=True, methods=["post"])
    def move(self, request, pk=None):
        milestone = lifecycle.set_milestone_status(request, self.get_object().pk, request.data.get("status", ""))
        return Response(MilestoneSerializer(milestone).data)

    @action(detail=True, methods=["post"])
    def review(self, request, pk=None):
        approve = request.data.get("decision") == "approve"
        milestone = lifecycle.review_milestone(request, self.get_object().pk, approve, request.data.get("note", ""))
        return Response(MilestoneSerializer(milestone).data)


class TaskViewSet(mixins.UpdateModelMixin, mixins.DestroyModelMixin, viewsets.GenericViewSet):
    serializer_class = TaskSerializer
    permission_classes = [IsDeveloper]
    queryset = Task.objects.select_related("engagement__request")

    def perform_update(self, serializer):
        extra = {}
        if "status" in serializer.validated_data:
            extra["done_at"] = timezone.now() if serializer.validated_data["status"] == Task.Status.DONE else None
        task = serializer.save(**extra)
        record(self.request, "task.updated", task.engagement.request, task=task.title, status=task.status)


def request_messages(viewset, request, req: ProjectRequest):
    """
    GET the conversation, or POST to it. Reading marks the other side's
    messages seen and clears this reader's message notifications for it, then
    tells every open page (badges drop, the sender sees "Seen"). `?peek=1`
    reads without marking: a conversation open in a hidden browser tab.
    """
    if request.method == "GET":
        if request.query_params.get("peek") != "1":
            unread = req.messages.filter(read_at__isnull=True)
            if request.user.is_developer:
                unread = unread.exclude(sender__role="developer").exclude(sender__is_staff=True)
            else:
                unread = unread.exclude(sender=request.user)
            now = timezone.now()
            seen = unread.update(read_at=now)
            from live.models import Notification
            from live.service import messages_read

            cleared = Notification.objects.filter(
                user=request.user, read_at__isnull=True, key__in=("new_message", "studio_message"), path__contains=req.reference,
            ).update(read_at=now)
            if seen or cleared:
                messages_read(req, request.user.pk, notifications=bool(cleared))
        msgs = req.messages.select_related(
            "sender", "attachment__uploaded_by", "reply_to__sender", "reply_to__attachment", "charge", "proposal",
        ).prefetch_related("reactions", "update__attachments__uploaded_by")
        return Response(MessageSerializer(msgs, many=True, context={"request": request}).data)
    upload = request.FILES.get("file")
    attachment = store_upload(request, req, upload, request.data.get("voice") in ("1", "true"), request.data.get("duration")) if upload else None
    reply_to = request.data.get("reply_to")
    message = lifecycle.post_message(request, req, request.data.get("body", ""), attachment,
                                     reply_to=int(reply_to) if str(reply_to or "").isdigit() else None,
                                     share=(request.data.get("share") or "").strip())
    return Response(MessageSerializer(message, context={"request": request}).data, status=status.HTTP_201_CREATED)


class MessageViewSet(viewsets.GenericViewSet):
    """Reactions on a message of a conversation the user is part of."""

    serializer_class = MessageSerializer

    def get_queryset(self):
        return scoped(Message.objects.select_related("request", "sender"), self.request.user)

    @action(detail=True, methods=["post"])
    def react(self, request, pk=None):
        message = lifecycle.react(request, self.get_object(), str(request.data.get("emoji", "")))
        return Response({"id": message.pk, "reactions": MessageSerializer(message, context={"request": request}).data["reactions"]})


class WaitlistView(APIView):
    """Visitors who arrive while requests are paused leave their e-mail (§4)."""

    permission_classes = [permissions.AllowAny]
    throttle_scope = "register"

    def post(self, request):
        email = (request.data.get("email") or "").strip().lower()
        if "@" not in email or len(email) > 254:
            raise ValidationError({"email": "Enter a valid e-mail address."})
        service = Service.objects.filter(slug=request.data.get("service") or "").first()
        WaitlistEntry.objects.get_or_create(
            email=email, notified_at__isnull=True,
            defaults={"full_name": (request.data.get("full_name") or "")[:150], "service": service,
                      "note": (request.data.get("note") or "")[:500], "language": request.data.get("language") or "en"},
        )
        return Response({"ok": True}, status=status.HTTP_201_CREATED)
