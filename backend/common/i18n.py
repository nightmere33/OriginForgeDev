from django.conf import settings
from rest_framework import serializers


def request_lang(request) -> str:
    lang = (request.query_params.get("lang") if request is not None else None) or "en"
    return lang if lang in settings.ENABLED_LANGUAGES else "en"


def pick(obj, field: str, lang: str) -> str:
    """`field_<lang>`, falling back to English when the translation is empty."""
    return getattr(obj, f"{field}_{lang}", "") or getattr(obj, f"{field}_en", "")


class TranslatedSerializer(serializers.ModelSerializer):
    """
    Declare `translated = ("title", "summary")`: each name becomes one output
    field resolved for `?lang=`, replacing the raw `_en/_fr/_ar` columns.
    """

    translated: tuple[str, ...] = ()

    def to_representation(self, instance):
        data = super().to_representation(instance)
        lang = request_lang(self.context.get("request"))
        for field in self.translated:
            data[field] = pick(instance, field, lang)
        return data


def lines(text: str) -> list[str]:
    return [line.strip() for line in (text or "").splitlines() if line.strip()]
