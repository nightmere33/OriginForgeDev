#!/usr/bin/env bash
# Install/refresh the Django side of OriginForge on the VPS (run as root).
#   ORIGIN  public origin of the site   (default: the current SITE_URL, else the bare IP)
#   HOSTS   comma list of host names    (default: the bare IP)
#   CSRF    trusted origins for forms   (default: ORIGIN)
# Secrets already live in /srv/originforge/shared/backend.env (provision_base.sh);
# this only adds the non-secret production settings and never prints values.
set -euo pipefail
APP=/srv/originforge/app
SH=/srv/originforge/shared
ENVF=$SH/backend.env
# Unset values keep what the server already has (so an update never undoes the domain).
cur() { grep "^$1=" "$ENVF" 2>/dev/null | cut -d= -f2- || true; }
ORIGIN=${ORIGIN:-$(cur SITE_URL)}
ORIGIN=${ORIGIN:-http://76.13.3.229}
HOSTS=${HOSTS:-$(cur DJANGO_ALLOWED_HOSTS | sed 's/,localhost,127\.0\.0\.1$//')}
HOSTS=${HOSTS:-76.13.3.229}
CSRF=${CSRF:-$(cur DJANGO_CSRF_TRUSTED_ORIGINS)}
CSRF=${CSRF:-$ORIGIN}
as_app() { sudo -u originforge -H "$@"; }

# UNPACK=1: a fresh /tmp/code.tar.gz from the PC replaces the code first.
if [ "${UNPACK:-0}" = 1 ] && [ -f /tmp/code.tar.gz ]; then
  as_app tar -xzf /tmp/code.tar.gz -C "$APP"
  echo "code unpacked"
fi

setv() {  # set KEY=VALUE in the env file (replace or append)
  local k=$1 v=$2
  if grep -q "^$k=" "$ENVF"; then sed -i "s|^$k=.*|$k=$v|" "$ENVF"; else echo "$k=$v" >> "$ENVF"; fi
}
addv() { grep -q "^$1=" "$ENVF" || echo "$1=$2" >> "$ENVF"; }  # only if absent (keeps what Younes set)

setv DJANGO_DEBUG 0
setv DJANGO_SSL_REDIRECT 0            # nginx and Cloudflare enforce HTTPS; Next calls Django over local HTTP
setv DJANGO_ALLOWED_HOSTS "$HOSTS,localhost,127.0.0.1"
setv DJANGO_CSRF_TRUSTED_ORIGINS "$CSRF"
setv SITE_URL "$ORIGIN"
setv PUBLIC_MEDIA_ORIGIN "$ORIGIN"
addv DJANGO_HSTS_SECONDS 3600         # raise to 31536000 once HTTPS is proven
addv MEDIA_ROOT /srv/originforge/media
addv PRIVATE_MEDIA_ROOT /srv/originforge/private_media
addv STATIC_ROOT /srv/originforge/static
addv PRIVATE_MEDIA_ACCEL_PREFIX /_private
addv NEXT_REVALIDATE_URL http://127.0.0.1:3000/api/revalidate
addv EMAIL_HOST smtp.gmail.com
addv EMAIL_PORT 587
addv EMAIL_USE_TLS true
addv EMAIL_HOST_USER younesoft2017@gmail.com
addv EMAIL_HOST_PASSWORD ""           # Gmail app password: Younes fills it in, then restart
addv DEFAULT_FROM_EMAIL '"OriginForge <younesoft2017@gmail.com>"'
addv STUDIO_NOTIFY_EMAIL younesoft2017@gmail.com
chown originforge:originforge "$ENVF"; chmod 600 "$ENVF"
as_app ln -sfn "$ENVF" "$APP/backend/.env"
echo "settings: $(grep -c '=' "$ENVF") keys"

cd "$APP/backend"
[ -x .venv/bin/python ] || as_app python3 -m venv .venv
as_app .venv/bin/pip install -q -U pip
as_app .venv/bin/pip install -q -r requirements.txt
echo "python deps: $(as_app .venv/bin/pip list 2>/dev/null | grep -ciE '^(django|channels|uvicorn|celery|psycopg) ') key packages"

M() { as_app .venv/bin/python manage.py "$@"; }
M migrate --noinput | tail -1
M seed_pricing >/dev/null && echo "pricing seeded"
M collectstatic --noinput | tail -1
M check --deploy 2>&1 | grep -E "^System check|WARN|ERROR|\(security" | head -12 || true
