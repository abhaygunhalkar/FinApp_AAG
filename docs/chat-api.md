# POST /api/chat

One turn with the chat assistant. The body is a `ChatRequest` and the reply is a `ChatResponse` (`docs/chat-contract.md`), answered by the engine chosen with `CHAT_ENGINE` (`docs/chat-engine.md`).

| | File |
|---|---|
| Route, limits, error responses, request logs | `backend/app/routers/chat.py` |
| Who is signed in | `backend/app/auth.py` (see [auth.md](auth.md)) |
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

**Errors use the same shape.** Every failure once signed in, from bad input to a bug, returns the envelope with `success: false`. Its `data` is a `ChatResponse` holding one `error` message, so the widget can always render the reply. `error` repeats that message. Stack traces, exception text and echoed input are never returned.

| Status | `code` | When |
|---|---|---|
| 400 | `invalid_json` | The body isn't JSON |
| 413 | `too_large` | The body is over `CHAT_MAX_BODY_BYTES` |
| 422 | `invalid_request` | Fails the `ChatRequest` schema; the message names the fields, not their values |
| 429 | `rate_limited` | Over `CHAT_RATE_LIMIT_PER_MINUTE`; a `Retry-After` header gives the seconds to wait |
| 500 | `internal` | A bug; the message is generic |
| 504 | `timeout` | The engine took longer than `CHAT_TIMEOUT_SECONDS` |

`data.sessionId` echoes the request's `sessionId` when it could be read, else `"unknown"`. Every response has an `X-Request-ID` header: the caller's own, if it's 1–64 characters of letters, digits, `.`, `_` or `-`, otherwise a new one.

## Auth

`/api/chat` needs a signed-in session, like every other `/api/` route (see [auth.md](auth.md)). Without one the reply is the app-wide 401 envelope (`"error": "Please sign in."`), not a chat error message. A signed-in request chats as `OWNER_USER_ID`; the user can't be set in the request body.

## Limits

| Setting | Default | |
|---|---|---|
| `CHAT_RATE_LIMIT_PER_MINUTE` | 30 | Per user, sliding 60-second window; counted after the sign-in check, so requests without a session don't use the owner's quota |
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
