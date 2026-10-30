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
  # npm ci replaces node_modules as the app user: anything root left there is handed over first.
  [ -d node_modules ] && chown -R originforge:originforge node_modules
  # A fresh log owned by the app user (an old root-owned file in /tmp can't be overwritten).
  NPM_LOG=$(sudo -u originforge mktemp /tmp/of-npmci.XXXXXX)
  if ! sudo -u originforge -H bash -c "cd $F && npm ci --no-audit --no-fund > $NPM_LOG 2>&1"; then
    tail -30 "$NPM_LOG"
    echo "npm ci failed: the running site is unchanged"
    exit 1
  fi
  echo "$LOCK_SUM" | sudo -u originforge tee node_modules/.lock-sum > /dev/null
  echo "node packages installed ($(ls node_modules | wc -l) top-level)"
fi
# Next keeps fetched API answers between builds (.next/cache/fetch-cache): a
# build must render today's content and settings, never a previous build's.
rm -rf "$F/.next/cache/fetch-cache"
# Older installs ran the site straight from .next/standalone, which the build
# empties: such a server is stopped for the build (once; later it runs from
# its own release folder and stays up).
PID=$(systemctl show -p MainPID --value originforge-next 2>/dev/null || echo 0)
if [ "${PID:-0}" != "0" ] && readlink "/proc/$PID/cwd" 2>/dev/null | grep -q "/frontend/.next/standalone"; then
  echo "the site runs from the build output: stopped while it builds"
  systemctl stop originforge-next
fi
BUILD_LOG=$(sudo -u originforge mktemp /tmp/of-nextbuild.XXXXXX)
if ! sudo -u originforge -H bash -c "NEXT_TELEMETRY_DISABLED=1 npm run build > $BUILD_LOG 2>&1"; then
  tail -40 "$BUILD_LOG"
  echo "build failed: the running site is unchanged only if .next was not touched; check it"
  exit 1
fi
# The site runs from its own release folder, never from the build output: a
# build rewrites .next/standalone while the running server writes its page
# cache there, and the two must not meet. The release is assembled beside
# the live one, swapped in, and the old one kept until the new one answers.
#
# Earlier builds' chunks stay served for 14 days (their names are hashed, so
# nothing clashes): a tab opened before this deploy still finds the code it
# asks for when it navigates, instead of failing on a missing chunk.
R=/srv/originforge
KEEP=$R/shared/next-static
install -d -o originforge -g originforge "$KEEP"
rm -rf "$R/next-new"
sudo -u originforge bash -c "cp -r $F/.next/static/. $KEEP/ \
  && { find $KEEP -type f -mtime +14 -delete; find $KEEP -mindepth 1 -type d -empty -delete; true; } \
  && cp -a $F/.next/standalone $R/next-new && rm -rf $R/next-new/.next/static $R/next-new/public \
  && cp -r $KEEP $R/next-new/.next/static && cp -r $F/public $R/next-new/public"
rm -rf "$R/next-old"
[ -d "$R/next-live" ] && mv "$R/next-live" "$R/next-old"
mv "$R/next-new" "$R/next-live"
systemctl restart originforge-next
sleep 4
CODE=$(curl -s -o /dev/null -w "%{http_code}" --max-time 30 http://127.0.0.1:3000/en || true)
if [ "$CODE" != "200" ] && [ -d "$R/next-old" ]; then
  echo "next /en -> $CODE: back to the previous release"
  rm -rf "$R/next-live" && mv "$R/next-old" "$R/next-live"
  systemctl restart originforge-next
  exit 1
fi
rm -rf "$R/next-old"
curl -s -o /dev/null -w "next /en -> %{http_code} (%{time_total}s)\n" http://127.0.0.1:3000/en
