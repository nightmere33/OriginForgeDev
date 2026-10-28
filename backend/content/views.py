from django.shortcuts import get_object_or_404
from rest_framework import permissions
from rest_framework.decorators import api_view, permission_classes, throttle_classes
from rest_framework.response import Response

from .models import FAQ, CarePlan, CaseStudy, CaseStudyMedia, Credential, Service, SiteSettings, Tech, Testimonial
from .pricing import estimate as compute_estimate, factors_for
from .serializers import (
    CarePlanSerializer, CaseStudyDetailSerializer, CaseStudyListSerializer, CredentialSerializer, EstimateRequestSerializer,
    FAQSerializer, GalaxyItemSerializer, PricingFactorSerializer,
    ServiceSerializer, SiteSettingsSerializer, TechSerializer, TestimonialSerializer,
)

# Every view here is public and read-only. Next.js fetches them server-side,
# caches the results and is told to refresh on save, so there is no
# pagination and no per-visitor throttling.
PUBLIC = [permissions.AllowAny]


# Gallery items a project without picked galaxy clips contributes to the galaxy.
GALAXY_FALLBACK = 3
# Distinct items the galaxy cycles through, as getartcraft.com does (35 clips
# for its 64 cards): more only repeats sooner-forgotten faces and costs decodes.
GALAXY_LIMIT = 35


def balanced(items, limit: int = GALAXY_LIMIT):
    """
    At most `limit` items, shared fairly: one per project per round until the
    limit, so small projects keep everything and big ones share the rest.
    Inside a project, mostly clips: two videos, then a photo.
    """
    queues: dict[int, list] = {}
    for m in items:
        queues.setdefault(m.case_study_id, []).append(m)
    for key, ms in queues.items():
        videos = [m for m in ms if m.kind == CaseStudyMedia.Kind.VIDEO]
        photos = [m for m in ms if m.kind != CaseStudyMedia.Kind.VIDEO]
        mixed = []
        while videos or photos:
            mixed += videos[:2]
            del videos[:2]
            if photos:
                mixed.append(photos.pop(0))
        queues[key] = mixed
    out = []
    while len(out) < limit and any(queues.values()):
        for ms in queues.values():
            if ms and len(out) < limit:
                out.append(ms.pop(0))
    return out

@api_view(["GET"])
@permission_classes(PUBLIC)
@throttle_classes([])
def site(request):
    return Response(SiteSettingsSerializer(SiteSettings.load(), context={"request": request}).data)


@api_view(["GET"])
@permission_classes(PUBLIC)
@throttle_classes([])
def services(request):
    qs = Service.objects.filter(active=True).prefetch_related("prices")
    return Response(ServiceSerializer(qs, many=True, context={"request": request}).data)


@api_view(["GET"])
@permission_classes(PUBLIC)
@throttle_classes([])
def work_list(request):
    qs = CaseStudy.objects.filter(published=True)
    return Response(CaseStudyListSerializer(qs, many=True, context={"request": request}).data)


@api_view(["GET"])
@permission_classes(PUBLIC)
@throttle_classes([])
def work_detail(request, slug):
    study = get_object_or_404(CaseStudy.objects.prefetch_related("media"), slug=slug, published=True)
    return Response(CaseStudyDetailSerializer(study, context={"request": request}).data)


@api_view(["GET"])
@permission_classes(PUBLIC)
@throttle_classes([])
def galaxy(request):
    """
    Clips ticked "in galaxy", and, for every published project with none
    ticked, its first gallery items (videos first): a new project joins the
    galaxy as soon as it is published, no extra step.
    """
    picked = list(
        CaseStudyMedia.objects.filter(in_galaxy=True, case_study__published=True)
        .select_related("case_study")
        .order_by("case_study__order", "order")
    )
    covered = {m.case_study_id for m in picked}
    fallback = (
        CaseStudyMedia.objects.filter(case_study__published=True, in_gallery=True)
        .exclude(case_study_id__in=covered)
        .select_related("case_study")
        .order_by("case_study__order", "case_study_id", "-kind", "order")  # "video" sorts after "image": -kind puts videos first
    )
    per_study: dict[int, int] = {}
    for m in fallback:
        if per_study.get(m.case_study_id, 0) < GALAXY_FALLBACK:
            per_study[m.case_study_id] = per_study.get(m.case_study_id, 0) + 1
            picked.append(m)
    return Response(GalaxyItemSerializer(balanced(picked), many=True, context={"request": request}).data)


@api_view(["GET"])
@permission_classes(PUBLIC)
@throttle_classes([])
def tech(request):
    return Response(TechSerializer(Tech.objects.all(), many=True).data)


@api_view(["GET"])
@permission_classes(PUBLIC)
@throttle_classes([])
def testimonials(request):
    qs = Testimonial.objects.filter(approved=True).select_related("case_study")
    return Response(TestimonialSerializer(qs, many=True, context={"request": request}).data)


@api_view(["GET"])
@permission_classes(PUBLIC)
@throttle_classes([])
def faqs(request):
    return Response(FAQSerializer(FAQ.objects.all(), many=True, context={"request": request}).data)


@api_view(["GET"])
@permission_classes(PUBLIC)
@throttle_classes([])
def credentials(request):
    return Response(CredentialSerializer(Credential.objects.all(), many=True).data)


@api_view(["GET"])
@permission_classes(PUBLIC)
@throttle_classes([])
def plans(request):
    qs = CarePlan.objects.filter(active=True)
    return Response(CarePlanSerializer(qs, many=True, context={"request": request}).data)


@api_view(["GET"])
@permission_classes(PUBLIC)
@throttle_classes([])
def pricing(request):
    """Calculator factors for one service (or the shared ones)."""
    service = Service.objects.filter(slug=request.query_params.get("service", ""), active=True).first()
    return Response(PricingFactorSerializer(factors_for(service), many=True, context={"request": request}).data)


@api_view(["POST"])
@permission_classes(PUBLIC)
def estimate(request):
    body = EstimateRequestSerializer(data=request.data)
    body.is_valid(raise_exception=True)
    data = body.validated_data
    service = Service.objects.filter(slug=data.get("service") or "", active=True).first()
    result = compute_estimate(service, data["currency"], data.get("plan") or None, data.get("choices") or {})
    return Response({"currency": result.currency, "low": result.low, "high": result.high,
                     "choices": result.choices, "plan": result.plan, "converted": result.converted})
