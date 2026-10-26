from rest_framework.decorators import api_view, permission_classes, throttle_classes
from rest_framework.permissions import AllowAny
from rest_framework.response import Response

from .service import current, status


@api_view(["GET"])
@permission_classes([AllowAny])
@throttle_classes([])
def rates(request):
    """DZD per unit of each currency, for display conversions and USDT payments."""
    return Response({"base": "DZD", "rates": {k: float(v) for k, v in current().items()}, **status()})
