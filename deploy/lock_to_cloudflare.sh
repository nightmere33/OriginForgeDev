#!/usr/bin/env bash
# Web ports (80, 443) answer Cloudflare only, so nobody can skip its
# protection by calling the server's IP directly. SSH stays as it is.
# Run as root; safe to run again (it refreshes the ranges).
#   bash lock_to_cloudflare.sh
# Undo: ufw allow 80/tcp && ufw allow 443/tcp
set -euo pipefail
V4=$(curl -fsS --max-time 20 https://www.cloudflare.com/ips-v4)
V6=$(curl -fsS --max-time 20 https://www.cloudflare.com/ips-v6)
n4=$(grep -c . <<<"$V4" || true); n6=$(grep -c . <<<"$V6" || true)
# Without the list, closing the ports would take the site down: stop first.
if [ "$n4" -lt 5 ] || [ "$n6" -lt 3 ]; then echo "Cloudflare's list didn't download ($n4 IPv4, $n6 IPv6): nothing changed"; exit 1; fi

# Cloudflare first, then close the open rules: the site never goes dark.
for ip in $V4 $V6; do ufw allow proto tcp from "$ip" to any port 80,443 comment Cloudflare >/dev/null; done
ufw delete allow 80/tcp >/dev/null 2>&1 || true
ufw delete allow 443/tcp >/dev/null 2>&1 || true
echo "web ports open to $n4 IPv4 and $n6 IPv6 Cloudflare ranges only"
echo "still open to everyone (only SSH should be listed):"
ufw status | grep ALLOW | grep -v Cloudflare || true
