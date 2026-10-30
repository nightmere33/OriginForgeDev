from rest_framework import permissions, status
from rest_framework.generics import get_object_or_404
from rest_framework.response import Response
from rest_framework.views import APIView

from accounts.permissions import IsDeveloper

from . import service
from .models import Review
from .serializers import (
    InviteSerializer, ModerateSerializer, MyReviewSerializer, NewInviteSerializer, PublicReviewSerializer, StudioReviewSerializer,
    WriteReviewSerializer, project_of,
)


class PublicReviewsView(APIView):
    """Published reviews and their summary (cached by the website, refreshed on approval)."""

    permission_classes = (permissions.AllowAny,)

    def get(self, request):
        qs = Review.objects.filter(status=Review.Status.APPROVED).select_related("case_study", "engagement__case_study")[:24]
        return Response({"summary": service.summary(), "items": PublicReviewSerializer(qs, many=True, context={"request": request}).data})


class MyReviewsView(APIView):
    """The client's own reviews, and the delivered projects still waiting for one."""

    throttle_scope = "message"

    def get(self, request):
        mine = Review.objects.filter(author=request.user).select_related("engagement__request")
        eligible = [
            {"engagement": e.pk, "reference": e.request.reference, "title": e.request.title, "label": service._label(e)}
            for e in service.reviewable(request.user)
        ]
        invites = [{"token": i.token, "project": i.case_study.title, "slug": i.case_study.slug} for i in service.pending_invites(request.user)]
        return Response({"eligible": eligible, "reviews": MyReviewSerializer(mine, many=True).data, "invites": invites})

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
        qs = Review.objects.select_related("engagement__request", "author", "case_study").order_by("status", "-created_at")
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


class StudioInvitesView(APIView):
    """Invitations to review projects done outside the platform."""

    permission_classes = (IsDeveloper,)

    def get(self, request):
        from content.models import CaseStudy

        from accounts.models import User

        invites = InviteSerializer(service.ReviewInvite.objects.select_related("case_study")[:100], many=True).data
        projects = list(CaseStudy.objects.filter(published=True).order_by("order").values("slug", "title"))
        # Client accounts to pick from, newest first (the client who just signed up is at the top).
        accounts = list(User.objects.filter(is_active=True, is_staff=False).exclude(role=User.Role.DEVELOPER)
                        .order_by("-date_joined").values("id", "full_name", "email", "language")[:300])
        return Response({"invites": invites, "projects": projects, "accounts": accounts})

    def post(self, request):
        from content.models import CaseStudy

        from accounts.models import User

        body = NewInviteSerializer(data=request.data)
        body.is_valid(raise_exception=True)
        d = body.validated_data
        if d.get("user"):
            account = User.objects.filter(pk=d["user"], is_active=True, is_staff=False).exclude(role=User.Role.DEVELOPER).first()
            if not account:
                return Response({"user": ["Choose a client account."]}, status=status.HTTP_400_BAD_REQUEST)
            d = {**d, "email": account.email, "full_name": d.get("full_name") or account.full_name, "language": account.language}
        elif not d.get("email"):
            return Response({"email": ["Choose an account or type an e-mail address."]}, status=status.HTTP_400_BAD_REQUEST)
        study = CaseStudy.objects.filter(slug=d["case_study"], published=True).first()
        if not study:
            return Response({"case_study": ["Choose a published project."]}, status=status.HTTP_400_BAD_REQUEST)
        inv = service.invite(request, email=d["email"], full_name=d["full_name"], case_study=study, language=d["language"])
        return Response(InviteSerializer(inv).data, status=status.HTTP_201_CREATED)


class InviteView(APIView):
    """The client's side of an invitation: what it is about, then the review."""

    throttle_scope = "message"

    def get_permissions(self):
        return [permissions.AllowAny()] if self.request.method == "GET" else super().get_permissions()

    def get(self, request, token: str):
        inv = service.open_invite(token)
        if not inv:
            return Response({"detail": "This invitation has expired or does not exist."}, status=status.HTTP_404_NOT_FOUND)
        study = inv.case_study
        local, _, domain = inv.email.partition("@")
        project = project_of(Review(case_study=study), request) or {"slug": study.slug, "title": study.title}
        return Response({
            "project": project, "tagline": getattr(study, f"tagline_{inv.language}", "") or study.tagline_en,
            "name": inv.full_name, "email_hint": f"{local[:2]}{'•' * max(1, len(local) - 2)}@{domain}",
            "used": bool(inv.used_at), "matches": request.user.is_authenticated and request.user.email.lower() == inv.email,
        })

    def post(self, request, token: str):
        data = WriteReviewSerializer(data=request.data)
        data.is_valid(raise_exception=True)
        fields = {k: v for k, v in data.validated_data.items() if k != "consent"}
        review = service.submit_invited(request, token, fields)
        return Response(MyReviewSerializer(review).data, status=status.HTTP_201_CREATED)
