import hashlib
import secrets

from django.contrib.auth import authenticate, get_user_model, login, logout, update_session_auth_hash
from django.contrib.auth.password_validation import validate_password
from django.contrib.auth.tokens import default_token_generator
from django.core.cache import cache
from django.core.exceptions import ValidationError as DjangoValidationError
from django.db import transaction
from django.utils import timezone
from django.utils.decorators import method_decorator
from django.utils.encoding import force_bytes, force_str
from django.utils.http import urlsafe_base64_decode, urlsafe_base64_encode
from django.views.decorators.csrf import csrf_protect, ensure_csrf_cookie
from rest_framework import permissions, status
from rest_framework.response import Response
from rest_framework.views import APIView

from audit.service import record
from notifications.events import notify_address
from notifications.service import notify_user, site_url, user_lang

from .serializers import (
    DeleteAccountSerializer,
    LoginSerializer,
    OnboardingSerializer,
    PasswordChangeSerializer,
    PasswordResetConfirmSerializer,
    PasswordResetSerializer,
    RegisterSerializer,
    UserSerializer,
)
from .tokens import make_verification_token, read_verification_token

User = get_user_model()

# Wrong passwords per account, from wherever they come: the studio address is
# public, so guesses spread over many addresses are limited too. Counted for
# unknown addresses as well, so the limit says nothing about who has an account.
LOGIN_FAILS_MAX = 10
LOGIN_FAILS_WINDOW = 15 * 60


def _fails_key(email: str) -> str:
    return "login-fails:" + hashlib.sha256(email.encode()).hexdigest()[:32]


def send_verification(user):
    """The 6-digit code (typed on the site) and, as a fallback, a link."""
    from .tokens import new_email_code

    link = site_url(f"/{user_lang(user)}/verify-email?token={make_verification_token(user)}")
    notify_user("verify_email", user, link=link, code=new_email_code(user))


@method_decorator(ensure_csrf_cookie, name="dispatch")
class CsrfView(APIView):
    """GET once on load so the browser holds a CSRF cookie before any POST."""

    permission_classes = (permissions.AllowAny,)

    def get(self, request):
        return Response({"ok": True})


# DRF only enforces CSRF for already-authenticated sessions; login and sign-up
# run anonymous, so they are protected explicitly against login-CSRF.
@method_decorator(csrf_protect, name="dispatch")
class RegisterView(APIView):
    permission_classes = (permissions.AllowAny,)
    throttle_scope = "register"

    def post(self, request):
        serializer = RegisterSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        user = serializer.save()
        login(request, user, backend="django.contrib.auth.backends.ModelBackend")
        record(request, "account.registered", user)
        send_verification(user)
        return Response(UserSerializer(user).data, status=status.HTTP_201_CREATED)


@method_decorator(csrf_protect, name="dispatch")
class LoginView(APIView):
    permission_classes = (permissions.AllowAny,)
    throttle_scope = "login"

    def post(self, request):
        serializer = LoginSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        email = serializer.validated_data["email"].lower().strip()
        fails = _fails_key(email)
        if cache.get(fails, 0) >= LOGIN_FAILS_MAX:
            return Response({"detail": "Too many attempts for this account. Try again in 15 minutes, or reset your password."},
                            status=status.HTTP_429_TOO_MANY_REQUESTS)
        user = authenticate(request, email=email, password=serializer.validated_data["password"])
        if user is None:
            cache.add(fails, 0, LOGIN_FAILS_WINDOW)
            cache.incr(fails)
            # One message for unknown e-mail and wrong password: no account probing.
            return Response({"detail": "Incorrect e-mail or password."}, status=status.HTTP_400_BAD_REQUEST)
        cache.delete(fails)
        login(request, user)
        record(request, "account.login", user)
        return Response(UserSerializer(user).data)


class LogoutView(APIView):
    def post(self, request):
        logout(request)
        return Response(status=status.HTTP_204_NO_CONTENT)


class MeView(APIView):
    def get_permissions(self):
        # Every page asks "who is this?"; a signed-out visitor is an answer
        # (204), not an error that would land in their browser console.
        return [permissions.AllowAny()] if self.request.method == "GET" else super().get_permissions()

    def get(self, request):
        if not request.user.is_authenticated:
            return Response(status=status.HTTP_204_NO_CONTENT)
        return Response(UserSerializer(request.user).data)

    def patch(self, request):
        serializer = UserSerializer(request.user, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(serializer.data)


@method_decorator(csrf_protect, name="dispatch")
class VerifyEmailView(APIView):
    permission_classes = (permissions.AllowAny,)

    def post(self, request):
        payload = read_verification_token(str(request.data.get("token", "")))
        user = payload and User.objects.filter(pk=payload["uid"], email=payload["email"]).first()
        if not user:
            return Response({"detail": "This link is invalid or has expired."}, status=status.HTTP_400_BAD_REQUEST)
        if user.email_verified_at is None:
            user.email_verified_at = timezone.now()
            user.save(update_fields=["email_verified_at"])
            record(request, "account.email_verified", user, actor=user)
        return Response({"ok": True})


class ResendVerificationView(APIView):
    throttle_scope = "password_reset"

    def post(self, request):
        from .models import EmailCode

        user = request.user
        if user.email_verified_at is not None:
            return Response({"ok": True, "verified": True})
        last = EmailCode.objects.filter(user=user).first()
        wait = EmailCode.RESEND_SECONDS - (timezone.now() - last.created_at).total_seconds() if last else 0
        if wait > 0:
            return Response({"detail": "Wait a moment before asking for a new code.", "retry_after": int(wait) + 1},
                            status=status.HTTP_429_TOO_MANY_REQUESTS)
        send_verification(user)
        return Response({"ok": True, "retry_after": EmailCode.RESEND_SECONDS})


class VerifyCodeView(APIView):
    """The 6-digit code from the sign-up e-mail confirms the address."""

    throttle_scope = "login"

    def post(self, request):
        from .tokens import check_email_code

        user = request.user
        if user.email_verified_at is None:
            result = check_email_code(user, str(request.data.get("code", "")))
            if result != "ok":
                detail = "That code has expired. Ask for a new one." if result == "expired" else "That code isn't right."
                return Response({"detail": detail, "code": result}, status=status.HTTP_400_BAD_REQUEST)
            user.email_verified_at = timezone.now()
            user.save(update_fields=["email_verified_at"])
            record(request, "account.email_verified", user, actor=user)
        return Response(UserSerializer(user).data)


@method_decorator(csrf_protect, name="dispatch")
class PasswordResetView(APIView):
    permission_classes = (permissions.AllowAny,)
    throttle_scope = "password_reset"

    def post(self, request):
        serializer = PasswordResetSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        user = User.objects.filter(email__iexact=serializer.validated_data["email"], is_active=True).first()
        if user:
            uid = urlsafe_base64_encode(force_bytes(user.pk))
            token = default_token_generator.make_token(user)
            notify_user("password_reset", user, link=site_url(f"/{user_lang(user)}/reset?uid={uid}&token={token}"))
        # Same answer whether or not the account exists.
        return Response({"ok": True})


@method_decorator(csrf_protect, name="dispatch")
class PasswordResetConfirmView(APIView):
    permission_classes = (permissions.AllowAny,)
    throttle_scope = "password_reset"

    def post(self, request):
        serializer = PasswordResetConfirmSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        try:
            user = User.objects.get(pk=force_str(urlsafe_base64_decode(data["uid"])))
        except (User.DoesNotExist, ValueError, TypeError, OverflowError):
            user = None
        if not user or not default_token_generator.check_token(user, data["token"]):
            return Response({"detail": "This link is invalid or has expired."}, status=status.HTTP_400_BAD_REQUEST)
        try:
            validate_password(data["password"], user)
        except DjangoValidationError as exc:
            return Response({"password": list(exc.messages)}, status=status.HTTP_400_BAD_REQUEST)
        user.set_password(data["password"])
        user.save(update_fields=["password"])
        record(request, "account.password_reset", user, actor=user)
        return Response({"ok": True})


class PasswordChangeView(APIView):
    def post(self, request):
        serializer = PasswordChangeSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        user = request.user
        if not user.check_password(serializer.validated_data["current_password"]):
            return Response({"current_password": ["Incorrect password."]}, status=status.HTTP_400_BAD_REQUEST)
        try:
            validate_password(serializer.validated_data["new_password"], user)
        except DjangoValidationError as exc:
            return Response({"new_password": list(exc.messages)}, status=status.HTTP_400_BAD_REQUEST)
        user.set_password(serializer.validated_data["new_password"])
        user.save(update_fields=["password"])
        update_session_auth_hash(request, user)
        record(request, "account.password_changed", user)
        return Response({"ok": True})


class OnboardingView(APIView):
    """Save the welcome answers and mark the account as set up."""

    def post(self, request):
        serializer = OnboardingSerializer(request.user, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save(onboarded_at=timezone.now())
        return Response(UserSerializer(request.user).data)


class DeleteAccountView(APIView):
    """
    Delete one's own account (privacy policy, Facebook's data-deletion rule).

    The person is erased: name, e-mail, phone, handles and password are wiped
    and the login stops working; unsent drafts, the waitlist entry and the
    notifications go. Signed contracts, invoices and payments stay, anonymised,
    because accounting law requires them. Refused while a project is being
    built, since a signed contract is still running.
    """

    throttle_scope = "login"  # it checks a password

    def post(self, request):
        user = request.user
        if user.is_developer:
            return Response({"detail": "The studio account can't be deleted from here."}, status=status.HTTP_400_BAD_REQUEST)
        data = DeleteAccountSerializer(data=request.data)
        data.is_valid(raise_exception=True)
        # Google/Facebook accounts have no password: the typed word is the confirmation.
        if user.has_usable_password() and not user.check_password(data.validated_data["password"]):
            return Response({"password": ["That password is not right."]}, status=status.HTTP_400_BAD_REQUEST)

        from engagements.models import Engagement, ProjectRequest, WaitlistEntry

        if Engagement.objects.filter(client=user, status__in=Engagement.ACTIVE).exists():
            return Response(
                {"detail": "A project is being built under your contract. Finish or cancel it first, then delete your account."},
                status=status.HTTP_409_CONFLICT,
            )
        email, name, lang = user.email, user.full_name, user.language
        with transaction.atomic():
            ProjectRequest.objects.filter(client=user, status=ProjectRequest.Status.DRAFT).delete()
            WaitlistEntry.objects.filter(email__iexact=email).delete()
            user.notifications.all().delete()
            user.social_accounts.all().delete()
            user.reviews.update(display_name="Verified client", display_role="")
            record(request, "account.deleted", user)
            user.email = f"deleted-{user.pk}-{secrets.token_hex(4)}@deleted.invalid"
            user.full_name = "Deleted user"
            for field in ("company", "phone", "whatsapp", "country", "address", "city", "postal_code", "contact_handle", "heard_from_detail"):
                setattr(user, field, "")
            user.set_unusable_password()
            user.is_active = False
            user.email_verified_at = None
            user.save()
            notify_address("account_deleted", email, name, lang, "")
            from live.service import notify_studio_in_app

            notify_studio_in_app("studio_account_deleted", "A client deleted their account", f"Account #{user.pk} was anonymised.", "")
        logout(request)
        return Response(status=status.HTTP_204_NO_CONTENT)
