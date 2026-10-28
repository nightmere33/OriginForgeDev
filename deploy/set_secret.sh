#!/usr/bin/env bash
# Save one setting (an API key, a secret) in the server's settings file
# without it ever showing on screen. Run as root on the VPS:
#   bash set_secret.sh CHARGILY_SECRET_KEY
# It asks for the value (typing and pasting stay hidden), replaces any old
# value, keeps the file private and restarts what reads it.
set -euo pipefail
NAME=${1:?usage: set_secret.sh NAME   (for example CHARGILY_SECRET_KEY)}
[[ $NAME =~ ^[A-Z][A-Z0-9_]*$ ]] || { echo "the name looks like CHARGILY_SECRET_KEY (capitals, digits, _)"; exit 1; }
ENVF=/srv/originforge/shared/backend.env
[ -f "$ENVF" ] || { echo "no $ENVF here: run this on the VPS"; exit 1; }

read -rsp "$NAME (hidden: paste, then Enter): " VALUE; echo
[ -n "$VALUE" ] || { echo "nothing pasted, nothing saved"; exit 1; }
[[ $VALUE != *[[:space:]]* ]] || { echo "the value has a space or a line break: copy it again"; exit 1; }

sed -i "/^$NAME=/d" "$ENVF"
printf '%s=%s\n' "$NAME" "$VALUE" >> "$ENVF"
chown originforge:originforge "$ENVF"
chmod 600 "$ENVF"
echo "$NAME saved (${#VALUE} characters)"
unset VALUE

systemctl restart originforge-django originforge-worker originforge-beat
echo "Django and the workers restarted with it"
