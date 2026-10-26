#!/usr/bin/env bash
# Nightly backup (systemd timer originforge-backup, 03:30 UTC), kept 14 days:
#   originforge-<stamp>.dump      the database (pg_dump custom format)
#   private-<stamp>.tar.gz        client attachments and receipts
# Public work media is not here: it is rebuilt from the PC (build_media.py).
#
# A dump only counts once it is checked: pg_restore must read its whole table
# of contents, and it must not be less than half the previous one (a dump of
# an emptied database is still a valid file). A failed check keeps the file
# aside as *.bad and exits non-zero, so the timer shows as failed.
#
# Restore: pg_restore --clean --if-exists -d originforge <file>.dump (as originforge).
# Off-site copy: to add (Cloudflare R2, as in the MediGate kit).
set -euo pipefail
cd /
umask 077
B=/srv/originforge/backups
STAMP=$(date -u +%Y%m%d-%H%M)
DB="$B/originforge-$STAMP.dump"
PREV=$(ls -1t "$B"/originforge-*.dump 2>/dev/null | head -1 || true)

runuser -u originforge -- pg_dump -Fc -d originforge > "$DB"
if ! pg_restore --list "$DB" > /dev/null; then
  mv "$DB" "$DB.bad"; echo "backup: dump unreadable, kept as $DB.bad" >&2; exit 1
fi
if [ -n "$PREV" ] && [ "$(stat -c %s "$DB")" -lt $(( $(stat -c %s "$PREV") / 2 )) ]; then
  mv "$DB" "$DB.bad"; echo "backup: dump shrank by more than half, kept as $DB.bad" >&2; exit 1
fi
tar -czf "$B/private-$STAMP.tar.gz" -C /srv/originforge private_media

# 14 days, so nothing deleted from the site survives in a backup beyond 30 (privacy policy).
find "$B" -maxdepth 1 \( -name "originforge-*.dump" -o -name "private-*.tar.gz" \) -mmin +$((14 * 24 * 60)) -delete
echo "backup: $(basename "$DB") $(du -h "$DB" | cut -f1), private files $(du -h "$B/private-$STAMP.tar.gz" | cut -f1); $(ls "$B"/originforge-*.dump | wc -l) kept"
