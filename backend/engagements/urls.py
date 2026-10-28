from django.urls import path
from rest_framework.routers import SimpleRouter

from . import api, views

router = SimpleRouter()
router.register("requests", views.ProjectRequestViewSet, basename="request")
router.register("proposals", api.ProposalViewSet, basename="proposal")
router.register("contracts", api.ContractViewSet, basename="contract")
router.register("engagements", api.EngagementViewSet, basename="engagement")
router.register("milestones", api.MilestoneViewSet, basename="milestone")
router.register("tasks", api.TaskViewSet, basename="task")

urlpatterns = router.urls + [
    path("files/attachments/<uuid:pk>/", views.download_attachment),
    path("waitlist/", api.WaitlistView.as_view()),
    path("queue/", views.queue_preview),
]
