from django.core.exceptions import ValidationError as DjangoValidationError
from django.shortcuts import get_object_or_404
from rest_framework import mixins, serializers, status, viewsets
from rest_framework.decorators import action, api_view
from rest_framework.exceptions import NotFound, PermissionDenied, ValidationError
from rest_framework.parsers import FormParser, JSONParser, MultiPartParser
from rest_framework.response import Response

from accounts.permissions import IsDeveloper
from audit.service import record
from common.files import serve_private, validate_upload
from common.i18n import pick, request_lang
from content.models import SiteSettings
from engagements import lifecycle
from fx import service as fx
from engagements.lifecycle_serializers import ChargeSerializer, ProofSerializer

from . import online, paypal
from .models import Charge, Payment, PaymentProof


class ChargeViewSet(mixins.RetrieveModelMixin, viewsets.GenericViewSet):
    serializer_class = ChargeSerializer

    def get_queryset(self):
        qs = Charge.objects.select_related("engagement__request").prefetch_related("proofs", "payments")
        return qs if self.request.user.is_developer else qs.filter(engagement__client=self.request.user)

    def get_throttles(self):
        self.throttle_scope = "upload" if self.action in ("proofs", "checkout") else None
        return super().get_throttles()

    @action(detail=True, methods=["post"])
    def checkout(self, request, pk=None):
        """Client: open the card page (Chargily) or a PayPal order for this payment."""
        payment = online.start(request, self.get_object().pk, str(request.data.get("provider", "")))
        return Response(PaymentStateSerializer(payment).data | {"url": payment.checkout_url, "order_id": payment.provider_ref},
                        status=status.HTTP_201_CREATED)

    @action(detail=True, methods=["post"], parser_classes=[MultiPartParser, FormParser, JSONParser])
    def proofs(self, request, pk=None):
        """Client: 'I paid' with a receipt photo/PDF (not needed for cash handed over)."""
        charge = self.get_object()
        upload = request.FILES.get("receipt")
        name = ""
        if upload is not None:
            try:
                name = validate_upload(upload)
            except DjangoValidationError as exc:
                raise ValidationError({"receipt": exc.messages})
        method = request.data.get("method", "")
        if method not in PaymentProof.Method.values:
            raise ValidationError({"method": "Choose how you paid."})
        proof = lifecycle.submit_proof(
            request, charge.pk, method, upload=upload, upload_name=name,
            payer_name=(request.data.get("payer_name") or "")[:120],
            transfer_reference=(request.data.get("transfer_reference") or "")[:60],
            tx_hash=(request.data.get("tx_hash") or "")[:80],
            note=(request.data.get("note") or "")[:500],
        )
        return Response(ProofSerializer(proof).data, status=status.HTTP_201_CREATED)

    @action(detail=True, methods=["post"], permission_classes=[IsDeveloper])
    def cash(self, request, pk=None):
        return Response(ChargeSerializer(lifecycle.record_cash(request, self.get_object().pk)).data)

    @action(detail=True, methods=["post"], url_path="request", permission_classes=[IsDeveloper])
    def request_payment(self, request, pk=None):
        return Response(ChargeSerializer(lifecycle.request_charge(request, self.get_object().pk)).data)


class ProofViewSet(mixins.ListModelMixin, viewsets.GenericViewSet):
    """Studio: receipts waiting to be checked."""

    serializer_class = ProofSerializer
    permission_classes = [IsDeveloper]

    def get_queryset(self):
        qs = PaymentProof.objects.select_related("charge__engagement__request", "client")
        state = self.request.query_params.get("status", PaymentProof.Status.PENDING)
        return qs.filter(status=state) if state != "all" else qs

    @action(detail=True, methods=["post"])
    def review(self, request, pk=None):
        approve = request.data.get("decision") == "approve"
        proof = lifecycle.review_proof(request, get_object_or_404(PaymentProof, pk=pk).pk, approve, request.data.get("note", ""))
        return Response(ProofSerializer(proof).data)


class PaymentStateSerializer(serializers.ModelSerializer):
    charge_status = serializers.CharField(source="charge.status", read_only=True)

    class Meta:
        model = Payment
        fields = ("id", "provider", "status", "amount", "currency", "provider_amount", "provider_currency", "detail",
                  "created_at", "paid_at", "charge", "charge_status")


def _own_payment(request, pk) -> Payment:
    payment = get_object_or_404(Payment.objects.select_related("charge__engagement"), pk=pk, provider__in=online.ONLINE)
    if not (request.user.is_developer or payment.charge.engagement.client_id == request.user.id):
        raise NotFound()
    return payment


@api_view(["GET"])
def payment_state(request, pk):
    """The return page follows a payment; a late notice is chased with the provider."""
    payment = online.reconcile(_own_payment(request, pk))
    payment.charge.refresh_from_db(fields=["status"])
    return Response(PaymentStateSerializer(payment).data)


@api_view(["POST"])
def payment_approved(request, pk):
    """The PayPal popup closed on an approval: capture now (the notice would too, a little later)."""
    payment = _own_payment(request, pk)
    if payment.provider == Payment.Provider.PAYPAL and payment.status == Payment.Status.PENDING:
        try:
            online.from_paypal(paypal.get_order(payment.provider_ref))
        except paypal.PayPalError:
            pass  # still pending: the page keeps following it
        payment.refresh_from_db()
        payment.charge.refresh_from_db(fields=["status"])
    return Response(PaymentStateSerializer(payment).data)


@api_view(["GET"])
def download_receipt(request, pk):
    proof = get_object_or_404(PaymentProof.objects.select_related("charge__engagement"), pk=pk)
    if not (request.user.is_developer or proof.client_id == request.user.id) or not proof.receipt:
        return Response(status=status.HTTP_404_NOT_FOUND)
    record(request, "receipt.downloaded", proof.charge.engagement.request, proof=proof.pk)
    return serve_private(proof.receipt, proof.receipt_name or "receipt")


@api_view(["GET"])
def instructions(request):
    """CCP / BaridiMob / cash details. Only for someone who actually has something to pay."""
    if not (request.user.is_developer or Charge.objects.filter(engagement__client=request.user, status=Charge.Status.DUE).exists()):
        raise PermissionDenied()
    s = SiteSettings.load()
    rates = fx.current()
    return Response({
        "ccp_account": s.ccp_account, "ccp_key": s.ccp_key, "ccp_holder": s.ccp_holder,
        "ccp_address": s.ccp_address, "baridimob_rip": s.baridimob_rip,
        "cash_note": pick(s, "cash_note", request_lang(request)),
        "usdt_address": s.usdt_bep20_address, "usdt_network": "BEP20 (BNB Smart Chain)",
        "usdt_rate": float(rates["USDT"]), **{f"rate_{k}": v for k, v in fx.status().items()},
    })
