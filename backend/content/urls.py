from django.urls import path

from . import views

urlpatterns = [
    path("site/", views.site),
    path("services/", views.services),
    path("work/", views.work_list),
    path("work/<slug:slug>/", views.work_detail),
    path("galaxy/", views.galaxy),
    path("tech/", views.tech),
    path("testimonials/", views.testimonials),
    path("faqs/", views.faqs),
    path("credentials/", views.credentials),
    path("plans/", views.plans),
    path("pricing/", views.pricing),
    path("estimate/", views.estimate),
]
