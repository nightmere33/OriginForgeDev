#!/usr/bin/env bash
# systemd units for OriginForge (run as root). Re-running rewrites them.
#   originforge-django  ASGI (HTTP + the live WebSocket) on 127.0.0.1:8000
#   originforge-worker  Celery: e-mails, media processing, revalidation pings
#   originforge-beat    Celery beat: reminders, expiry, exchange rates
#   originforge-next    the website on 127.0.0.1:3000
set -euo pipefail
APP=/srv/originforge/app
SH=/srv/originforge/shared
ORIGIN=${ORIGIN:-http://76.13.3.229}

# Frontend settings (build and runtime). The revalidation secret is copied from
# the backend file, never printed.
SECRET=$(grep '^NEXT_REVALIDATE_SECRET=' "$SH/backend.env" | cut -d= -f2-)
umask 077
cat > "$SH/frontend.env" <<EOF
NODE_ENV=production
INTERNAL_API_ORIGIN=http://127.0.0.1:8000
NEXT_PUBLIC_SITE_URL=$ORIGIN
NEXT_PUBLIC_MEDIA_ORIGIN=$ORIGIN
NEXT_PUBLIC_DISABLE_REACT_DEVTOOLS=1
NEXT_REVALIDATE_SECRET=$SECRET
PORT=3000
HOSTNAME=127.0.0.1
EOF
chown originforge:originforge "$SH/frontend.env"
sudo -u originforge ln -sfn "$SH/frontend.env" "$APP/frontend/.env.production"
umask 022

common='User=originforge
Group=originforge
Restart=always
RestartSec=3
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=full
ProtectKernelTunables=true
ProtectControlGroups=true'

cat > /etc/systemd/system/originforge-django.service <<EOF
[Unit]
Description=OriginForge Django (ASGI)
After=network.target postgresql.service redis-server.service
Requires=postgresql.service redis-server.service

[Service]
WorkingDirectory=$APP/backend
ExecStart=$APP/backend/.venv/bin/uvicorn config.asgi:application --host 127.0.0.1 --port 8000 --workers 2 --proxy-headers --forwarded-allow-ips 127.0.0.1 --no-server-header
$common

[Install]
WantedBy=multi-user.target
EOF

cat > /etc/systemd/system/originforge-worker.service <<EOF
[Unit]
Description=OriginForge Celery worker
After=network.target redis-server.service postgresql.service

[Service]
WorkingDirectory=$APP/backend
ExecStart=$APP/backend/.venv/bin/celery -A config worker -l info --concurrency 1 --max-tasks-per-child 50
$common

[Install]
WantedBy=multi-user.target
EOF

cat > /etc/systemd/system/originforge-beat.service <<EOF
[Unit]
Description=OriginForge Celery beat
After=network.target redis-server.service

[Service]
WorkingDirectory=$APP/backend
ExecStart=$APP/backend/.venv/bin/celery -A config beat -l info --schedule $SH/celerybeat-schedule
$common

[Install]
WantedBy=multi-user.target
EOF

cat > /etc/systemd/system/originforge-next.service <<EOF
[Unit]
Description=OriginForge website (Next.js)
After=network.target originforge-django.service

[Service]
WorkingDirectory=$APP/frontend/.next/standalone
EnvironmentFile=$SH/frontend.env
ExecStart=/usr/local/bin/node server.js
$common

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable --now originforge-django originforge-worker originforge-beat >/dev/null 2>&1
systemctl enable originforge-next >/dev/null 2>&1   # started after the first build
sleep 4
for s in originforge-django originforge-worker originforge-beat; do printf "%-20s %s\n" $s "$(systemctl is-active $s)"; done
curl -s -o /dev/null -w "django /api/health/ -> %{http_code}\n" -H "Host: 76.13.3.229" http://127.0.0.1:8000/api/health/
