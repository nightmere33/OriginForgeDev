from rest_framework import permissions, status
from rest_framework.generics import get_object_or_404
from rest_framework.response import Response
from rest_framework.views import APIView

from accounts.permissions import IsDeveloper

from . import service
from .models import Review
from .serializers import ModerateSerializer, MyReviewSerializer, PublicReviewSerializer, StudioReviewSerializer, WriteReviewSerializer


class PublicReviewsView(APIView):
    """Published reviews and their summary (cached by the website, refreshed on approval)."""

    permission_classes = (permissions.AllowAny,)

    def get(self, request):
        qs = Review.objects.filter(status=Review.Status.APPROVED)[:24]
        return Response({"summary": service.summary(), "items": PublicReviewSerializer(qs, many=True).data})


class MyReviewsView(APIView):
    """The client's own reviews, and the delivered projects still waiting for one."""

    throttle_scope = "message"

    def get(self, request):
        mine = Review.objects.filter(author=request.user).select_related("engagement__request")
        eligible = [
            {"engagement": e.pk, "reference": e.request.reference, "title": e.request.title, "label": service._label(e)}
            for e in service.reviewable(request.user)
        ]
        return Response({"eligible": eligible, "reviews": MyReviewSerializer(mine, many=True).data})

    def post(self, request):
        data = WriteReviewSerializer(data=request.data)
        data.is_valid(raise_exception=True)
        fields = {k: v for k, v in data.validated_data.items() if k != "consent"}
        engagement = request.data.get("engagement")
        if not str(engagement or "").isdigit():
            return Response({"engagement": ["Choose the project."]}, status=status.HTTP_400_BAD_REQUEST)
        review = service.submit(request, int(engagement), fields)
        return Response(MyReviewSerializer(review).data, status=status.HTTP_201_CREATED)


class MyReviewView(APIView):
    throttle_scope = "message"

    def patch(self, request, pk: int):
        review = get_object_or_404(Review.objects.select_related("engagement__request"), pk=pk, author=request.user)
        data = WriteReviewSerializer(data=request.data)
        data.is_valid(raise_exception=True)
        fields = {k: v for k, v in data.validated_data.items() if k != "consent"}
        return Response(MyReviewSerializer(service.edit(request, review, fields)).data)


class StudioReviewsView(APIView):
    permission_classes = (IsDeveloper,)

    def get(self, request):
        qs = Review.objects.select_related("engagement__request", "author").order_by("status", "-created_at")
        wanted = request.query_params.get("status")
        if wanted in Review.Status.values:
            qs = qs.filter(status=wanted)
        return Response(StudioReviewSerializer(qs[:200], many=True).data)


class ModerateReviewView(APIView):
    permission_classes = (IsDeveloper,)

    def post(self, request, pk: int):
        review = get_object_or_404(Review, pk=pk)
        body = ModerateSerializer(data=request.data)
        body.is_valid(raise_exception=True)
        d = body.validated_data
        review = service.moderate(request, review, d["decision"], d["reply"], d["reason"])
        if "featured" in d and review.featured != d["featured"]:
            review.featured = d["featured"]
            review.save(update_fields=["featured", "updated_at"])
        return Response(StudioReviewSerializer(review).data)
