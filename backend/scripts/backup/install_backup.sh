#!/usr/bin/env bash
# Run once ON THE VM, after cloudshell_setup.sh (see docs/backup.md):
#   bash ~/FinApp_AAG/backend/scripts/backup/install_backup.sh gs://YOUR-BUCKET
# Saves the bucket name, schedules the nightly backup, and runs it once now.
set -euo pipefail

BUCKET="${1:-}"
SCRIPT="$(cd "$(dirname "$0")" && pwd)/backup_db.sh"
LOG="$HOME/finapp-backups/backup.log"
chmod +x "$SCRIPT"
mkdir -p "$HOME/finapp-backups"

if [ -n "$BUCKET" ]; then
  case "$BUCKET" in gs://*) ;; *) echo "The bucket must look like gs://name" >&2; exit 1 ;; esac
  command -v gcloud >/dev/null || { echo "gcloud isn't installed on this VM" >&2; exit 1; }
  umask 077
  echo "BUCKET=$BUCKET" > "$HOME/.finapp-backup.conf"
else
  echo "No bucket given: backups will stay on this VM only."
fi

# Every night at 03:15 UTC. Replaces an earlier FinApp entry, keeps others.
{ crontab -l 2>/dev/null | grep -v '# finapp-backup' || true
  echo "15 3 * * * $SCRIPT >> $LOG 2>&1 # finapp-backup"
} | crontab -
echo "Scheduled: $(crontab -l | grep '# finapp-backup')"

echo "Running the first backup now..."
"$SCRIPT" | tee -a "$LOG"
ls -lh "$HOME/finapp-backups"
