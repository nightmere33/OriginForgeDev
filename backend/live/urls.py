from django.urls import path

from . import views

urlpatterns = [
    path("notifications/", views.NotificationsView.as_view()),
    path("notifications/read/", views.NotificationsReadView.as_view()),
]
