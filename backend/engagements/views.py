from django.conf import settings
from django.core.exceptions import ValidationError as DjangoValidationError
from django.db.models import Count
from django.shortcuts import get_object_or_404
from rest_framework import mixins, status, viewsets
from rest_framework.decorators import action, api_view
from rest_framework.exceptions import PermissionDenied, ValidationError
from rest_framework.parsers import FormParser, JSONParser, MultiPartParser
from rest_framework.response import Response

from accounts.permissions import IsDeveloper
from audit.service import record
from common.files import serve_private, validate_upload
from content.models import SiteSettings
from content.pricing import estimate

from . import capacity, lifecycle, services
from .api import request_messages
from .lifecycle_serializers import ProposalCreateSerializer, ProposalSerializer
from .models import Attachment, ProjectRequest
from .serializers import AttachmentSerializer, ProjectRequestDetailSerializer, ProjectRequestSerializer, TransitionSerializer

UPLOADABLE = (ProjectRequest.Status.DRAFT, ProjectRequest.Status.SUBMITTED, ProjectRequest.Status.IN_REVIEW,
              ProjectRequest.Status.CLARIFICATION)


class ProjectRequestViewSet(mixins.CreateModelMixin, mixins.ListModelMixin, mixins.RetrieveModelMixin,
                            mixins.UpdateModelMixin, mixins.DestroyModelMixin, viewsets.GenericViewSet):
    serializer_class = ProjectRequestSerializer
    lookup_field = "reference"

    def get_serializer_class(self):
        return ProjectRequestDetailSerializer if self.action == "retrieve" else ProjectRequestSerializer

    def get_queryset(self):
        qs = ProjectRequest.objects.select_related("client", "service", "engagement").prefetch_related(
            "attachments__uploaded_by", "attachments__updates", "attachments__message")
        user = self.request.user
        status_filter = self.request.query_params.get("status")
        if not user.is_developer:
            # Another client's request is simply not found: a 404, not a 403.
            qs = qs.filter(client=user)
            return qs.filter(status=status_filter) if status_filter and self.action == "list" else qs
        if self.action == "list":
            # Unfinished drafts are the client's business until they are sent.
            return qs.filter(status=status_filter) if status_filter else qs.exclude(status=ProjectRequest.Status.DRAFT)
        return qs

    def get_throttles(self):
        scope = {"create": "request_submit", "submit": "request_submit", "attachments": "upload",
                 "partial_update": "draft", "update": "draft"}.get(self.action)
        if self.action == "create" and str(self.request.data.get("draft", "")).lower() in ("1", "true"):
            scope = "draft"
        if self.action == "messages" and self.request.method == "POST":
            scope = "message"
        self.throttle_scope = scope
        return super().get_throttles()

    def _with_estimate(self, req: ProjectRequest):
        """Snapshot what the calculator showed, so the proposal can refer to it."""
        currency = req.budget_currency or "DZD"
        result = estimate(req.service, currency, req.plan.code if req.plan else None, req.options or {})
        req.options, req.estimate_low, req.estimate_high, req.estimate_currency = result.choices, result.low, result.high, currency

    def perform_create(self, serializer):
        """`draft: true` saves a draft the client can finish later; otherwise it is submitted."""
        req = ProjectRequest(client=self.request.user, **serializer.validated_data)
        self._with_estimate(req)
        if str(self.request.data.get("draft", "")).lower() in ("1", "true"):
            req.status = ProjectRequest.Status.DRAFT
            req.save()
            record(self.request, "request.drafted", req)
        else:
            missing = {f: "This field is required." for f in ("title", "objectives") if not getattr(req, f).strip()}
            if missing:
                raise ValidationError(missing)
            if not capacity.accepting():
                site = SiteSettings.load()
                raise PermissionDenied(site.availability_en or "New project requests are paused for now.")
            services.submit_request(self.request, req)
        serializer.instance = req

    def perform_update(self, serializer):
        req = serializer.instance
        if self.request.user.is_developer or req.client_id != self.request.user.id or req.status != ProjectRequest.Status.DRAFT:
            raise PermissionDenied("Only your own draft can be edited.")
        req = serializer.save()
        self._with_estimate(req)
        req.save(update_fields=["options", "estimate_low", "estimate_high", "estimate_currency", "updated_at"])

    def perform_destroy(self, instance):
        """Only an unsent draft can be deleted, by its owner; its files go with it."""
        if self.request.user.is_developer or instance.client_id != self.request.user.id or instance.status != ProjectRequest.Status.DRAFT:
            raise PermissionDenied("Only your own unsent draft can be deleted.")
        for attachment in instance.attachments.all():
            attachment.file.delete(save=False)
        instance.delete()

    @action(detail=True, methods=["post"])
    def submit(self, request, reference=None):
        req = lifecycle.submit_draft(request, self.get_object())
        return Response(ProjectRequestDetailSerializer(req, context={"request": request}).data)

    @action(detail=True, methods=["post"], permission_classes=[IsDeveloper])
    def proposals(self, request, reference=None):
        req = self.get_object()
        body = ProposalCreateSerializer(data=request.data)
        body.is_valid(raise_exception=True)
        proposal = lifecycle.send_offer(request, req.pk, body.validated_data)
        return Response(ProposalSerializer(proposal, context={"request": request}).data, status=status.HTTP_201_CREATED)

    @action(detail=True, methods=["get", "post"], parser_classes=[JSONParser, MultiPartParser, FormParser])
    def messages(self, request, reference=None):
        return request_messages(self, request, self.get_object())

    @action(detail=True, methods=["post"])
    def transition(self, request, reference=None):
        req = self.get_object()
        body = TransitionSerializer(data=request.data)
        body.is_valid(raise_exception=True)
        req = services.transition(request, req.pk, body.validated_data["to"], body.validated_data["note"])
        return Response(self.get_serializer(req).data)

    @action(detail=True, methods=["post"], parser_classes=[MultiPartParser])
    def attachments(self, request, reference=None):
        req = self.get_object()
        if req.status not in UPLOADABLE:
            raise ValidationError({"file": "Files can no longer be added to this request."})
        upload = request.FILES.get("file")
        if upload is None:
            raise ValidationError({"file": "Choose a file to upload."})
        if req.attachments.count() >= settings.UPLOAD_MAX_FILES_PER_REQUEST:
            raise ValidationError({"file": f"Up to {settings.UPLOAD_MAX_FILES_PER_REQUEST} files per request."})
        try:
            name = validate_upload(upload)
        except DjangoValidationError as exc:
            raise ValidationError({"file": exc.messages})
        attachment = Attachment.objects.create(
            request=req, uploaded_by=request.user, file=upload, original_name=name, size=upload.size,
        )
        record(request, "attachment.uploaded", req, attachment=str(attachment.id), name=name)
        return Response(AttachmentSerializer(attachment).data, status=status.HTTP_201_CREATED)

    @action(detail=True, methods=["delete"], url_path=r"attachments/(?P<attachment_id>[0-9a-f-]+)")
    def remove_attachment(self, request, reference=None, attachment_id=None):
        """A client can take a file back out of a draft before sending it."""
        req = self.get_object()
        if req.client_id != request.user.id or req.status != ProjectRequest.Status.DRAFT:
            raise PermissionDenied("Files can only be removed from your own draft.")
        attachment = get_object_or_404(req.attachments, pk=attachment_id)
        attachment.file.delete(save=False)
        attachment.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)

    @action(detail=False, methods=["get"], permission_classes=[IsDeveloper])
    def summary(self, request):
        counts = dict(ProjectRequest.objects.values_list("status").annotate(n=Count("id")))
        return Response({"by_status": counts, "open": sum(counts.get(s, 0) for s in ProjectRequest.OPEN_STATUSES)})


@api_view(["GET"])
def download_attachment(request, pk):
    attachment = get_object_or_404(Attachment.objects.select_related("request"), pk=pk)
    if not (request.user.is_developer or attachment.request.client_id == request.user.id):
        # Indistinguishable from a file that doesn't exist.
        return Response(status=status.HTTP_404_NOT_FOUND)
    record(request, "attachment.downloaded", attachment.request, attachment=str(attachment.id))
    return serve_private(attachment.file, attachment.original_name)
