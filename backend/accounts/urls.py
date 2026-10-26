from django.urls import path

from . import oauth, views

urlpatterns = [
    path("csrf/", views.CsrfView.as_view()),
    path("register/", views.RegisterView.as_view()),
    path("login/", views.LoginView.as_view()),
    path("logout/", views.LogoutView.as_view()),
    path("me/", views.MeView.as_view()),
    path("onboarding/", views.OnboardingView.as_view()),
    path("delete/", views.DeleteAccountView.as_view()),
    path("verify-email/", views.VerifyEmailView.as_view()),
    path("verify-email/resend/", views.ResendVerificationView.as_view()),
    path("password/reset/", views.PasswordResetView.as_view()),
    path("password/reset/confirm/", views.PasswordResetConfirmView.as_view()),
    path("password/change/", views.PasswordChangeView.as_view()),
    path("providers/", oauth.ProvidersView.as_view()),
    path("oauth/<str:provider>/start/", oauth.OAuthStartView.as_view()),
    path("oauth/<str:provider>/callback/", oauth.OAuthCallbackView.as_view()),
]
