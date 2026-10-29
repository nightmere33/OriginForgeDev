"""Opening a conversation marks it seen, clears its bell entries and tells every open page."""

from unittest.mock import patch

from live.models import Notification

from .test_lifecycle import LifecycleBase


class ReadTests(LifecycleBase):
    def pushed(self, push, kind):
        return [call.args for call in push.call_args_list if call.args[1].get("type") == kind]

    def test_opening_marks_the_other_side_seen_and_clears_the_bell(self):
        alice, dev = self.api(self.alice), self.api(self.dev)
        ref = self.submitted_request()
        with self.captureOnCommitCallbacks(execute=True):
            self.ok(alice.post(f"/api/requests/{ref}/messages/", {"body": "Hello"}, format="json"), 201)
        self.assertEqual(self.ok(dev.get("/api/requests/"))["results"][0]["summary"]["unread"], 1)
        bell = Notification.objects.filter(user=self.dev, key="studio_message", read_at__isnull=True)
        self.assertEqual(bell.count(), 1)

        with patch("live.service.push") as push, self.captureOnCommitCallbacks(execute=True):
            listed = self.ok(dev.get(f"/api/requests/{ref}/messages/"))
        self.assertIsNotNone(listed[-1]["read_at"])
        self.assertEqual(bell.count(), 0)
        self.assertEqual(self.ok(dev.get("/api/requests/"))["results"][0]["summary"]["unread"], 0)
        (groups, event), = self.pushed(push, "read")
        self.assertEqual((event["reference"], event["reader"]), (ref, self.dev.pk))
        self.assertIn(f"user.{self.alice.pk}", groups)  # the sender's thread shows "Seen"
        self.assertEqual(self.pushed(push, "notifications"), [([f"user.{self.dev.pk}"], {"type": "notifications"})])

        # Nothing new: reading again says nothing.
        with patch("live.service.push") as push, self.captureOnCommitCallbacks(execute=True):
            self.ok(dev.get(f"/api/requests/{ref}/messages/"))
        self.assertEqual(self.pushed(push, "read"), [])

    def test_a_hidden_tab_peeks_without_marking(self):
        alice, dev = self.api(self.alice), self.api(self.dev)
        ref = self.submitted_request()
        self.ok(dev.post(f"/api/requests/{ref}/messages/", {"body": "Question for you"}, format="json"), 201)
        with patch("live.service.push") as push, self.captureOnCommitCallbacks(execute=True):
            self.assertIsNone(self.ok(alice.get(f"/api/requests/{ref}/messages/?peek=1"))[-1]["read_at"])
        self.assertEqual(self.pushed(push, "read"), [])
        self.assertEqual(self.ok(alice.get("/api/requests/"))["results"][0]["summary"]["unread"], 1)
        # Back in view: now it is read.
        self.assertIsNotNone(self.ok(alice.get(f"/api/requests/{ref}/messages/"))[-1]["read_at"])

    def test_a_new_request_waits_on_the_studio(self):
        ref = self.submitted_request()
        row = next(r for r in self.ok(self.api(self.dev).get("/api/requests/"))["results"] if r["reference"] == ref)
        self.assertEqual(row["summary"]["waiting"], "new")
