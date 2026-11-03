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

The app has no login of its own. nginx basic auth on the VM signs the user in for the whole site, including `/api/`, and forwards the username in the `X-Remote-User` header (`AUTH_USER_HEADER`).
- **Trusted source only.** The backend believes that header only from `AUTH_TRUSTED_PROXIES` (default `127.0.0.1,::1`, which is nginx on the same VM). Uvicorn listens on 127.0.0.1, so nothing else can reach it.
- **Owner only.** The username must equal `OWNER_USER_ID`.
- **Never from the body.** The user can't be set in the request body; a `userId` key fails validation.

**Local development** (no nginx): set `AUTH_DEV_USER` in `backend/.env` to the same value as `OWNER_USER_ID`. **Never set it on the VM**: it signs in every request.

### One-time VM setup

On the VM, in `~/FinApp_AAG`:

```bash
# 1. Your basic-auth username (the part before the colon)
sudo cut -d: -f1 /etc/nginx/.htpasswd

# 2. Make nginx forward it to the API (skips if already done)
F=/etc/nginx/sites-available/finapp
grep -q X-Remote-User $F || sudo sed -i 's|proxy_pass http://127.0.0.1:8000;|proxy_pass http://127.0.0.1:8000;\n        proxy_set_header X-Remote-User $remote_user;|' $F
sudo nginx -t && sudo systemctl reload nginx

# 3. Tell the backend that username is the owner (replace YOUR_USERNAME)
echo 'OWNER_USER_ID=YOUR_USERNAME' >> backend/.env
sudo systemctl restart finapp
```

`proxy_set_header` replaces any `X-Remote-User` a client sends, so a browser can't claim to be someone else. Until this is done, `/api/chat` answers 401. Nothing else in the app changes.

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
