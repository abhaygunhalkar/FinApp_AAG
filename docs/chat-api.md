# POST /api/chat

One turn with the chat assistant. The body is a `ChatRequest` and the reply is a `ChatResponse` (`docs/chat-contract.md`), answered by the engine chosen with `CHAT_ENGINE` (`docs/chat-engine.md`).

| | File |
|---|---|
| Route, limits, error responses, request logs | `backend/app/routers/chat.py` |
| Who is signed in | `backend/app/auth.py` |
| One turn and session history | `backend/app/services/chat_service.py` |
| Session store (TTL) | `backend/app/services/chat_sessions.py` |
| Rate limiter | `backend/app/services/rate_limit.py` |
| Error handler and log setup | `backend/app/main.py` |
| Tests | `backend/tests/integration/test_chat_router.py` |

## Request and response

```http
POST /api/chat
Content-Type: application/json

{ "sessionId": "b6f1…", "message": "bills due this week" }
```

```json
{ "success": true, "data": { "sessionId": "b6f1…", "messages": [ … ] }, "error": null }
```

**Errors use the same shape.** Every failure, from a missing login to a bug, returns the envelope with `success: false`. Its `data` is a `ChatResponse` holding one `error` message, so the widget can always render the reply. `error` repeats that message. Stack traces, exception text and echoed input are never returned.

| Status | `code` | When |
|---|---|---|
| 400 | `invalid_json` | The body isn't JSON |
| 401 | `unauthorized` | Not signed in |
| 403 | `forbidden` | Signed in, but not `OWNER_USER_ID` |
| 413 | `too_large` | The body is over `CHAT_MAX_BODY_BYTES` |
| 422 | `invalid_request` | Fails the `ChatRequest` schema; the message names the fields, not their values |
| 429 | `rate_limited` | Over `CHAT_RATE_LIMIT_PER_MINUTE`; a `Retry-After` header gives the seconds to wait |
| 500 | `internal` | A bug; the message is generic |
| 504 | `timeout` | The engine took longer than `CHAT_TIMEOUT_SECONDS` |

`data.sessionId` echoes the request's `sessionId` when it could be read, else `"unknown"`. Every response has an `X-Request-ID` header: the caller's own, if it's 1–64 characters of letters, digits, `.`, `_` or `-`, otherwise a new one.

## Auth

The app has no login of its own. nginx basic auth on the VM signs the user in for the whole site, including `/api/`, and forwards the username in `X-Remote-User` (`AUTH_USER_HEADER`). The backend believes that header only when it can tell the request came through nginx:

- **On the VM: a shared secret.** nginx also sends `X-Proxy-Secret` (`AUTH_PROXY_SECRET_HEADER`), and it must equal `AUTH_PROXY_SECRET`. `proxy_set_header` replaces whatever a browser sends in either header, so a browser can't fake them.
- **Without a secret: the client address,** which must be in `AUTH_TRUSTED_PROXIES`. **This does not work behind nginx with uvicorn's defaults.** Uvicorn trusts `X-Forwarded-For` from 127.0.0.1 and replaces the client address with the browser's IP, so every request looks like an outsider (that was the first production bug: every chat got 401). Keep the secret set on the VM.
- **Owner only.** The username must equal `OWNER_USER_ID`.
- **Never from the body.** The user can't be set in the request body.

**Local development** (no nginx): set `AUTH_DEV_USER` in `backend/.env` to the same value as `OWNER_USER_ID`. **Never set it on the VM**: it signs in every request.

### One-time VM setup

Do this after the code that knows `AUTH_PROXY_SECRET` is deployed. `pydantic-settings` rejects unknown keys in `.env`, so adding the key earlier stops the service from starting.

On the VM, in `~/FinApp_AAG`:

```bash
# The file nginx loads. On this VM it's a plain file, not a link to
# sites-available/finapp, so edits to sites-available do nothing.
F=/etc/nginx/sites-enabled/finapp
U=$(sudo head -1 /etc/nginx/.htpasswd | cut -d: -f1)   # your basic-auth username
S=$(openssl rand -hex 32)                              # the shared secret

# nginx: forward the username and the secret to the API
grep -q X-Remote-User $F || sudo sed -i --follow-symlinks 's|proxy_pass http://127.0.0.1:8000;|proxy_pass http://127.0.0.1:8000;\n        proxy_set_header X-Remote-User $remote_user;|' $F
sudo sed -i --follow-symlinks '/X-Proxy-Secret/d' $F
sudo sed -i --follow-symlinks "s|proxy_set_header X-Remote-User \$remote_user;|proxy_set_header X-Remote-User \$remote_user;\n        proxy_set_header X-Proxy-Secret $S;|" $F
sudo nginx -t && sudo systemctl reload nginx
# Check nginx is really using it (prints the lines, secret hidden)
sudo nginx -T 2>/dev/null | grep -E "X-Remote-User|X-Proxy-Secret" | sed -E 's/(X-Proxy-Secret) [^;]*/\1 <hidden>/'

# backend: the owner and the same secret
sed -i '/^OWNER_USER_ID=/d; /^AUTH_PROXY_SECRET=/d' backend/.env
printf 'OWNER_USER_ID=%s\nAUTH_PROXY_SECRET=%s\n' "$U" "$S" >> backend/.env
sudo systemctl restart finapp
```

The secret lives in the nginx config (readable only by root) and `backend/.env`; it is never logged or sent to the browser. To rotate it, run the same commands again.

## Limits

| Setting | Default | |
|---|---|---|
| `CHAT_RATE_LIMIT_PER_MINUTE` | 30 | Per user, sliding 60-second window; counted after the auth check, so unauthenticated requests don't use the owner's quota |
| `CHAT_MAX_BODY_BYTES` | 8192 | Checked from `Content-Length`, then from the actual body |
| `CHAT_TIMEOUT_SECONDS` | 10 | The engine runs in a worker thread. On timeout the reply is a 504 and the thread's result is thrown away, though the thread itself finishes in the background |
| `CHAT_SESSION_TTL_MINUTES` | 30 | A session is forgotten 30 minutes after its last message |
| `CHAT_HISTORY_LIMIT` | 20 | Messages kept per session: what the user sent (text or action type), and the message types the bot replied with |

The limiter and session store are in memory (`InMemoryRateLimiter`, `InMemorySessionStore`). That fits the single uvicorn process on one VM; both reset when the service restarts. Each sits behind a small interface (`RateLimiter.check`, `SessionStore.get`/`save`), so a Redis version can replace it without changing the route. Sessions are keyed by user and session id, so one user can't continue another's session.

## Logs

There is one JSON line per request on the `app.chat` logger (INFO, written to the service's output, so `journalctl -u finapp` on the VM):

```
app.chat {"engine": "rules", "event": "chat_request", "intent": "upcomingBills", "latency_ms": 7.3, "request_id": "7072e8…", "session_id": "t1", "status": 200}
```

- **Fields on failures:** failed requests add `code`. Bugs add `error_type` (the exception class only, since its text could contain amounts).
- **No content:** message text, account names and amounts are never logged here.
- **Unmatched questions:** the engine separately logs questions it couldn't answer, with digits, emails and account names removed (`app.services.chat_engine`, see `docs/chat-engine.md`).
