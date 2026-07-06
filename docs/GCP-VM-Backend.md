# GCP VM Backend Setup — Command Reference

## Phase 1 — System Setup

```bash
# Update system packages
sudo apt update && sudo apt upgrade -y

# Install Python, pip, nginx, and git
sudo apt install python3-pip python3-venv nginx git -y

# Verify installations
python3 --version && nginx -v && git --version
```

## Phase 2 — Python 3.11 Installation

```bash
# Install stable Python 3.11 via deadsnakes PPA
sudo add-apt-repository ppa:deadsnakes/ppa -y
sudo apt update
sudo apt install python3.11 python3.11-venv -y

# Verify Python version
python3.11 --version
# Expected: Python 3.11.15
```

## Phase 3 — Clone Repo and Setup Virtual Environment

```bash
# Clone your GitHub repo
git clone https://github.com/YOUR_USERNAME/FinApp_AAG.git

# Navigate into backend folder
cd FinApp_AAG/backend

# Create virtual environment using Python 3.11
python3.11 -m venv venv

# Activate virtual environment
source venv/bin/activate

# Verify Python version inside venv
python --version

# Install backend dependencies
pip install .
```

## Phase 4 — Test FastAPI

```bash
# Start uvicorn manually to test
uvicorn app.main:app --host 127.0.0.1 --port 8000

# In a second terminal, verify it responds
curl http://127.0.0.1:8000/openapi.json

# Stop uvicorn once verified
# CTRL + C
```

## Phase 5 — Setup systemd Service

```bash
# Create the service file
sudo nano /etc/systemd/system/finapp.service
```

Paste the following — replace `YOUR_USERNAME`:

```ini
[Unit]
Description=FinApp FastAPI Backend
After=network.target

[Service]
User=YOUR_USERNAME
WorkingDirectory=/home/YOUR_USERNAME/FinApp_AAG/backend
Environment="PATH=/home/YOUR_USERNAME/FinApp_AAG/backend/venv/bin"
ExecStart=/home/YOUR_USERNAME/FinApp_AAG/backend/venv/bin/uvicorn app.main:app --host 127.0.0.1 --port 8000
Restart=always

[Install]
WantedBy=multi-user.target
```

Save with `CTRL+X` → `Y` → `Enter`

```bash
# Reload systemd, enable and start the service
sudo systemctl daemon-reload
sudo systemctl enable finapp
sudo systemctl start finapp

# Verify service is running
sudo systemctl status finapp

# Verify API is responding
curl http://127.0.0.1:8000/openapi.json
```

## Phase 6 — Copy SQLite Database to VM

Upload `finance_tracker.db` via the GCP browser SSH upload button (gear icon ⚙ in the SSH window), then move it to the correct location:

```bash
mv ~/finance_tracker.db ~/FinApp_AAG/backend/
```

Verify data:
```bash
sudo apt install sqlite3 -y
sqlite3 ~/FinApp_AAG/backend/finance_tracker.db "SELECT COUNT(*) FROM holdings;"
```

Then restart the service:
```bash
sudo systemctl restart finapp
```

## Useful Service Management Commands

```bash
# Restart the service (e.g. after code changes)
sudo systemctl restart finapp

# Stop the service
sudo systemctl stop finapp

# View live logs
sudo journalctl -u finapp -f

# View logs from last 10 minutes
sudo journalctl -u finapp --since "10 minutes ago"
```
