from django.contrib.auth import get_user_model
from django.core.cache import cache
from django.test import TestCase, override_settings
from rest_framework.test import APIClient

from engagements.models import ProjectRequest

MEMORY = {"default": {"BACKEND": "channels.layers.InMemoryChannelLayer"}}


@override_settings(CHANNEL_LAYERS=MEMORY)
class DraftDeletionTests(TestCase):
    def setUp(self):
        cache.clear()
        User = get_user_model()
        self.me = User.objects.create_user(email="me@example.com", password="a-long-test-password-1", full_name="Me")
        self.other = User.objects.create_user(email="other@example.com", password="a-long-test-password-1", full_name="Other")
        self.api = APIClient()
        self.api.force_authenticate(self.me)

    def test_owner_deletes_own_draft(self):
        d = ProjectRequest.objects.create(client=self.me, title="Draft", status=ProjectRequest.Status.DRAFT)
        self.assertEqual(self.api.delete(f"/api/requests/{d.reference}/").status_code, 204)
        self.assertFalse(ProjectRequest.objects.filter(pk=d.pk).exists())

    def test_sent_requests_cannot_be_deleted(self):
        d = ProjectRequest.objects.create(client=self.me, title="Sent", status=ProjectRequest.Status.SUBMITTED)
        self.assertEqual(self.api.delete(f"/api/requests/{d.reference}/").status_code, 403)
        self.assertTrue(ProjectRequest.objects.filter(pk=d.pk).exists())

    def test_someone_elses_draft_is_not_found(self):
        d = ProjectRequest.objects.create(client=self.other, title="Theirs", status=ProjectRequest.Status.DRAFT)
        self.assertEqual(self.api.delete(f"/api/requests/{d.reference}/").status_code, 404)
