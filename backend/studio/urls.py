from django.urls import path

from . import views

urlpatterns = [
    path("overview/", views.overview),
    path("clients/", views.clients),
    path("payments/", views.payments),
    path("settings/", views.site_settings),
    path("prices/", views.prices),
]
