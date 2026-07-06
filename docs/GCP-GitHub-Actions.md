# GitHub Actions CI/CD Setup — Command Reference

## Overview

Every push to `main` triggers an automated deployment:
- **Backend changes** → pulls latest code, installs dependencies, restarts FastAPI
- **Frontend changes** → builds React on GitHub, copies dist to VM, reloads nginx
- **No changes** in a folder → that deployment is skipped

## Phase 1 — Generate SSH Key on VM

```bash
# Generate a dedicated SSH key pair for GitHub Actions
ssh-keygen -t ed25519 -C "github-actions" -f ~/.ssh/github_actions -N ""

# Add public key to authorized keys
cat ~/.ssh/github_actions.pub >> ~/.ssh/authorized_keys

# Print private key (copy this for GitHub secrets)
cat ~/.ssh/github_actions
```

## Phase 2 — Add GitHub Secrets

Go to your repo → **Settings** → **Secrets and variables** → **Actions** → **New repository secret**

| Secret Name | Value |
|---|---|
| `GCP_SSH_PRIVATE_KEY` | Contents of `~/.ssh/github_actions` (private key) |
| `GCP_VM_IP` | Your VM external IP (e.g. `35.209.242.92`) |
| `GCP_VM_USER` | Your VM Linux username (run `whoami` on VM) |

## Phase 3 — Allow Passwordless sudo for Deployment Commands

```bash
sudo visudo
```

Add this line at the end — replace `YOUR_USERNAME`:

```
YOUR_USERNAME ALL=(ALL) NOPASSWD: /bin/systemctl restart finapp, /bin/systemctl reload nginx, /bin/chmod
```

Save with `CTRL+X` → `Y` → `Enter`

## Phase 4 — Create Workflow File

Create `.github/workflows/deploy.yml` in your repo root:

```yaml
name: Deploy to GCP

on:
  push:
    branches:
      - main

jobs:
  deploy-backend:
    name: Deploy Backend
    runs-on: ubuntu-latest
    steps:
      - name: Checkout code
        uses: actions/checkout@v4
        with:
          fetch-depth: 2

      - name: Check for backend changes
        id: backend-changes
        run: |
          if git diff --name-only HEAD~1 HEAD | grep -q "^backend/"; then
            echo "changed=true" >> $GITHUB_OUTPUT
          else
            echo "changed=false" >> $GITHUB_OUTPUT
          fi

      - name: Deploy backend to VM
        if: steps.backend-changes.outputs.changed == 'true'
        uses: appleboy/ssh-action@v1.0.3
        with:
          host: ${{ secrets.GCP_VM_IP }}
          username: ${{ secrets.GCP_VM_USER }}
          key: ${{ secrets.GCP_SSH_PRIVATE_KEY }}
          script: |
            cd ~/FinApp_AAG/backend
            git pull origin main
            source venv/bin/activate
            pip install .
            sudo systemctl restart finapp

  deploy-frontend:
    name: Build and Deploy Frontend
    runs-on: ubuntu-latest
    steps:
      - name: Checkout code
        uses: actions/checkout@v4
        with:
          fetch-depth: 2

      - name: Check for frontend changes
        id: frontend-changes
        run: |
          if git diff --name-only HEAD~1 HEAD | grep -q "^frontend/"; then
            echo "changed=true" >> $GITHUB_OUTPUT
          else
            echo "changed=false" >> $GITHUB_OUTPUT
          fi

      - name: Setup Node.js
        if: steps.frontend-changes.outputs.changed == 'true'
        uses: actions/setup-node@v4
        with:
          node-version: '20'

      - name: Install dependencies
        if: steps.frontend-changes.outputs.changed == 'true'
        working-directory: frontend
        run: npm install

      - name: Build frontend
        if: steps.frontend-changes.outputs.changed == 'true'
        working-directory: frontend
        run: npm run build

      - name: Copy dist to VM
        if: steps.frontend-changes.outputs.changed == 'true'
        uses: appleboy/scp-action@v0.1.7
        with:
          host: ${{ secrets.GCP_VM_IP }}
          username: ${{ secrets.GCP_VM_USER }}
          key: ${{ secrets.GCP_SSH_PRIVATE_KEY }}
          source: "frontend/dist/*"
          target: ~/FinApp_AAG/frontend/dist
          strip_components: 2

      - name: Fix permissions and reload nginx
        if: steps.frontend-changes.outputs.changed == 'true'
        uses: appleboy/ssh-action@v1.0.3
        with:
          host: ${{ secrets.GCP_VM_IP }}
          username: ${{ secrets.GCP_VM_USER }}
          key: ${{ secrets.GCP_SSH_PRIVATE_KEY }}
          script: |
            sudo chmod -R o+r ~/FinApp_AAG/frontend/dist
            sudo systemctl reload nginx
```

## Repo Structure

```
FinApp_AAG/
├── .github/
│   └── workflows/
│       └── deploy.yml      ← workflow file
├── backend/
├── frontend/
├── .gitignore
└── README.md
```

## Commit and Push

```bash
git add .github/workflows/deploy.yml
git commit -m "add github actions deployment workflow"
git push
```

## Monitor Deployments

Go to: `https://github.com/YOUR_USERNAME/FinApp_AAG/actions`

## Manual Deployment (if needed)

If you ever need to deploy manually without GitHub Actions:

```bash
# Backend
cd ~/FinApp_AAG/backend
git pull origin main
source venv/bin/activate
pip install .
sudo systemctl restart finapp

# Frontend (build locally and push, or on VM)
cd ~/FinApp_AAG/frontend
npm install
npm run build
sudo chmod -R o+r ~/FinApp_AAG/frontend/dist
sudo systemctl reload nginx
```
