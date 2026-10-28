"""
Invoices: one per paid payment, numbered OF-<year>-<0001> with no gap.

The number is taken inside the transaction that marks the charge paid, so a
payment that rolls back never burns a number. The PDF is drawn later, the
first time it is needed (the e-mail that carries it, or a download), and kept.
"""

from io import BytesIO

from django.core.files.base import ContentFile
from django.utils import timezone

from content.models import SiteSettings
from engagements.contract import money
from notifications.service import user_lang

from .models import Charge, Invoice, InvoiceSequence, Payment


def _next_number(year: int) -> str:
    seq, _ = InvoiceSequence.objects.get_or_create(year=year)
    seq = InvoiceSequence.objects.select_for_update().get(pk=seq.pk)
    seq.last += 1
    seq.save(update_fields=["last"])
    return f"OF-{year}-{seq.last:04d}"


def seller() -> dict:
    s = SiteSettings.load()
    return {
        "name": s.seller_name or "Younes Ouali",
        "address": s.seller_address,
        "tax_ids": [line.strip() for line in s.seller_tax_ids.splitlines() if line.strip()],
        "email": s.email,
        "phone": s.phone,
        "note_en": s.invoice_note_en,
        "note_fr": s.invoice_note_fr,
    }


def buyer(user) -> dict:
    place = " ".join(x for x in (user.postal_code, user.city) if x)
    return {
        "name": user.full_name,
        "company": user.company,
        "email": user.email,
        "phone": user.phone,
        "address": ", ".join(x for x in (user.address, place, user.country) if x),
    }


METHODS_FR = {
    Payment.Provider.CASH: "Espèces", Payment.Provider.CCP: "Virement CCP", Payment.Provider.CHARGILY: "Carte (Chargily)",
}


def issue(charge: Charge, payment: Payment) -> Invoice:
    """Called with the charge locked, in the transaction that marks it paid."""
    existing = Invoice.objects.filter(payment=payment).first()
    if existing:
        return existing
    eng = charge.engagement
    client = eng.client
    lang = user_lang(client)
    now = payment.paid_at or timezone.now()
    method = METHODS_FR.get(payment.provider) if lang == "fr" else None
    return Invoice.objects.create(
        number=_next_number(now.year), payment=payment, charge=charge, issued_at=now,
        label=f"{eng.title} · {charge.label}", description=charge.description, amount=charge.amount,
        currency=charge.currency, method=method or payment.get_provider_display(), language=lang,
        seller=seller(), buyer=buyer(client),
    )


# ── The PDF ────────────────────────────────────────────────────────────────

WORDS = {
    "en": {
        "invoice": "Invoice", "number": "Number", "date": "Date", "project": "Project", "from": "From", "to": "Billed to",
        "item": "Description", "amount": "Amount", "total": "Total", "paid": "Paid", "paid_on": "Paid on {date} by {method}.",
        "thanks": "Thank you for your trust.", "page": "originforgedev.com",
    },
    "fr": {
        "invoice": "Facture", "number": "Numéro", "date": "Date", "project": "Projet", "from": "Émetteur", "to": "Facturé à",
        "item": "Désignation", "amount": "Montant", "total": "Total", "paid": "Payée", "paid_on": "Payée le {date} par {method}.",
        "thanks": "Merci pour votre confiance.", "page": "originforgedev.com",
    },
}


def _date(value, lang: str) -> str:
    return value.strftime("%d/%m/%Y" if lang == "fr" else "%d %b %Y")


def render_pdf(invoice: Invoice) -> bytes:
    """An A4 sheet: letterhead, parties, one line, the total, and the paid stamp."""
    from reportlab.lib.colors import HexColor
    from reportlab.lib.pagesizes import A4
    from reportlab.lib.units import mm
    from reportlab.pdfgen.canvas import Canvas

    lang = invoice.language if invoice.language in WORDS else "en"
    w = WORDS[lang]
    ink, muted, line, ember = HexColor("#111113"), HexColor("#6B6E75"), HexColor("#D9DADD"), HexColor("#E2560F")
    buf = BytesIO()
    page_w, page_h = A4
    left, right = 20 * mm, page_w - 20 * mm
    c = Canvas(buf, pagesize=A4)
    c.setTitle(f"{w['invoice']} {invoice.number}")
    c.setAuthor(invoice.seller.get("name", ""))

    # Letterhead
    y = page_h - 24 * mm
    c.setFillColor(ink)
    c.setFont("Helvetica-Bold", 18)
    c.drawString(left, y, "ORIGINFORGE")
    c.setFont("Helvetica", 9)
    c.setFillColor(muted)
    c.drawString(left, y - 6 * mm, "Younes Ouali · Full-stack developer")
    c.setFillColor(ink)
    c.setFont("Helvetica-Bold", 22)
    c.drawRightString(right, y, w["invoice"].upper())
    c.setFont("Helvetica", 9)
    c.setFillColor(muted)
    c.drawRightString(right, y - 6 * mm, f"{w['number']}  {invoice.number}")
    c.drawRightString(right, y - 11 * mm, f"{w['date']}  {_date(invoice.issued_at, lang)}")
    c.setStrokeColor(line)
    c.setLineWidth(0.6)
    c.line(left, y - 16 * mm, right, y - 16 * mm)

    # Parties
    def block(x, top, title, rows):
        c.setFont("Helvetica-Bold", 8)
        c.setFillColor(muted)
        c.drawString(x, top, title.upper())
        c.setFillColor(ink)
        yy = top - 5.5 * mm
        for i, row in enumerate(r for r in rows if r):
            c.setFont("Helvetica-Bold" if i == 0 else "Helvetica", 10 if i == 0 else 9)
            for part in str(row).splitlines():
                c.drawString(x, yy, part[:70])
                yy -= 4.8 * mm
        return yy

    s, b = invoice.seller, invoice.buyer
    top = y - 26 * mm
    end_a = block(left, top, w["from"], [s.get("name"), s.get("address"), *s.get("tax_ids", []), s.get("email"), s.get("phone")])
    end_b = block(page_w / 2 + 5 * mm, top, w["to"], [b.get("name"), b.get("company"), b.get("address"), b.get("email"), b.get("phone")])

    # The line and the total
    y = min(end_a, end_b) - 10 * mm
    c.setFillColor(HexColor("#F4F4F5"))
    c.rect(left, y - 2.5 * mm, right - left, 8 * mm, stroke=0, fill=1)
    c.setFillColor(muted)
    c.setFont("Helvetica-Bold", 8)
    c.drawString(left + 3 * mm, y, w["item"].upper())
    c.drawRightString(right - 3 * mm, y, w["amount"].upper())
    y -= 11 * mm
    c.setFillColor(ink)
    c.setFont("Helvetica-Bold", 10)
    c.drawString(left + 3 * mm, y, invoice.label[:80])
    c.drawRightString(right - 3 * mm, y, money(invoice.amount, invoice.currency))
    c.setFont("Helvetica", 9)
    c.setFillColor(muted)
    ref = invoice.charge.engagement.request.reference
    c.drawString(left + 3 * mm, y - 5 * mm, f"{w['project']} {ref}")
    yy = y - 10 * mm
    for part in (invoice.description or "").splitlines()[:6]:
        c.drawString(left + 3 * mm, yy, part[:95])
        yy -= 4.6 * mm
    y = yy - 4 * mm
    c.setStrokeColor(line)
    c.line(left, y, right, y)
    y -= 9 * mm
    c.setFillColor(ink)
    c.setFont("Helvetica-Bold", 12)
    c.drawString(page_w / 2 + 5 * mm, y, w["total"])
    c.drawRightString(right - 3 * mm, y, money(invoice.amount, invoice.currency))

    # Paid stamp
    c.saveState()
    c.translate(left + 28 * mm, y + 1 * mm)
    c.rotate(8)
    c.setStrokeColor(ember)
    c.setFillColor(ember)
    c.setLineWidth(1.4)
    c.roundRect(-24 * mm, -6 * mm, 48 * mm, 12 * mm, 2 * mm, stroke=1, fill=0)
    c.setFont("Helvetica-Bold", 14)
    c.drawCentredString(0, -2 * mm, w["paid"].upper())
    c.restoreState()
    c.setFont("Helvetica", 9)
    c.setFillColor(muted)
    c.drawString(left, y - 14 * mm, w["paid_on"].format(date=_date(invoice.payment.paid_at or invoice.issued_at, lang), method=invoice.method))

    # Foot
    note = s.get(f"note_{lang}") or s.get("note_en") or ""
    c.setStrokeColor(line)
    c.line(left, 28 * mm, right, 28 * mm)
    c.setFont("Helvetica", 8)
    if note:
        c.drawString(left, 22 * mm, note[:140])
    c.drawString(left, 17 * mm, w["thanks"])
    c.drawRightString(right, 17 * mm, w["page"])
    c.showPage()
    c.save()
    return buf.getvalue()


def ensure_pdf(invoice: Invoice) -> Invoice:
    if not invoice.pdf:
        invoice.pdf.save(f"{invoice.number}.pdf", ContentFile(render_pdf(invoice)), save=False)
        Invoice.objects.filter(pk=invoice.pk).update(pdf=invoice.pdf.name)
    return invoice
