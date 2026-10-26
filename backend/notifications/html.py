"""
The branded HTML twin of every plain-text e-mail.

E-mail clients ignore stylesheets and most modern CSS, so this is one table
with inline styles: a dark wordmark band, the message on paper, one ember
button for the first link, and a quiet footer. The plain-text body stays the
source of truth (it is sent alongside as the text part).
"""

import html
import re

from django.conf import settings

URL = re.compile(r"(https?://[^\s<>\"]+)")

BG = "#f1efea"
PAPER = "#fbfaf7"
INK = "#1c1d20"
MUTED = "#4a4d53"
LINE = "#e2e0da"
EMBER = "#ff6a1a"
DARK = "#0c0c0d"

FOOTER = {
    "en": "You are receiving this because of your account or project at OriginForge.",
    "fr": "Vous recevez ce message en raison de votre compte ou de votre projet chez OriginForge.",
}
BUTTON = {"en": "Open", "fr": "Ouvrir"}


def _paragraphs(text: str) -> str:
    out = []
    for block in [b for b in text.strip().split("\n\n") if b.strip()]:
        safe = html.escape(block).replace("\n", "<br>")
        safe = URL.sub(lambda m: f'<a href="{m.group(1)}" style="color:{EMBER};word-break:break-all">{m.group(1)}</a>', safe)
        out.append(f'<p style="margin:0 0 16px;font:16px/1.6 -apple-system,Segoe UI,Roboto,Arial,sans-serif;color:{INK}">{safe}</p>')
    return "".join(out)


def render_html(subject: str, body: str, lang: str = "en") -> str:
    lang = lang if lang in FOOTER else "en"
    link = URL.search(body)
    button = ""
    if link:
        url = link.group(1)
        button = (
            f'<table role="presentation" cellpadding="0" cellspacing="0" style="margin:8px 0 24px"><tr>'
            f'<td style="background:{EMBER}"><a href="{url}" style="display:inline-block;padding:14px 24px;'
            f'font:700 12px/1 ui-monospace,Menlo,Consolas,monospace;letter-spacing:.14em;text-transform:uppercase;'
            f'color:{DARK};text-decoration:none">{BUTTON[lang]} &rarr;</a></td></tr></table>'
        )
    site = settings.SITE_URL
    return f"""<!doctype html>
<html lang="{lang}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light"><title>{html.escape(subject)}</title></head>
<body style="margin:0;padding:0;background:{BG}">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:{BG}"><tr><td align="center" style="padding:32px 16px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;border:1px solid {LINE};background:{PAPER}">
<tr><td style="background:{DARK};padding:20px 28px">
<span style="font:800 18px/1 Arial Black,Arial,sans-serif;letter-spacing:.04em;color:#ececee">ORIGINFORGE</span>
<span style="font:500 11px/1 ui-monospace,Menlo,Consolas,monospace;letter-spacing:.15em;color:{EMBER};padding-left:12px">YOUNES OUALI</span>
</td></tr>
<tr><td style="padding:32px 28px 8px">
<h1 style="margin:0 0 20px;font:700 22px/1.3 -apple-system,Segoe UI,Roboto,Arial,sans-serif;color:{INK}">{html.escape(subject)}</h1>
{_paragraphs(body)}
{button}
</td></tr>
<tr><td style="border-top:1px solid {LINE};padding:16px 28px 24px">
<p style="margin:0;font:12px/1.6 -apple-system,Segoe UI,Roboto,Arial,sans-serif;color:{MUTED}">{FOOTER[lang]}
<a href="{site}" style="color:{MUTED}">{site.replace("https://", "").replace("http://", "")}</a></p>
</td></tr></table></td></tr></table></body></html>"""
