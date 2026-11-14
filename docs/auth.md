# Sign-in

The app has its own sign-in page and **one account**, the owner's. There is no sign-up page: the account is made once on the server with a script. nginx handles HTTPS and forwards `/api/` to the backend; it no longer asks for a password.

| Part | Where |
|---|---|
| Session check, CSRF header check | `backend/app/auth.py` |
| Sign-in, lockout, session expiry | `backend/app/services/auth_service.py` |
| Password hashing and rules | `backend/app/services/passwords.py` |
| `/api/auth/login`, `/logout`, `/me` | `backend/app/routers/auth.py` |
| Account setup and reset | `backend/scripts/create_owner.py` |
| Sign-in page, route guard, Sign out | `frontend/src/pages/Login.tsx`, `src/components/auth/`, `src/components/layout/Sidebar.tsx` |

## How it works

- **Password storage:** scrypt from Python's standard library, with a random salt per password. Rules: 12–128 characters, no leading or trailing space, doesn't contain the username, at least 5 different characters.
- **Session:** signing in creates a random token. The browser gets it in the `finapp_session` cookie (`HttpOnly`, `Secure`, `SameSite=Strict`, no expiry date, so it also ends when the browser closes). The database keeps only a SHA-256 hash of the token.
- **Expiry:** a session ends after `AUTH_SESSION_IDLE_MINUTES` (60) with no requests, or `AUTH_SESSION_MAX_HOURS` (12) after sign-in, whichever comes first. The page then shows "Your session ended. Please sign in again." and returns to where you were afterwards.
- **Every `/api/` route needs a session**, except `/api/auth/login` and `/api/auth/logout`. `/health` stays open.
- **CSRF:** every request that changes data (anything but GET/HEAD/OPTIONS) must send `X-Requested-With: FinApp`. The frontend's axios client always does; a form or link on another site can't.
- **Wrong sign-ins:** the message is always "Incorrect username or password." After `AUTH_MAX_FAILED_LOGINS` (5) failures in a row, sign-in is locked for `AUTH_LOCKOUT_MINUTES` (15), even with the right password. Each address is also limited to `AUTH_LOGIN_ATTEMPTS_PER_MINUTE` (10) tries.
- **Chat** acts for `OWNER_USER_ID` once the request has a session.

## Commands (on the server, in `~/FinApp_AAG/backend` with the venv active)

```bash
python scripts/create_owner.py            # one time: choose a username and password
python scripts/create_owner.py --reset    # forgot the password: set a new one (signs out every browser)
python scripts/create_owner.py --unlock   # locked out after failed sign-ins
```

There is no "forgot password" link on the page: you reset it on the server.

## Local development

Run the backend with `AUTH_COOKIE_SECURE=false`, because `http://localhost` isn't HTTPS, and create an owner in the database you use:

```bash
cd backend
DATABASE_URL=sqlite:///./finance_demo.db python scripts/create_owner.py
DATABASE_URL=sqlite:///./finance_demo.db AUTH_COOKIE_SECURE=false uvicorn app.main:app --port 8000 --reload
```

## Moving the VM from nginx basic auth (one time)

Order matters, so the site is never open and you're never locked out.

1. **Deploy the code** (backend, then frontend). Basic auth is still on, so for a moment you sign in twice: the browser popup, then the new page.
2. **Create the account** on the VM:
   ```bash
   cd ~/FinApp_AAG/backend && source venv/bin/activate && python scripts/create_owner.py
   ```
3. **Sign in** at https://finapp.techysnacks.click and check the pages load.
4. **Remove basic auth and the old chat headers from nginx:**
   ```bash
   F=/etc/nginx/sites-enabled/finapp
   sudo cp $F ~/finapp.nginx.bak
   sudo sed -i -E '/auth_basic/d; /X-Remote-User/d; /X-Proxy-Secret/d' $F
   sudo nginx -t && sudo systemctl reload nginx
   sudo nginx -T 2>/dev/null | grep -cE "auth_basic|X-Remote-User|X-Proxy-Secret"   # should print 0
   ```
5. **Remove the old settings** from `backend/.env` and restart:
   ```bash
   sed -i '/^AUTH_PROXY_SECRET=/d; /^AUTH_USER_HEADER=/d; /^AUTH_TRUSTED_PROXIES=/d; /^AUTH_PROXY_SECRET_HEADER=/d; /^AUTH_DEV_USER=/d' ~/FinApp_AAG/backend/.env
   sudo systemctl restart finapp
   ```
   Keep `OWNER_USER_ID`. Those five settings are still accepted but unused; they can be deleted from `app/config.py` once no `.env` has them.

To undo step 4: `sudo cp ~/finapp.nginx.bak /etc/nginx/sites-enabled/finapp && sudo systemctl reload nginx`.

**Optional:** an nginx limit on sign-in requests as well, in addition to the app's own. Add `limit_req_zone $binary_remote_addr zone=login:1m rate=10r/m;` in the `http` block of `/etc/nginx/nginx.conf`, and inside the `server` block:

```nginx
location = /api/auth/login {
    limit_req zone=login burst=5 nodelay;
    proxy_pass http://127.0.0.1:8000;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
}
```
