"""
Sign in with Google or Facebook (OAuth 2.0 authorization-code flow).

    GET /api/auth/oauth/<provider>/start/?next=/en/portal&lang=en
        -> 302 to the provider, with a one-time `state` (and PKCE for Google)
           kept in this browser's session
    GET /api/auth/oauth/<provider>/callback/?code=…&state=…
        -> code exchanged server to server, profile read, signed in, 302 back

The browser never sees a token. An existing account is linked by verified
e-mail; a new person gets an account with no password and goes to /welcome.
A provider shows on the site only once its keys are in backend/.env.
"""

import base64
import hashlib
import hmac
import logging
import secrets
from urllib.parse import urlencode

import httpx
from django.conf import settings
from django.contrib.auth import get_user_model, login
from django.db import transaction
from django.http import HttpResponseRedirect
from django.utils import timezone
from django.utils.http import url_has_allowed_host_and_scheme
from rest_framework import permissions
from rest_framework.response import Response
from rest_framework.views import APIView

from audit.service import record

from .models import SocialAccount

logger = logging.getLogger("originforge.auth")
User = get_user_model()
SESSION_KEY = "oauth"
TIMEOUT = httpx.Timeout(10.0, connect=5.0)


def _graph() -> str:
    return f"https://graph.facebook.com/{settings.FACEBOOK_GRAPH_VERSION}"


def config(provider: str) -> dict | None:
    if provider == "google" and settings.GOOGLE_CLIENT_ID and settings.GOOGLE_CLIENT_SECRET:
        return {"id": settings.GOOGLE_CLIENT_ID, "secret": settings.GOOGLE_CLIENT_SECRET}
    if provider == "facebook" and settings.FACEBOOK_APP_ID and settings.FACEBOOK_APP_SECRET:
        return {"id": settings.FACEBOOK_APP_ID, "secret": settings.FACEBOOK_APP_SECRET}
    return None


def enabled() -> list[str]:
    return [p for p in ("google", "facebook") if config(p)]


def callback_url(provider: str) -> str:
    # The public origin: /api/ reaches Django through nginx (production) or the Next rewrite (development).
    return f"{settings.SITE_URL}/api/auth/oauth/{provider}/callback/"


def _safe_next(value: str | None) -> str:
    """A path on this site, or nothing. Django's check also catches what browsers
    turn into another site (a backslash read as "//evil"); no control
    characters or spaces at all (a tab inside "//evil" is dropped by browsers)."""
    if not value or not value.startswith("/") or any(ord(c) <= 0x20 or ord(c) == 0x7F for c in value):
        return ""
    return value if url_has_allowed_host_and_scheme(value, allowed_hosts=None) else ""


def _lang(value: str | None) -> str:
    return value if value in ("en", "fr") else "en"


def _back(lang: str, error: str) -> HttpResponseRedirect:
    return HttpResponseRedirect(f"/{lang}/login?{urlencode({'oauth': error})}")


class ProvidersView(APIView):
    """Which buttons to show."""

    permission_classes = (permissions.AllowAny,)

    def get(self, request):
        return Response({"providers": enabled()})


class OAuthStartView(APIView):
    permission_classes = (permissions.AllowAny,)
    throttle_scope = "login"

    def get(self, request, provider: str):
        lang = _lang(request.query_params.get("lang"))
        conf = config(provider)
        if not conf:
            return _back(lang, "unavailable")
        state = secrets.token_urlsafe(32)
        stash = {"provider": provider, "state": state, "lang": lang, "next": _safe_next(request.query_params.get("next"))}
        params = {"client_id": conf["id"], "redirect_uri": callback_url(provider), "response_type": "code", "state": state}
        if provider == "google":
            verifier = secrets.token_urlsafe(64)
            challenge = base64.urlsafe_b64encode(hashlib.sha256(verifier.encode()).digest()).rstrip(b"=").decode()
            stash["verifier"] = verifier
            params |= {"scope": "openid email profile", "code_challenge": challenge, "code_challenge_method": "S256", "prompt": "select_account"}
            url = "https://accounts.google.com/o/oauth2/v2/auth"
        else:
            params |= {"scope": "email,public_profile"}
            url = f"https://www.facebook.com/{settings.FACEBOOK_GRAPH_VERSION}/dialog/oauth"
        request.session[SESSION_KEY] = stash
        return HttpResponseRedirect(f"{url}?{urlencode(params)}")


def _google_profile(conf: dict, code: str, verifier: str, provider: str) -> dict:
    token = httpx.post("https://oauth2.googleapis.com/token", timeout=TIMEOUT, data={
        "client_id": conf["id"], "client_secret": conf["secret"], "code": code, "code_verifier": verifier,
        "grant_type": "authorization_code", "redirect_uri": callback_url(provider),
    })
    token.raise_for_status()
    info = httpx.get("https://openidconnect.googleapis.com/v1/userinfo", timeout=TIMEOUT,
                     headers={"Authorization": f"Bearer {token.json()['access_token']}"})
    info.raise_for_status()
    data = info.json()
    return {"uid": data["sub"], "email": data.get("email", "") if data.get("email_verified") else "", "name": data.get("name", "")}


def _facebook_profile(conf: dict, code: str, provider: str) -> dict:
    token = httpx.get(f"{_graph()}/oauth/access_token", timeout=TIMEOUT, params={
        "client_id": conf["id"], "client_secret": conf["secret"], "code": code, "redirect_uri": callback_url(provider),
    })
    token.raise_for_status()
    access = token.json()["access_token"]
    # appsecret_proof: the token is useless to anyone who doesn't also hold the app secret.
    proof = hmac.new(conf["secret"].encode(), access.encode(), hashlib.sha256).hexdigest()
    me = httpx.get(f"{_graph()}/me", timeout=TIMEOUT, params={"fields": "id,name,email", "access_token": access, "appsecret_proof": proof})
    me.raise_for_status()
    data = me.json()
    # Facebook only returns an e-mail address the person has confirmed.
    return {"uid": data["id"], "email": data.get("email", ""), "name": data.get("name", "")}


class OAuthCallbackView(APIView):
    permission_classes = (permissions.AllowAny,)
    throttle_scope = "login"

    def get(self, request, provider: str):
        stash = request.session.pop(SESSION_KEY, None) or {}
        lang = _lang(stash.get("lang"))
        conf = config(provider)
        state = request.query_params.get("state", "")
        if not conf or stash.get("provider") != provider or not stash.get("state") or not hmac.compare_digest(stash["state"], state):
            return _back(lang, "expired")
        if request.query_params.get("error") or not request.query_params.get("code"):
            return _back(lang, "cancelled")
        code = request.query_params["code"]
        try:
            profile = _google_profile(conf, code, stash.get("verifier", ""), provider) if provider == "google" else _facebook_profile(conf, code, provider)
        except (httpx.HTTPError, KeyError, ValueError) as exc:
            logger.warning("%s sign-in failed: %s", provider, exc)
            return _back(lang, "failed")

        user, created = self._resolve(provider, profile, lang)
        if user is None:
            return _back(lang, "no_email")
        if not user.is_active:
            return _back(lang, "disabled")
        login(request, user, backend="django.contrib.auth.backends.ModelBackend")
        record(request, f"account.login.{provider}", user, new=created)
        nxt = stash.get("next", "")
        if created:
            return HttpResponseRedirect(f"/{lang}/welcome" + (f"?{urlencode({'next': nxt})}" if nxt else ""))
        return HttpResponseRedirect(nxt or f"/{lang}/{'studio' if user.is_developer else 'portal'}")

    @staticmethod
    def _resolve(provider: str, profile: dict, lang: str):
        """The account for this person: by provider id, else by verified e-mail, else a new one."""
        with transaction.atomic():
            social = SocialAccount.objects.select_related("user").filter(provider=provider, uid=profile["uid"]).first()
            if social:
                SocialAccount.objects.filter(pk=social.pk).update(last_login_at=timezone.now())
                return social.user, False
            email = (profile.get("email") or "").strip().lower()
            if not email:
                return None, False
            user = User.objects.filter(email__iexact=email).first()
            created = user is None
            if created:
                user = User(email=email, full_name=(profile.get("name") or email.split("@")[0])[:150], language=lang,
                            email_verified_at=timezone.now())
                user.set_unusable_password()
                user.save()
            elif not user.email_verified_at:
                # The provider has just proven the address.
                user.email_verified_at = timezone.now()
                user.save(update_fields=["email_verified_at"])
            SocialAccount.objects.create(user=user, provider=provider, uid=profile["uid"], email=email, last_login_at=timezone.now())
            return user, created
