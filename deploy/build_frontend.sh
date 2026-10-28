#!/usr/bin/env bash
# Build the website on the VPS and restart it (run as root). The build renders
# pages against the local Django, so Django must be up. NEXT_PUBLIC_* values
# are baked in from /srv/originforge/shared/frontend.env (install_services.sh).
set -euo pipefail
F=/srv/originforge/app/frontend
cd "$F"
# New or changed packages: install exactly what package-lock.json says, only
# when it changed since the last install (its checksum is kept beside them).
# The running site is not affected: the standalone server has its own copy.
LOCK_SUM=$(sha256sum package-lock.json | cut -d' ' -f1)
if [ ! -d node_modules ] || [ "$(cat node_modules/.lock-sum 2>/dev/null)" != "$LOCK_SUM" ]; then
  if ! sudo -u originforge -H bash -c "cd $F && npm ci --no-audit --no-fund > /tmp/npmci.log 2>&1"; then
    tail -30 /tmp/npmci.log
    echo "npm ci failed: the running site is unchanged"
    exit 1
  fi
  echo "$LOCK_SUM" | sudo -u originforge tee node_modules/.lock-sum > /dev/null
  echo "node packages installed ($(ls node_modules | wc -l) top-level)"
fi
# Next keeps fetched API answers between builds (.next/cache/fetch-cache): a
# build must render today's content and settings, never a previous build's.
rm -rf "$F/.next/cache/fetch-cache"
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
