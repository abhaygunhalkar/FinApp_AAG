#!/usr/bin/env bash
# Nightly backup of the FinApp SQLite database (see docs/backup.md).
#
# Makes a consistent copy with SQLite's backup API (safe while the app is
# running), checks it, compresses it, keeps the newest $KEEP copies here, and
# uploads it to $BUCKET when that is set in ~/.finapp-backup.conf.
set -euo pipefail

APP_DIR="${APP_DIR:-$HOME/FinApp_AAG/backend}"
DB="${DB:-$APP_DIR/finance_tracker.db}"
BACKUP_DIR="${BACKUP_DIR:-$HOME/finapp-backups}"
KEEP="${KEEP:-14}"
BUCKET="${BUCKET:-}"
# shellcheck disable=SC1091
[ -f "$HOME/.finapp-backup.conf" ] && . "$HOME/.finapp-backup.conf"

[ -f "$DB" ] || { echo "No database at $DB" >&2; exit 1; }
mkdir -p "$BACKUP_DIR"
chmod 700 "$BACKUP_DIR"
umask 077  # backups hold password hashes and Plaid tokens: owner-only

# One name per run, to the minute, so a second run never overwrites one.
name="finance_tracker-$(date -u +%Y-%m-%dT%H%MZ).db"
tmp="$BACKUP_DIR/.$name.tmp"
trap 'rm -f "$tmp"' EXIT

python3 - "$DB" "$tmp" <<'PY'
import sqlite3
import sys

source = sqlite3.connect(f"file:{sys.argv[1]}?mode=ro", uri=True)
target = sqlite3.connect(sys.argv[2])
source.backup(target)
result = target.execute("PRAGMA integrity_check").fetchone()[0]
target.close()
source.close()
if result != "ok":
    sys.exit(f"Backup failed its integrity check: {result}")
PY

gzip -c "$tmp" > "$BACKUP_DIR/$name.gz"
rm -f "$tmp"

# Keep the newest $KEEP copies on this machine.
ls -1t "$BACKUP_DIR"/finance_tracker-*.db.gz | tail -n +"$((KEEP + 1))" | while read -r old; do
  rm -f -- "$old"
done

if [ -n "$BUCKET" ]; then
  gcloud storage cp "$BACKUP_DIR/$name.gz" "$BUCKET/" --quiet
  echo "$(date -u +%FT%TZ) backup ok: $name.gz (also in $BUCKET)"
else
  echo "$(date -u +%FT%TZ) backup ok: $name.gz (no BUCKET set, local copy only)"
fi
