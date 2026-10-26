"""
Development only: a demo client and a demo studio account, with requests at
five points of the lifecycle, so every screen of the portal and the studio can
be opened with real data. Re-running replaces the demo requests.

    manage.py seed_demo

The password is read from DEMO_PASSWORD in backend/.env (generated there on
the first run). Refuses to run when DEBUG is off.
"""

import io
import secrets
from datetime import timedelta
from pathlib import Path

from django.conf import settings
from django.core.files.uploadedfile import SimpleUploadedFile
from django.core.management.base import BaseCommand, CommandError
from django.test import RequestFactory
from django.utils import timezone
from PIL import Image, ImageDraw

from accounts.models import User
from content.models import CarePlan, Service
from engagements import lifecycle
from billing.models import Charge, Payment, PaymentProof
from engagements.models import Contract, Engagement, Message, ProgressUpdate, ProjectRequest, Proposal, Task
from engagements.api import store_upload
from reviews.models import Review

CLIENT, STUDIO = "demo-client@originforge.test", "demo-studio@originforge.test"


def password() -> str:
    import os

    if os.environ.get("DEMO_PASSWORD"):
        return os.environ["DEMO_PASSWORD"]
    value = secrets.token_urlsafe(12)
    env = Path(settings.BASE_DIR) / ".env"
    with env.open("a", encoding="utf-8") as f:
        f.write(f"\n# Demo accounts ({CLIENT}, {STUDIO}), development only\nDEMO_PASSWORD={value}\n")
    return value


def as_user(user):
    request = RequestFactory().post("/", HTTP_USER_AGENT="seed_demo")
    request.user = user
    return request


def screenshot(label: str, accent: str) -> SimpleUploadedFile:
    img = Image.new("RGB", (1280, 720), "#0b0b0d")
    draw = ImageDraw.Draw(img)
    draw.rectangle((64, 64, 1216, 656), outline="#3a3a40", width=2)
    draw.rectangle((64, 64, 1216, 120), fill="#16161a")
    draw.rectangle((96, 180, 700, 230), fill=accent)
    for i in range(5):
        draw.rectangle((96, 280 + i * 60, 1000 - i * 90, 300 + i * 60), fill="#2a2a30")
    draw.text((96, 84), label, fill="#ececee")
    buf = io.BytesIO()
    img.save(buf, "PNG")
    return SimpleUploadedFile(f"{label.lower().replace(' ', '-')}.png", buf.getvalue(), content_type="image/png")


class Command(BaseCommand):
    help = "Development only: demo accounts and requests at each lifecycle stage."

    @staticmethod
    def wipe(client):
        """Remove earlier demo records. Contracts and payments are protected on
        purpose (they are proof), so the demo deletes its own in dependency order."""
        reqs = ProjectRequest.objects.filter(client=client)
        Payment.objects.filter(charge__engagement__request__in=reqs).delete()
        PaymentProof.objects.filter(charge__engagement__request__in=reqs).delete()
        Charge.objects.filter(engagement__request__in=reqs).delete()
        Engagement.objects.filter(request__in=reqs).delete()
        Contract.objects.filter(request__in=reqs).delete()
        Proposal.objects.filter(request__in=reqs).delete()
        reqs.delete()

    def handle(self, *args, **options):
        if not settings.DEBUG:
            raise CommandError("seed_demo only runs with DEBUG on.")
        if not CarePlan.objects.exists():
            raise CommandError("Run seed_pricing first.")
        pw = password()
        client, _ = User.objects.get_or_create(email=CLIENT, defaults={"full_name": "Amel Demo", "language": "en"})
        studio, _ = User.objects.get_or_create(email=STUDIO, defaults={"full_name": "Studio Demo", "role": User.Role.DEVELOPER})
        for user in (client, studio):
            user.set_password(pw)
            user.email_verified_at = user.email_verified_at or timezone.now()
            user.save()
        self.wipe(client)

        c, s = as_user(client), as_user(studio)
        service = Service.objects.filter(active=True).first()

        def request(title, objectives, **extra):
            req = ProjectRequest.objects.create(
                client=client, service=service, title=title, objectives=objectives, language="en",
                status=ProjectRequest.Status.SUBMITTED, budget_currency="DZD", plan=CarePlan.objects.get(code="pro"),
                options={"speed": "standard"}, estimate_low=180000, estimate_high=234000, estimate_currency="DZD", **extra,
            )
            Message.objects.create(request=req, sender=client, body="Hello! Looking forward to working together.")
            return req

        def offer(req, price, milestones=(("Design", 7), ("Build", 18), ("Launch", 5))):
            return lifecycle.send_offer(s, req.pk, {
                "plan": CarePlan.objects.get(code="pro"), "price": price, "currency": "DZD", "timeline_days": 30,
                "scope": "A fast, bilingual website with online booking and an admin back-office.",
                "deliverables": "Responsive website (FR/EN)\nBooking with e-mail confirmations\nAdmin back-office\nSEO basics",
                "exclusions": "Hosting and domain fees\nPhotography and copywriting",
                "milestones": [{"title": t, "days": d} for t, d in milestones],
                "note": "Happy to adjust the scope if the budget is tight.",
            })

        def signed(req, price):
            proposal = offer(req, price)
            lifecycle.respond(c, proposal.pk, "accept")
            req.refresh_from_db()
            return lifecycle.sign_contract(c, req.contracts.get().pk, "Amel Demo", True)

        # 1. An open proposal waiting for the client.
        offer(request("Guesthouse booking site", "Let guests book rooms online and pay a deposit."), 210000)
        # 2. Accepted: the contract waits for a signature.
        r2 = request("Café loyalty app", "A simple stamp card app for regulars.")
        lifecycle.respond(c, offer(r2, 160000).pk, "accept")
        # 3. Signed: the deposit is due.
        signed(request("Clinic dashboard", "Appointments and patient records for a small clinic."), 320000)
        # 4. In development, with progress.
        eng = signed(request("Rental platform v2", "Online bookings, Chargily payments and an owner dashboard."), 450000)
        lifecycle.record_cash(s, eng.charges.get(kind="deposit").pk)
        eng.refresh_from_db()
        first = eng.milestones.order_by("order").first()
        lifecycle.set_milestone_status(s, first.pk, "review")
        now = timezone.now()
        for i, (title, state, days) in enumerate([("Wireframes", "done", None), ("Booking flow", "doing", 3), ("Payment page", "todo", 6), ("Owner dashboard", "todo", 11)]):
            Task.objects.create(engagement=eng, milestone=first, order=i, title=title, status=state,
                                eta=now + timedelta(days=days) if days else None, done_at=now if state == "done" else None)
        update = ProgressUpdate.objects.create(engagement=eng, author=studio, title="Homepage and booking flow designed",
                                               body="Both directions are on the preview link. Tell me which one you prefer.")
        update.attachments.add(store_upload(s, eng.request, screenshot("Homepage", "#ff6a1a")),
                               store_upload(s, eng.request, screenshot("Booking flow", "#c4c7cc")))
        Message.objects.create(request=eng.request, sender=studio, body="The first designs are up. Have a look when you can.")
        # 5. Approved by the client: the final payment is due. (Not an active
        # project, so the demo leaves room under the 2-project cap.)
        eng5 = signed(request("Portfolio site", "A one-page portfolio with a contact form."), 45000)
        lifecycle.record_cash(s, eng5.charges.get(kind="deposit").pk)
        lifecycle.engagement_action(s, eng5.pk, "ready_for_review")
        lifecycle.engagement_action(c, eng5.pk, "approve")

        # 6. Delivered projects with reviews, so the home page Reviews section
        # and the moderation queue can be seen. Marked "(demo)": the
        # production database never runs this command (DEBUG check above).
        def delivered(title, price):
            e = signed(request(title, "Demo project, delivered."), price)
            lifecycle.record_cash(s, e.charges.get(kind="deposit").pk)
            lifecycle.engagement_action(s, e.pk, "ready_for_review")
            lifecycle.engagement_action(c, e.pk, "approve")
            lifecycle.record_cash(s, e.charges.get(kind="balance").pk)
            e.refresh_from_db()
            # Straight to live (not engagement_action): no launch e-mails or case-study drafts from demo data.
            e.status, e.production_at = Engagement.Status.LIVE, now - timedelta(days=20)
            e.maintenance_ends_at = e.production_at + timedelta(days=e.maintenance_days)
            e.save()
            return e

        for title, price, rating, name, body, reply, state in [
            ("Guesthouse website", 120000, 5, "Amel D.", "Clear plan from day one, weekly previews, and the booking page was live a week early. Guests book on their own now.", "Thank you Amel, it was a pleasure.", "approved"),
            ("Restaurant menu app", 90000, 5, "Karim B.", "He explained every choice in simple words and the app is fast even on old phones. Highly recommended.", "", "approved"),
            ("Clinic landing page", 60000, 4, "Sara M.", "Good work and very responsive. One revision took a little longer than planned, but the result is exactly what we needed.", "Thanks Sara, noted for next time.", "approved"),
            ("Shop catalogue", 70000, 5, "Yacine T.", "Waiting for approval: shows in the studio queue.", "", "pending"),
        ]:
            e = delivered(title, price)
            Review.objects.create(
                engagement=e, author=client, rating=rating, body=body, display_name=name, display_role="Demo review",
                project_label=service.title_en if service else title, status=state, reply=reply,
                published_at=now - timedelta(days=rating) if state == "approved" else None,
            )

        self.stdout.write(self.style.SUCCESS(
            f"Demo ready: {CLIENT} (client) and {STUDIO} (studio). Password: DEMO_PASSWORD in backend/.env"))
