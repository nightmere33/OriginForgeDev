"""Tickets: standing and reply targets, the inbox order, the statuses and timers, privacy, and studio-started threads."""

from datetime import timedelta
from unittest.mock import patch

from django.core import mail
from django.utils import timezone

from engagements.test_lifecycle import LifecycleBase, png
from live.models import Notification

from .models import Ticket, TicketMessage
from .service import tick
from .tiers import standing


def act(client, eng, action, **body):
    return client.post(f"/api/engagements/{eng}/action/", {"action": action, **body}, format="json")


class TicketTests(LifecycleBase):
    def open(self, client, subject="Question", body="How long does a website take?", **extra):
        return self.ok(client.post("/api/support/tickets/", {"subject": subject, "body": body, **extra}, format="json"), 201)

    def test_standing_follows_what_the_client_has_with_the_studio(self):
        self.assertEqual(standing(self.alice).tier, "newcomer")
        self.submitted_request()
        self.assertEqual((standing(self.alice).tier, standing(self.alice).hours), ("requester", 48))
        self.started_project()  # Pro plan
        s = standing(self.alice)
        self.assertEqual((s.tier, s.priority, s.hours), ("pro", 2, 24))

    def test_a_newcomer_waits_longer_and_a_pro_client_is_answered_first(self):
        bob, alice, dev = self.api(self.bob), self.api(self.alice), self.api(self.dev)
        late = self.open(bob, "Bob's question")
        self.assertEqual((late["tier"], late["target_hours"], late["status"]), ("newcomer", 72, "open"))
        self.started_project()
        first = self.open(alice, "Alice's question")
        self.assertEqual((first["tier"], first["priority"]), ("pro", 2))
        inbox = self.ok(dev.get("/api/support/tickets/?status=active"))
        self.assertEqual([t["subject"] for t in inbox["results"]], ["Alice's question", "Bob's question"])
        self.assertEqual(inbox["counts"]["open"], 2)
        self.assertEqual(self.ok(alice.get("/api/support/standing/"))["tier"], "pro")
        self.assertTrue(Notification.objects.filter(user=self.dev, key="studio_ticket").exists())

    def test_replies_move_the_ball_and_the_clock(self):
        alice, dev = self.api(self.alice), self.api(self.dev)
        ref = self.open(alice)["reference"]
        with self.captureOnCommitCallbacks(execute=True):
            self.ok(dev.post(f"/api/support/tickets/{ref}/messages/", {"body": "About three weeks."}, format="json"), 201)
        t = Ticket.objects.get(reference=ref)
        self.assertEqual((t.status, t.due_at), ("pending", None))
        self.assertIsNotNone(t.first_reply_at)
        self.assertTrue(any("Younes replied" in m.subject for m in mail.outbox))
        self.ok(alice.post(f"/api/support/tickets/{ref}/messages/", {"body": "Great, and the price?"}, format="json"), 201)
        t.refresh_from_db()
        self.assertEqual(t.status, "open")
        self.assertIsNotNone(t.due_at)
        # The client marks it solved, rates it, and it closes three days later.
        self.ok(alice.post(f"/api/support/tickets/{ref}/status/", {"status": "solved"}, format="json"))
        self.assertEqual(alice.post(f"/api/support/tickets/{ref}/status/", {"status": "open"}, format="json").status_code, 400)
        self.assertEqual(self.ok(alice.post(f"/api/support/tickets/{ref}/rate/", {"rating": 5}, format="json"))["rating"], 5)
        tick(now=timezone.now() + timedelta(hours=73))
        t.refresh_from_db()
        self.assertEqual(t.status, "closed")
        self.assertEqual(alice.post(f"/api/support/tickets/{ref}/messages/", {"body": "One more thing"}, format="json").status_code, 400)

    def test_internal_notes_and_files_stay_private(self):
        alice, bob, dev = self.api(self.alice), self.api(self.bob), self.api(self.dev)
        ref = self.open(alice)["reference"]
        self.ok(dev.post(f"/api/support/tickets/{ref}/messages/", {"body": "Note to self: quote 90k", "internal": True}, format="json"), 201)
        self.assertEqual(Ticket.objects.get(reference=ref).status, "open")  # a note is not a reply
        self.assertNotIn("Note to self", str(self.ok(alice.get(f"/api/support/tickets/{ref}/messages/"))))
        self.assertIn("Note to self", str(self.ok(dev.get(f"/api/support/tickets/{ref}/messages/"))))
        self.assertEqual(bob.get(f"/api/support/tickets/{ref}/messages/").status_code, 404)
        self.assertEqual(self.ok(bob.get("/api/support/tickets/"))["results"], [])
        sent = self.ok(alice.post(f"/api/support/tickets/{ref}/messages/", {"body": "Screenshot", "file": png()}), 201)
        self.assertEqual(alice.get(sent["attachment"]["url"]).status_code, 200)
        self.assertEqual(bob.get(sent["attachment"]["url"]).status_code, 404)

    def test_reading_marks_seen_and_clears_the_bell(self):
        alice, dev = self.api(self.alice), self.api(self.dev)
        ref = self.open(alice)["reference"]
        self.ok(dev.post(f"/api/support/tickets/{ref}/messages/", {"body": "Hello"}, format="json"), 201)
        self.assertEqual(self.ok(alice.get("/api/support/tickets/"))["results"][0]["unread"], 1)
        self.assertIsNone(self.ok(alice.get(f"/api/support/tickets/{ref}/messages/?peek=1"))[-1]["read_at"])
        self.assertIsNotNone(self.ok(alice.get(f"/api/support/tickets/{ref}/messages/"))[-1]["read_at"])
        self.assertEqual(self.ok(alice.get("/api/support/tickets/"))["results"][0]["unread"], 0)
        self.assertFalse(Notification.objects.filter(user=self.alice, key="ticket_reply", read_at__isnull=True).exists())

    def test_quiet_clients_are_reminded_then_solved_and_overdue_tickets_alert_once(self):
        alice, dev = self.api(self.alice), self.api(self.dev)
        waiting = self.open(alice, "Waiting on me")["reference"]
        self.ok(dev.post(f"/api/support/tickets/{waiting}/messages/", {"body": "Can you send the logo?"}, format="json"), 201)
        tick(now=timezone.now() + timedelta(days=3, hours=1))
        self.assertTrue(Notification.objects.filter(user=self.alice, key="ticket_pending_reminder").exists())
        tick(now=timezone.now() + timedelta(days=7, hours=1))
        self.assertEqual(Ticket.objects.get(reference=waiting).status, "solved")

        late = self.open(alice, "Waiting on Younes")["reference"]
        later = timezone.now() + timedelta(days=4)
        self.assertEqual(tick(now=later)["overdue"], 1)
        self.assertEqual(tick(now=later)["overdue"], 0)
        self.assertTrue(Notification.objects.filter(user=self.dev, key="studio_ticket_overdue").exists())
        self.assertEqual(Ticket.objects.get(reference=late).status, "open")

    def test_the_studio_starts_a_conversation_and_shares_commands(self):
        alice, dev = self.api(self.alice), self.api(self.dev)
        self.assertEqual(alice.post("/api/support/start/", {"user": self.bob.pk, "subject": "x", "body": "y"}, format="json").status_code, 403)
        t = self.ok(dev.post("/api/support/start/", {"user": self.alice.pk, "subject": "Welcome", "body": "Any questions?"}, format="json"), 201)
        self.assertEqual((t["origin"], t["status"]), ("studio", "pending"))
        self.assertTrue(Notification.objects.filter(user=self.alice, key="ticket_started").exists())
        self.ok(dev.post(f"/api/support/tickets/{t['reference']}/messages/", {"share": "howto"}, format="json"), 201)
        self.assertEqual(dev.post(f"/api/support/tickets/{t['reference']}/messages/", {"share": "rm-rf"}, format="json").status_code, 400)
        last = self.ok(alice.get(f"/api/support/tickets/{t['reference']}/messages/"))[-1]
        self.assertEqual((last["kind"], last["data"]), ("share", {"share": "howto"}))

    def test_a_handover_from_the_assistant_keeps_the_transcript(self):
        alice = self.api(self.alice)
        t = self.open(alice, "Help with payment", "Can I pay half now?",
                      transcript=[{"role": "user", "text": "can I pay in two parts"}, {"role": "assistant", "text": "The deposit is 40 %."}])
        self.assertEqual(t["origin"], "assistant")
        kinds = list(TicketMessage.objects.filter(ticket__reference=t["reference"]).values_list("kind", flat=True))
        self.assertEqual(kinds, ["transcript", "text"])


class ProjectChatCardTests(LifecycleBase):
    def test_proposals_and_answers_are_cards_and_commands_share(self):
        alice, dev = self.api(self.alice), self.api(self.dev)
        ref = self.submitted_request()
        v1 = self.offer(ref)
        self.ok(alice.post(f"/api/proposals/{v1['id']}/respond/", {"action": "counter", "price": 150000}, format="json"))
        cards = [m for m in self.ok(alice.get(f"/api/requests/{ref}/messages/")) if m["kind"] == "proposal"]
        self.assertEqual([(c["data"]["event"], c["proposal"]["version"]) for c in cards], [("sent", 1), ("countered", 2)])
        self.assertEqual(cards[0]["proposal"]["status"], "countered")  # the card follows the version
        self.ok(dev.post(f"/api/requests/{ref}/messages/", {"share": "pay"}, format="json"), 201)
        self.assertEqual(dev.post(f"/api/requests/{ref}/messages/", {"share": "nope"}, format="json").status_code, 400)


class AssistantTests(LifecycleBase):
    def ask(self, question, lang="en", client=None):
        from rest_framework.test import APIClient

        return (client or APIClient()).post("/api/assistant/ask/", {"question": question, "lang": lang}, format="json")

    def test_it_answers_from_the_notes_and_hands_over_when_unsure(self):
        a = self.ok(self.ask("How do I start a project?"))
        self.assertEqual((a["handoff"], a["film"], a["engine"]), (False, "howto", "notes"))
        self.assertEqual(self.ok(self.ask("can I pay with paypal"))["topic"], "payments")
        self.assertTrue(self.ok(self.ask("what is the weather in paris"))["handoff"])
        self.assertIn("Chargily", self.ok(self.ask("comment payer par carte CIB", "fr"))["answer"])
        self.assertEqual(self.ask("x").status_code, 400)

    def test_the_model_writes_the_answer_when_configured(self):
        class Reply:
            def raise_for_status(self):
                pass

            def json(self):
                return {"result": {"response": "Pick a service and send your brief."}}

        with self.settings(CF_AI_ACCOUNT_ID="acc", CF_AI_TOKEN="tok"), patch("assistant.engine.httpx.post", return_value=Reply()) as post:
            a = self.ok(self.ask("How do I start a project?"))
        self.assertEqual((a["answer"], a["engine"]), ("Pick a service and send your brief.", "model"))
        self.assertIn("Notes:", post.call_args.kwargs["json"]["messages"][0]["content"])
        with self.settings(CF_AI_ACCOUNT_ID="acc", CF_AI_TOKEN="tok"), patch("assistant.engine.httpx.post", side_effect=RuntimeError("down")):
            self.assertEqual(self.ok(self.ask("How do I start a project?"))["engine"], "notes")
