from django.urls import path

from . import views

urlpatterns = [
    path("", views.PublicReviewsView.as_view()),
    path("mine/", views.MyReviewsView.as_view()),
    path("mine/<int:pk>/", views.MyReviewView.as_view()),
    path("studio/", views.StudioReviewsView.as_view()),
    path("studio/<int:pk>/moderate/", views.ModerateReviewView.as_view()),
    path("studio/invites/", views.StudioInvitesView.as_view()),
    path("invites/<str:token>/", views.InviteView.as_view()),
]
