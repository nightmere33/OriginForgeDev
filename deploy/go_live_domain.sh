#!/usr/bin/env bash
# Move OriginForge from the bare IP to its domain (run as root on the VPS, once
# the domain's DNS is on Cloudflare and points here):
#
#   DOMAIN=originforgedev.com EMAIL=younesoft2017@gmail.com bash go_live_domain.sh
#
# EMAIL is where Let's Encrypt writes about certificate expiry (accepting its
# subscriber agreement is part of issuing the certificate).
set -euo pipefail
: "${DOMAIN:?set DOMAIN}"
: "${EMAIL:?set EMAIL}"
D=/srv/originforge/app/deploy

echo "== 1. does the domain reach this server?"
MODE=domain-http DOMAIN="$DOMAIN" bash "$D/configure_nginx.sh"
CH=/var/www/letsencrypt/.well-known/acme-challenge
mkdir -p "$CH"
TOKEN=$(openssl rand -hex 8)
echo ok > "$CH/$TOKEN"
for h in "$DOMAIN" "www.$DOMAIN"; do
  got=$(curl -s --max-time 15 -A "OriginForge-golive" "http://$h/.well-known/acme-challenge/$TOKEN" || true)
  if [ "$got" != ok ]; then
    rm -f "$CH/$TOKEN"
    echo "$h does not reach this server yet (DNS not active, record missing, or 'Always Use HTTPS' is on)."
    exit 1
  fi
  echo "$h -> this server"
done
rm -f "$CH/$TOKEN"

echo "== 2. certificate (Let's Encrypt, webroot: renewals work over HTTP and HTTPS)"
certbot certonly --webroot -w /var/www/letsencrypt -d "$DOMAIN" -d "www.$DOMAIN" \
  --agree-tos -m "$EMAIL" --no-eff-email -n --deploy-hook "systemctl reload nginx"
MODE=domain-tls DOMAIN="$DOMAIN" bash "$D/configure_nginx.sh"

echo "== 3. the app learns its address"
ORIGIN="https://$DOMAIN" HOSTS="$DOMAIN,www.$DOMAIN" CSRF="https://$DOMAIN,https://www.$DOMAIN" bash "$D/setup_backend.sh"
ORIGIN="https://$DOMAIN" bash "$D/install_services.sh"
systemctl restart originforge-django originforge-worker originforge-beat
sleep 4
bash "$D/build_frontend.sh"

echo "== 4. through the public name"
UA="Mozilla/5.0 (OriginForge go-live check) Chrome/150.0"
for p in /en /api/health/ /api/content/galaxy/; do
  curl -s -o /dev/null -A "$UA" -w "%{http_code} $p\n" --max-time 30 "https://$DOMAIN$p"
done
curl -s -o /dev/null -A "$UA" -w "http -> %{http_code} %{redirect_url}\n" "http://$DOMAIN/en"
curl -s -o /dev/null -A "$UA" -w "www -> %{http_code} %{redirect_url}\n" "https://www.$DOMAIN/en"
echo "Now in Cloudflare: SSL/TLS mode Full (strict), Always Use HTTPS on."
