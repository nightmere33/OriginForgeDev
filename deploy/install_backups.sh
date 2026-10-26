#!/usr/bin/env bash
# Nightly backups and log retention (run as root). Re-running rewrites them.
set -euo pipefail
D=/srv/originforge/app/deploy

cat > /etc/systemd/system/originforge-backup.service <<EOF
[Unit]
Description=OriginForge nightly backup (database + client files)
After=postgresql.service

[Service]
Type=oneshot
ExecStart=/bin/bash $D/backup.sh
Nice=10
IOSchedulingClass=idle
EOF

cat > /etc/systemd/system/originforge-backup.timer <<'EOF'
[Unit]
Description=OriginForge nightly backup

[Timer]
OnCalendar=*-*-* 03:30:00 UTC
RandomizedDelaySec=10m
Persistent=true

[Install]
WantedBy=timers.target
EOF

# System logs (the services' output) kept at most 90 days, as the privacy policy says.
# nginx access logs rotate daily and keep 14 (Ubuntu default), well inside that.
mkdir -p /etc/systemd/journald.conf.d
cat > /etc/systemd/journald.conf.d/originforge.conf <<'EOF'
[Journal]
MaxRetentionSec=90day
SystemMaxUse=1G
EOF
systemctl restart systemd-journald

systemctl daemon-reload
systemctl enable --now originforge-backup.timer >/dev/null 2>&1
systemctl list-timers originforge-backup.timer --no-legend | awk '{print "next backup:", $1, $2, $3}'
