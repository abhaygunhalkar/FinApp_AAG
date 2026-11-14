# Database backups

The whole app lives in one SQLite file on the VM, `~/FinApp_AAG/backend/finance_tracker.db`. Every night at 03:15 UTC a backup job:

1. copies it with SQLite's backup API (safe while the app is running) and checks the copy (`PRAGMA integrity_check`);
2. compresses it to `~/finapp-backups/finance_tracker-YYYY-MM-DDTHHMMZ.db.gz`, readable by your user only;
3. keeps the newest **14** copies on the VM;
4. uploads it to a private Cloud Storage bucket, which deletes copies older than **30** days.

The files contain your password hash, 2FA key and Plaid tokens, so the bucket is private and the VM may only add files to it: it can't read, list or delete them, so a broken or compromised VM can't wipe the backups.

Scripts: `backend/scripts/backup/` (`cloudshell_setup.sh`, `install_backup.sh`, `backup_db.sh`).

## Cost

Free under Google's Always Free tier: 5 GB-months of **Standard** storage in **us-east1, us-west1 or us-central1**, pooled across those regions, plus 5,000 uploads a month. Thirty compressed copies of this database are a few MB. The setup script picks the VM's region when it's one of those three, else us-central1. Google can change the free tier; see [Cloud Storage pricing](https://cloud.google.com/storage/pricing).

## Setup (one time)

**1. In Google Cloud Shell** (console, `>_` icon at the top right):

```bash
# Fetch the script from the VM's copy of the repo (works for a private repo).
# Replace VM_NAME and ZONE with the values on Compute Engine → VM instances.
gcloud compute ssh VM_NAME --zone ZONE \
  --command 'cat ~/FinApp_AAG/backend/scripts/backup/cloudshell_setup.sh' > cloudshell_setup.sh
bash cloudshell_setup.sh
```

The first `gcloud compute ssh` may ask to create an SSH key for Cloud Shell; accept the defaults. The script:

- makes the VM's external IP **static**, so a restart can't change it (no extra cost while the VM runs);
- creates the bucket `gs://finapp-backups-<project>` (Standard class, private, 30-day auto-delete);
- lets the VM's service account add files to it;
- if the VM may only read Cloud Storage (the default), asks to **stop and start the VM** with write access: about a minute of downtime. The site comes back by itself (`finapp` and nginx start at boot).

It prints the command for step 2. It's safe to run again.

**2. On the VM** (after the deploy that brought these scripts):

```bash
bash ~/FinApp_AAG/backend/scripts/backup/install_backup.sh gs://finapp-backups-<project>
```

This saves the bucket name in `~/.finapp-backup.conf`, adds the nightly cron job, and runs a first backup straight away. Check it reached the bucket in the console (Cloud Storage → Buckets).

## Checking on it

```bash
tail -5 ~/finapp-backups/backup.log   # one "backup ok" line per night
ls -lh ~/finapp-backups               # the local copies
crontab -l | grep finapp-backup       # the schedule
```

## Restoring

```bash
cd ~/FinApp_AAG/backend
sudo systemctl stop finapp
cp finance_tracker.db finance_tracker.db.before-restore      # keep the current one
gunzip -c ~/finapp-backups/finance_tracker-2026-11-14T0315Z.db.gz > finance_tracker.db
sudo systemctl start finapp
```

From the bucket instead (download in the console, or from Cloud Shell with `gcloud storage cp gs://finapp-backups-<project>/<file> .`), then copy the file to the VM and restore it the same way. Sessions are in the database too, so after a restore you sign in again.

## If something fails

- **`403` / `Access denied` on upload:** the VM's access scope is still read-only (step 1 skipped the restart) or the permission step didn't run. Run `cloudshell_setup.sh` again.
- **`gcloud: command not found` on the VM:** install the Google Cloud CLI (`sudo snap install google-cloud-cli --classic` on Ubuntu).
- **No new lines in `backup.log`:** check `crontab -l`; cron uses the VM's clock in UTC.
