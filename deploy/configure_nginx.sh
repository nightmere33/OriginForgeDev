#!/usr/bin/env bash
# Write the nginx config for one of three stages (run as root):
#   MODE=ip           the bare IP, plain HTTP (before a domain exists)
#   MODE=domain-http  the domain on HTTP only, so the first certificate can be issued
#   MODE=domain-tls   HTTPS for the domain; HTTP redirects; www -> apex; anything else dropped
# DOMAIN is required for the domain modes. Validates before reloading; a bad
# config never replaces the running one.
set -euo pipefail
MODE=${MODE:?ip, domain-http or domain-tls}
APP=/srv/originforge/app
SITE=/etc/nginx/sites-available/originforge

install -m 644 "$APP/deploy/nginx/upstreams.conf" /etc/nginx/conf.d/originforge-upstreams.conf
install -m 644 "$APP/deploy/nginx/locations.conf" /etc/nginx/snippets/originforge-locations.conf
mkdir -p /var/www/letsencrypt
rm -f /etc/nginx/sites-enabled/default

if [ "$MODE" != ip ]; then
  : "${DOMAIN:?set DOMAIN}"
  # Behind Cloudflare: log and rate-limit the real visitor, not Cloudflare's edge.
  {
    echo "# Cloudflare edge ranges, fetched $(date -u +%F). Real visitor IP from CF-Connecting-IP."
    for u in https://www.cloudflare.com/ips-v4 https://www.cloudflare.com/ips-v6; do
      curl -fsS --max-time 15 "$u" | sed '/^$/d; s/^/set_real_ip_from /; s/$/;/'
    done
    echo "real_ip_header CF-Connecting-IP;"
  } > /etc/nginx/conf.d/cloudflare-real-ip.conf.new
  grep -q set_real_ip_from /etc/nginx/conf.d/cloudflare-real-ip.conf.new && mv /etc/nginx/conf.d/cloudflare-real-ip.conf.new /etc/nginx/conf.d/cloudflare-real-ip.conf
fi

TMP=$(mktemp)
case "$MODE" in
  ip)
    cat > "$TMP" <<EOF
server {
    listen 80 default_server;
    listen [::]:80 default_server;
    server_name _;
    include snippets/originforge-locations.conf;
}
EOF
    ;;
  domain-http)
    cat > "$TMP" <<EOF
server {
    listen 80;
    listen [::]:80;
    server_name $DOMAIN www.$DOMAIN;
    include snippets/originforge-locations.conf;
}
EOF
    ;;
  domain-tls)
    CERT=/etc/letsencrypt/live/$DOMAIN
    [ -f "$CERT/fullchain.pem" ] || { echo "no certificate for $DOMAIN yet"; exit 1; }
    cat > "$TMP" <<EOF
# Anything that is not the domain (the bare IP, scanners): dropped.
server {
    listen 80 default_server;
    listen [::]:80 default_server;
    listen 443 ssl default_server;
    listen [::]:443 ssl default_server;
    ssl_reject_handshake on;
    server_name _;
    return 444;
}

server {
    listen 80;
    listen [::]:80;
    server_name $DOMAIN www.$DOMAIN;
    location ^~ /.well-known/acme-challenge/ { root /var/www/letsencrypt; default_type text/plain; }
    location / { return 301 https://$DOMAIN\$request_uri; }
}

server {
    # nginx 1.24 (Ubuntu 24.04) predates the "http2 on" directive: the listen flag is the form it knows.
    listen 443 ssl http2;
    listen [::]:443 ssl http2;
    server_name $DOMAIN www.$DOMAIN;
    ssl_certificate     $CERT/fullchain.pem;
    ssl_certificate_key $CERT/privkey.pem;
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_session_cache shared:of_ssl:10m;
    ssl_session_timeout 1d;
    if (\$host = www.$DOMAIN) { return 301 https://$DOMAIN\$request_uri; }
    include snippets/originforge-locations.conf;
}
EOF
    ;;
  *) echo "unknown MODE $MODE"; exit 1 ;;
esac

[ -f "$SITE" ] && cp "$SITE" "$SITE.bak"
install -m 644 "$TMP" "$SITE"; rm -f "$TMP"
ln -sfn "$SITE" /etc/nginx/sites-enabled/originforge
if nginx -t 2>/tmp/nginx-test.log; then
  systemctl reload nginx
  echo "nginx: $MODE active"
else
  cat /tmp/nginx-test.log
  [ -f "$SITE.bak" ] && cp "$SITE.bak" "$SITE" && nginx -t 2>/dev/null && systemctl reload nginx
  echo "nginx: config rejected, previous one kept"; exit 1
fi
