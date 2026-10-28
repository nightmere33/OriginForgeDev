from django.urls import path

from . import views

urlpatterns = [
    path("overview/", views.overview),
    path("clients/", views.clients),
    path("payments/", views.payments),
    path("settings/", views.site_settings),
    path("prices/", views.prices),
    path("queue/", views.queue_board),
    path("services/", views.services),
    path("services/<slug:slug>/", views.service_detail),
    path("email/", views.email_check),
    path("queue/<str:reference>/<str:action>/", views.queue_action),
]
