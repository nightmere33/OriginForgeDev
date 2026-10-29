"""
Numbers saved before the phone field took a country were Algerian national
digits ("0555 12 34 56"). The forms now expect international format, so those
are rewritten as "+213555123456"; anything else is left as it was.
"""

import re

from django.db import migrations

LOCAL_DZ = re.compile(r"^0([5-7]\d{8})$")


def to_e164(value: str) -> str:
    digits = re.sub(r"[\s.\-()]", "", value or "")
    match = LOCAL_DZ.match(digits)
    return f"+213{match.group(1)}" if match else value


def forwards(apps, schema_editor):
    User = apps.get_model("accounts", "User")
    for user in User.objects.exclude(phone="", whatsapp="").only("pk", "phone", "whatsapp"):
        phone, whatsapp = to_e164(user.phone), to_e164(user.whatsapp)
        if (phone, whatsapp) != (user.phone, user.whatsapp):
            User.objects.filter(pk=user.pk).update(phone=phone, whatsapp=whatsapp)


class Migration(migrations.Migration):
    dependencies = [("accounts", "0007_country_code_handle")]

    operations = [migrations.RunPython(forwards, migrations.RunPython.noop)]
