"""
The studio dashboard (developer only): one read of the business at a glance,
the client list, the payments to look at, and the settings Younes changes
without opening the Django admin (contact, availability, payment details,
starting prices).

Every change made here is written to the audit log by field name only: the
values themselves (an account number, an address) stay out of the log.
"""

from datetime import timedelta

from django.db.models import Count, Q, Sum
from django.utils import timezone
from rest_framework import serializers
from rest_framework.decorators import api_view, permission_classes
from rest_framework.response import Response

from accounts.models import User
from accounts.permissions import IsDeveloper
from audit.models import AuditLog
from audit.service import record
from billing.models import Charge, Payment, PaymentProof
from content.models import Service, ServicePrice, SiteSettings
from engagements.capacity import status as capacity
from engagements.models import Engagement, ProjectRequest, WaitlistEntry
from reviews.models import Review

STUDIO = [IsDeveloper]
QUIET = ("attachment.downloaded", "receipt.downloaded")


def _per_currency(rows) -> dict[str, int]:
    return {r["currency"]: r["total"] or 0 for r in rows}


@api_view(["GET"])
@permission_classes(STUDIO)
def overview(request):
    now = timezone.now()
    week, month = now - timedelta(days=7), now - timedelta(days=30)
    clients = User.objects.filter(role=User.Role.CLIENT, is_staff=False, is_active=True)
    requests = ProjectRequest.objects.exclude(status=ProjectRequest.Status.DRAFT)
    paid = Payment.objects.filter(status=Payment.Status.PAID)

    by_status = dict(requests.values_list("status").annotate(n=Count("id")).values_list("status", "n"))
    projects = dict(Engagement.objects.values_list("status").annotate(n=Count("id")).values_list("status", "n"))
    by_service = list(
        requests.values("service__slug", "service__title_en").annotate(n=Count("id")).order_by("-n")[:8]
    )
    sources = list(
        clients.exclude(heard_from="").values("heard_from").annotate(n=Count("id")).order_by("-n")
    )
    # File downloads are noise here; everything else is the studio's pulse.
    activity = (AuditLog.objects.select_related("actor").exclude(action__in=QUIET)
                .order_by("-created_at")[:20])

    return Response({
        "clients": {
            "total": clients.count(),
            "week": clients.filter(date_joined__gte=week).count(),
            "month": clients.filter(date_joined__gte=month).count(),
            "verified": clients.filter(email_verified_at__isnull=False).count(),
            "sources": [{"key": s["heard_from"], "label": User.HeardFrom(s["heard_from"]).label, "n": s["n"]} for s in sources],
        },
        "requests": {
            "total": requests.count(),
            "open": requests.filter(status__in=ProjectRequest.OPEN_STATUSES).count(),
            "new": by_status.get(ProjectRequest.Status.SUBMITTED, 0),
            "week": requests.filter(created_at__gte=week).count(),
            "drafts": ProjectRequest.objects.filter(status=ProjectRequest.Status.DRAFT).count(),
            "by_status": by_status,
            "by_service": [{"slug": r["service__slug"] or "", "title": r["service__title_en"] or "", "n": r["n"]} for r in by_service],
        },
        "projects": {"by_status": projects, **capacity()},
        "money": {
            "month": _per_currency(paid.filter(paid_at__gte=month).values("currency").annotate(total=Sum("amount"))),
            "all_time": _per_currency(paid.values("currency").annotate(total=Sum("amount"))),
            "due": _per_currency(Charge.objects.filter(status=Charge.Status.DUE).values("currency").annotate(total=Sum("amount"))),
            "proofs_pending": PaymentProof.objects.filter(status=PaymentProof.Status.PENDING).count(),
        },
        "reviews_pending": Review.objects.filter(status=Review.Status.PENDING).count(),
        "waitlist": WaitlistEntry.objects.filter(notified_at__isnull=True).count(),
        "activity": [
            {"at": a.created_at, "action": a.action, "label": a.target_label, "actor": a.actor.full_name if a.actor else "",
             "target_type": a.target_type, "target_id": a.target_id}
            for a in activity
        ],
    })


class ClientRowSerializer(serializers.ModelSerializer):
    requests = serializers.IntegerField()
    projects = serializers.IntegerField()
    heard_from_label = serializers.CharField(source="get_heard_from_display")
    contact_channel_label = serializers.CharField(source="get_contact_channel_display")
    verified = serializers.SerializerMethodField()

    class Meta:
        model = User
        fields = ("id", "full_name", "email", "company", "phone", "whatsapp", "country", "language", "currency",
                  "date_joined", "last_login", "verified", "heard_from_label", "heard_from_detail",
                  "contact_channel_label", "contact_handle", "requests", "projects")

    def get_verified(self, obj) -> bool:
        return obj.email_verified_at is not None


PAGE = 50


@api_view(["GET"])
@permission_classes(STUDIO)
def clients(request):
    qs = User.objects.filter(role=User.Role.CLIENT, is_staff=False, is_active=True).annotate(
        requests=Count("project_requests", filter=~Q(project_requests__status=ProjectRequest.Status.DRAFT), distinct=True),
        projects=Count("engagements", distinct=True),
    ).order_by("-date_joined")
    q = request.query_params.get("q", "").strip()
    if q:
        qs = qs.filter(Q(full_name__icontains=q) | Q(email__icontains=q) | Q(company__icontains=q) | Q(phone__icontains=q))
    try:
        page = max(1, int(request.query_params.get("page", 1)))
    except ValueError:
        page = 1
    total = qs.count()
    rows = qs[(page - 1) * PAGE: page * PAGE]
    return Response({"count": total, "page": page, "pages": max(1, -(-total // PAGE)),
                     "results": ClientRowSerializer(rows, many=True).data})


def _charge_row(charge: Charge) -> dict:
    eng = charge.engagement
    return {"id": charge.id, "label": charge.label, "amount": charge.amount, "currency": charge.currency,
            "status": charge.status, "due_at": charge.due_at, "reference": eng.request.reference,
            "project": eng.title, "client": eng.client.full_name}


@api_view(["GET"])
@permission_classes(STUDIO)
def payments(request):
    proofs = (PaymentProof.objects.filter(status=PaymentProof.Status.PENDING)
              .select_related("charge__engagement__request", "client").order_by("created_at"))
    due = (Charge.objects.filter(status=Charge.Status.DUE)
           .select_related("engagement__request", "engagement__client").order_by("due_at"))
    recent = (Payment.objects.filter(status=Payment.Status.PAID)
              .select_related("charge__engagement__request", "charge__engagement__client").order_by("-paid_at")[:30])
    return Response({
        "proofs": [{
            "id": p.id, "method": p.get_method_display(), "submitted_at": p.created_at, "payer_name": p.payer_name,
            "transfer_reference": p.transfer_reference, "has_receipt": bool(p.receipt), "client": p.client.full_name,
            **{k: v for k, v in _charge_row(p.charge).items() if k in ("amount", "currency", "label", "reference", "project")},
        } for p in proofs],
        "due": [_charge_row(c) for c in due],
        "recent": [{
            "id": p.id, "provider": p.get_provider_display(), "amount": p.amount, "currency": p.currency, "paid_at": p.paid_at,
            "reference": p.charge.engagement.request.reference, "project": p.charge.engagement.title,
            "client": p.charge.engagement.client.full_name, "label": p.charge.label,
        } for p in recent],
    })


class StudioSettingsSerializer(serializers.ModelSerializer):
    """What Younes edits from the studio. Files stay in the Django admin."""

    class Meta:
        model = SiteSettings
        fields = (
            "is_available", "max_active_projects", "available_from", "availability_en", "availability_fr",
            "email", "phone", "whatsapp", "discord_username", "github_url", "linkedin_url", "x_url",
            "instagram_url", "upwork_url", "location_en", "location_fr", "about_en", "about_fr",
            "years_experience", "projects_shipped", "reply_hours",
            "ccp_account", "ccp_key", "ccp_holder", "ccp_address", "baridimob_rip", "cash_note_en", "cash_note_fr",
            "usdt_bep20_address", "usdt_rate_override",
        )

    def validate_ccp_account(self, value):
        if value and not value.replace(" ", "").isdigit():
            raise serializers.ValidationError("Digits only.")
        return value.replace(" ", "")

    def validate_ccp_key(self, value):
        if value and not value.isdigit():
            raise serializers.ValidationError("Digits only.")
        return value

    def validate_baridimob_rip(self, value):
        digits = value.replace(" ", "")
        if digits and (not digits.isdigit() or len(digits) != 20):
            raise serializers.ValidationError("A RIP has 20 digits.")
        return digits

    def validate_usdt_bep20_address(self, value):
        value = value.strip()
        if value and not (value.startswith("0x") and len(value) == 42):
            raise serializers.ValidationError("A BEP20 address starts with 0x and has 42 characters.")
        return value


@api_view(["GET", "PATCH"])
@permission_classes(STUDIO)
def site_settings(request):
    site = SiteSettings.load()
    if request.method == "PATCH":
        body = StudioSettingsSerializer(site, data=request.data, partial=True)
        body.is_valid(raise_exception=True)
        changed = sorted(k for k, v in body.validated_data.items() if getattr(site, k) != v)
        body.save()
        if changed:
            # Field names only: account numbers and addresses stay out of the log.
            record(request, "studio.settings_changed", site, fields=changed)
    return Response(StudioSettingsSerializer(site).data)


def _service_rows():
    rows = []
    for s in Service.objects.prefetch_related("prices").order_by("order", "id"):
        dzd = next((p for p in s.prices.all() if p.currency == "DZD"), None)
        rows.append({"slug": s.slug, "title": s.title_en, "title_fr": s.title_fr, "active": s.active,
                     "amount": dzd.amount if dzd else None, "kind": dzd.kind if dzd else ServicePrice.Kind.FROM})
    return rows


class PriceSerializer(serializers.Serializer):
    slug = serializers.SlugField()
    amount = serializers.IntegerField(min_value=0, max_value=100_000_000, allow_null=True, required=False)
    kind = serializers.ChoiceField(choices=ServicePrice.Kind.choices, required=False)
    active = serializers.BooleanField(required=False)


@api_view(["GET", "PATCH"])
@permission_classes(STUDIO)
def prices(request):
    """Starting prices in DZD (other currencies follow the live rate) and which services are listed."""
    if request.method == "PATCH":
        body = PriceSerializer(data=request.data)
        body.is_valid(raise_exception=True)
        data = body.validated_data
        service = Service.objects.filter(slug=data["slug"]).first()
        if not service:
            return Response({"slug": ["Unknown service."]}, status=400)
        if "active" in data and data["active"] != service.active:
            service.active = data["active"]
            service.save(update_fields=["active"])
        if "amount" in data:
            rows = ServicePrice.objects.filter(service=service, currency="DZD")
            if data["amount"] is None:
                rows.delete()  # quoted per project
            else:
                kind = data.get("kind") or (rows.first().kind if rows.exists() else ServicePrice.Kind.FROM)
                rows.exclude(kind=kind).delete()
                ServicePrice.objects.update_or_create(service=service, currency="DZD", kind=kind,
                                                      defaults={"amount": data["amount"]})
        record(request, "studio.price_changed", service, **{k: v for k, v in data.items() if k != "slug"})
    return Response(_service_rows())
