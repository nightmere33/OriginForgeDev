from django.urls import path
from rest_framework.routers import SimpleRouter

from . import api, webhooks

router = SimpleRouter()
router.register("charges", api.ChargeViewSet, basename="charge")
router.register("proofs", api.ProofViewSet, basename="proof")
router.register("invoices", api.InvoiceViewSet, basename="invoice")

urlpatterns = router.urls + [
    path("files/receipts/<int:pk>/", api.download_receipt),
    path("payments/instructions/", api.instructions),
    path("payments/<int:pk>/", api.payment_state),
    path("payments/<int:pk>/approved/", api.payment_approved),
    path("payments/paypal/return/", webhooks.paypal_return),
    path("payments/paypal/cancel/", webhooks.paypal_cancel),
]
