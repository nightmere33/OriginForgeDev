from rest_framework import permissions
from rest_framework.decorators import api_view, permission_classes, throttle_classes
from rest_framework.exceptions import ValidationError
from rest_framework.response import Response
from rest_framework.throttling import SimpleRateThrottle

from .engine import answer


class AskThrottle(SimpleRateThrottle):
    """Per person when signed in, per address otherwise."""

    scope = "assistant"

    def get_cache_key(self, request, view):
        ident = request.user.pk if request.user and request.user.is_authenticated else self.get_ident(request)
        return self.cache_format % {"scope": self.scope, "ident": ident}


@api_view(["POST"])
@permission_classes([permissions.AllowAny])
@throttle_classes([AskThrottle])
def ask(request):
    question = str(request.data.get("question", "")).strip()
    if len(question) < 2:
        raise ValidationError({"question": "Ask a question."})
    history = request.data.get("history") if isinstance(request.data.get("history"), list) else []
    lang = str(request.data.get("lang", "en"))[:2]
    return Response(answer(question, lang, [h for h in history if isinstance(h, dict)]))
