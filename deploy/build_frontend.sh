#!/usr/bin/env bash
# Build the website on the VPS and restart it (run as root). The build renders
# pages against the local Django, so Django must be up. NEXT_PUBLIC_* values
# are baked in from /srv/originforge/shared/frontend.env (install_services.sh).
set -euo pipefail
F=/srv/originforge/app/frontend
cd "$F"
if ! sudo -u originforge -H bash -c "NEXT_TELEMETRY_DISABLED=1 npm run build > /tmp/nextbuild.log 2>&1"; then
  tail -40 /tmp/nextbuild.log
  echo "build failed: the running site is unchanged only if .next was not touched; check it"
  exit 1
fi
# Standalone output needs the static assets and public/ beside server.js.
sudo -u originforge bash -c "rm -rf $F/.next/standalone/.next/static $F/.next/standalone/public \
  && cp -r $F/.next/static $F/.next/standalone/.next/static && cp -r $F/public $F/.next/standalone/public"
systemctl restart originforge-next
sleep 4
curl -s -o /dev/null -w "next /en -> %{http_code} (%{time_total}s)\n" http://127.0.0.1:3000/en
