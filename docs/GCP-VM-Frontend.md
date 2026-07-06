# GCP VM Frontend & nginx Setup — Command Reference

## Phase 1 — Install Node.js 20

```bash
# Install Node.js 20 via nodesource
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install nodejs -y

# Verify
node --version && npm --version
# Expected: v20.x.x and 10.x.x
```

## Phase 2 — Build React Frontend on VM

```bash
# Navigate to frontend folder
cd ~/FinApp_AAG/frontend

# Install dependencies
npm install

# Build for production
npm run build
# Output: frontend/dist/ folder
```

## Phase 3 — nginx Configuration

```bash
# Create nginx site config
sudo nano /etc/nginx/sites-available/finapp
```

Paste the following — replace `YOUR_USERNAME`:

```nginx
server {
    listen 80;
    server_name _;

    # Serve React frontend static files
    root /home/YOUR_USERNAME/FinApp_AAG/frontend/dist;
    index index.html;

    # Proxy API requests to FastAPI
    location /api/ {
        proxy_pass http://127.0.0.1:8000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    }

    # Serve React app for all other routes (SPA support)
    location / {
        auth_basic "FinApp";
        auth_basic_user_file /etc/nginx/.htpasswd;
        try_files $uri $uri/ /index.html;
    }
}
```

Save with `CTRL+X` → `Y` → `Enter`

```bash
# Enable the site
sudo ln -s /etc/nginx/sites-available/finapp /etc/nginx/sites-enabled/

# Remove default nginx site
sudo rm /etc/nginx/sites-enabled/default

# Test nginx config
sudo nginx -t

# Restart nginx
sudo systemctl restart nginx

# Verify nginx is running
sudo systemctl status nginx
```

## Phase 4 — Fix File Permissions

```bash
# Allow nginx to read the dist folder
sudo chmod o+x /home/YOUR_USERNAME
sudo chmod o+x /home/YOUR_USERNAME/FinApp_AAG
sudo chmod o+x /home/YOUR_USERNAME/FinApp_AAG/frontend
sudo chmod -R o+r /home/YOUR_USERNAME/FinApp_AAG/frontend/dist
```

## Phase 5 — GCP Firewall Rule

Allow HTTP traffic from the GCP Console:

1. Go to `console.cloud.google.com/compute/instances`
2. Click your VM → Network interfaces → nic0 → Firewall rules
3. Create firewall rule:
   - Name: `allow-http`
   - Direction: `Ingress`
   - Action: `Allow`
   - Targets: `All instances in the network`
   - Source IPv4 ranges: `0.0.0.0/0`
   - Protocol: `TCP` → Port `80`

## Phase 6 — nginx Basic Auth (Password Protection)

```bash
# Install apache2-utils
sudo apt install apache2-utils -y

# Create username and password
sudo htpasswd -c /etc/nginx/.htpasswd YOUR_LOGIN_USERNAME

# Reload nginx to apply
sudo systemctl reload nginx
```

## Useful nginx Commands

```bash
# Test nginx config for errors
sudo nginx -t

# Reload nginx (no downtime)
sudo systemctl reload nginx

# Restart nginx
sudo systemctl restart nginx

# View nginx error logs (last 10 minutes)
sudo journalctl -u nginx --since "10 minutes ago"

# View nginx error log file
sudo tail -20 /var/log/nginx/error.log
```

## Frontend Environment Files

`.env` (local development):
```dotenv
VITE_API_BASE_URL=http://localhost:8000
```

`.env.production` (production build):
```dotenv
VITE_API_BASE_URL=
```

`client.ts` axios config:
```typescript
const apiClient = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL ?? '',
  timeout: 10000,
  headers: {
    'Content-Type': 'application/json',
  },
});
```
