#!/usr/bin/env bash
# SSH by key only: no passwords, root only with a key, no X11. Run as root,
# from a session you keep open until a NEW window has logged in with the key.
#   bash ssh_keys_only.sh
# Undo: rm /etc/ssh/sshd_config.d/00-originforge.conf && systemctl reload ssh
set -euo pipefail
KEYS=/root/.ssh/authorized_keys
grep -qE '^(ssh-(ed25519|rsa)|ecdsa-sha2-)' "$KEYS" 2>/dev/null || { echo "no key in $KEYS: stopping (you would be locked out)"; exit 1; }

# sshd keeps the first value it reads and reads sshd_config.d in name order;
# 50-cloud-init.conf turns passwords on, so this file sorts before it.
cat > /etc/ssh/sshd_config.d/00-originforge.conf <<'EOF'
# OriginForge: key-only SSH (deploy/ssh_keys_only.sh)
PasswordAuthentication no
KbdInteractiveAuthentication no
PermitRootLogin prohibit-password
X11Forwarding no
MaxAuthTries 3
EOF

if ! sshd -t; then
  rm -f /etc/ssh/sshd_config.d/00-originforge.conf
  echo "sshd refused the settings: removed them, nothing changed"; exit 1
fi
systemctl reload ssh
echo "now in force:"
sshd -T | grep -E '^(passwordauthentication|kbdinteractiveauthentication|permitrootlogin|x11forwarding|maxauthtries) '
echo
echo "Keep this window open. In a NEW window run: ssh root@76.13.3.229"
echo "It must log you in without a password. Only then close this one."
