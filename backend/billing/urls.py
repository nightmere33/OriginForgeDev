from django.urls import path
from rest_framework.routers import SimpleRouter

from . import api

router = SimpleRouter()
router.register("charges", api.ChargeViewSet, basename="charge")
router.register("proofs", api.ProofViewSet, basename="proof")

urlpatterns = router.urls + [
    path("files/receipts/<int:pk>/", api.download_receipt),
    path("payments/instructions/", api.instructions),
]
