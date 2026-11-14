#!/usr/bin/env bash
# Run once IN GOOGLE CLOUD SHELL (console, ">_" icon at the top right):
#   bash cloudshell_setup.sh
# 1. Makes the VM's external IP static (a restart can't change it any more).
# 2. Creates a private, Standard-class backup bucket in a free-tier region,
#    which deletes copies older than 30 days by itself.
# 3. Lets the VM add files to that bucket (but not read or delete them).
# 4. If the VM may only read Cloud Storage, asks to restart it (~1 minute
#    of downtime) with write access.
# Safe to run again: each step skips what's already done.
set -euo pipefail

FREE_REGIONS="us-east1 us-west1 us-central1"
PROJECT="$(gcloud config get-value project 2>/dev/null)"
[ -n "$PROJECT" ] || { echo "No project selected: run 'gcloud config set project ID'" >&2; exit 1; }

VM="${VM:-}"
ZONE="${ZONE:-}"
if [ -z "$VM" ]; then
  mapfile -t vms < <(gcloud compute instances list --format="value(name,zone.basename())")
  if [ "${#vms[@]}" -ne 1 ]; then
    echo "Found ${#vms[@]} VMs. Run again as: VM=name ZONE=zone bash cloudshell_setup.sh" >&2
    exit 1
  fi
  read -r VM ZONE <<< "${vms[0]}"
fi
REGION="${ZONE%-*}"
echo "Project $PROJECT, VM $VM in $ZONE"

describe() { gcloud compute instances describe "$VM" --zone "$ZONE" --format="value($1)"; }

# 1. Static IP
IP="$(describe 'networkInterfaces[0].accessConfigs[0].natIP')"
if gcloud compute addresses list --filter="address=$IP" --format="value(name)" | grep -q .; then
  echo "1. IP $IP is already static."
else
  gcloud compute addresses create finapp-ip --addresses="$IP" --region="$REGION"
  echo "1. IP $IP is now static (named finapp-ip)."
fi

# 2. Bucket, in the VM's region when that's free, else us-central1
BUCKET_REGION="$REGION"
case " $FREE_REGIONS " in
  *" $REGION "*) ;;
  *) BUCKET_REGION="us-central1"
     echo "   The VM's region $REGION has no free storage; the bucket goes in us-central1." ;;
esac
BUCKET="gs://finapp-backups-$PROJECT"
if gcloud storage buckets describe "$BUCKET" >/dev/null 2>&1; then
  echo "2. Bucket $BUCKET already exists."
else
  gcloud storage buckets create "$BUCKET" \
    --location="$BUCKET_REGION" \
    --default-storage-class=STANDARD \
    --uniform-bucket-level-access \
    --public-access-prevention
  echo "2. Created $BUCKET in $BUCKET_REGION."
fi
lifecycle="$(mktemp)"
echo '{"rule": [{"action": {"type": "Delete"}, "condition": {"age": 30}}]}' > "$lifecycle"
gcloud storage buckets update "$BUCKET" --lifecycle-file="$lifecycle" >/dev/null
rm -f "$lifecycle"
echo "   Copies older than 30 days are deleted automatically."

# 3. The VM may add files, nothing more
SA="$(describe 'serviceAccounts[0].email')"
[ -n "$SA" ] || { echo "The VM has no service account; see docs/backup.md" >&2; exit 1; }
gcloud storage buckets add-iam-policy-binding "$BUCKET" \
  --member="serviceAccount:$SA" --role="roles/storage.objectCreator" >/dev/null
echo "3. $SA can upload to the bucket (it can't read or delete)."

# 4. Access scope
SCOPES="$(describe 'serviceAccounts[0].scopes' | tr ';' ',')"
if echo "$SCOPES" | grep -qE 'devstorage\.(read_write|full_control)|cloud-platform'; then
  echo "4. The VM can already write to Cloud Storage."
else
  echo "4. The VM can only read Cloud Storage. Fixing that needs a stop and start"
  echo "   (about a minute of downtime; the IP stays the same now)."
  read -r -p "   Restart the VM now? [y/N] " answer
  if [ "${answer,,}" = "y" ]; then
    NEW_SCOPES="$(echo "$SCOPES" | sed 's#devstorage\.read_only#devstorage.read_write#')"
    echo "$NEW_SCOPES" | grep -q 'devstorage.read_write' \
      || NEW_SCOPES="$NEW_SCOPES,https://www.googleapis.com/auth/devstorage.read_write"
    gcloud compute instances stop "$VM" --zone "$ZONE"
    gcloud compute instances set-service-account "$VM" --zone "$ZONE" \
      --service-account "$SA" --scopes="$NEW_SCOPES"
    gcloud compute instances start "$VM" --zone "$ZONE"
    echo "   Done: the VM is back up with write access."
  else
    echo "   Skipped. Run this script again when you're ready."
    exit 0
  fi
fi

echo
echo "Next, SSH to the VM and run:"
echo "  bash ~/FinApp_AAG/backend/scripts/backup/install_backup.sh $BUCKET"
