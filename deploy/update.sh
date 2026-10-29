#!/usr/bin/env bash
# Ship new code (run as root after uploading /tmp/code.tar.gz from the PC):
# unpack, migrate, collect static files, rebuild the site, restart everything.
# Settings and the domain stay as they are.
#
# Run it from the archive, not from the app folder (the unpack replaces the
# scripts, and bash reads a script while it runs):
#   tar -xzOf /tmp/code.tar.gz deploy/update.sh > /tmp/of-update.sh && bash /tmp/of-update.sh
set -euo pipefail
APP=/srv/originforge/app
D=$APP/deploy
[ -f /tmp/code.tar.gz ] || { echo "upload /tmp/code.tar.gz first"; exit 1; }

# 1. New code first, so every script below is the new version.
sudo -u originforge -H tar -xzf /tmp/code.tar.gz -C "$APP"
echo "code unpacked"

# The location rules travel with the code (the server blocks, domain and
# certificate stay). A rule nginx rejects never replaces the running one.
SNIPPET=/etc/nginx/snippets/originforge-locations.conf
if [ -f "$SNIPPET" ] && ! cmp -s "$D/nginx/locations.conf" "$SNIPPET"; then
  cp "$SNIPPET" /tmp/of-locations.bak
  install -m 644 "$D/nginx/locations.conf" "$SNIPPET"
  if nginx -t 2>/dev/null; then systemctl reload nginx; echo "nginx locations updated"
  else cp /tmp/of-locations.bak "$SNIPPET"; echo "nginx rejected the new locations; kept the old ones"; fi
fi

# 2. Each step runs from disk, fresh; with no ORIGIN given they keep the current address.
bash "$D/setup_backend.sh"
bash "$D/install_services.sh" >/dev/null
systemctl restart originforge-django originforge-worker originforge-beat
sleep 4
bash "$D/build_frontend.sh"
rm -f /tmp/code.tar.gz

# 3. Through this server's own nginx and certificate (not via Cloudflare).
ORIGIN=$(grep '^SITE_URL=' /srv/originforge/shared/backend.env | cut -d= -f2-)
HOST=${ORIGIN#https://}; HOST=${HOST#http://}
UA="Mozilla/5.0 (OriginForge update check) Chrome/150.0"
for p in /en /en/login /api/health/; do
  curl -s -o /dev/null -A "$UA" --resolve "$HOST:443:127.0.0.1" -w "%{http_code} $p\n" --max-time 30 "$ORIGIN$p" || echo "failed $p"
done
