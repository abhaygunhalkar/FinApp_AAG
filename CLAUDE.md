# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

A single-user personal finance app: stock/ETF/options portfolio tracking plus net worth (bank, card, loan and property accounts), fixed costs (recurring bills) and cash flow (income and forecasts). React/TypeScript frontend + FastAPI backend, with a SQLite file as the only datastore. It runs locally for development and is deployed to one GCP VM (see Deployment).

External data is fetched only by the backend; the frontend never calls these services directly:
- Market data (prices, history, fundamentals, dividend yield, RSI inputs): Yahoo Finance via `yfinance`.
- Earnings calendar: Finnhub (`FINNHUB_API_KEY`).
- Bank/card balances: Plaid (`PLAID_CLIENT_ID`, `PLAID_SECRET`, `PLAID_ENV`). Balances only; Plaid transactions are not imported.

There is one sign-in account, the owner's. See "Auth" below.

## Commands

### Backend (`backend/`)

```bash
cd backend
python -m venv venv && source venv/bin/activate   # the existing env is backend/venv
pip install -e ".[dev]"
alembic upgrade head
uvicorn app.main:app --host 127.0.0.1 --port 8000 --reload
```

- Test: `pytest` (single test: `pytest tests/unit/test_holdings_service.py::test_name`)
- Lint/typecheck: `task lint` (= `black --check . && ruff check . && mypy .`)
- Auto-format: `task format` (= `black . && ruff check --fix .`)
- New migration: `alembic revision --autogenerate -m "description"`, then `alembic upgrade head`
- Reset local DB: `python scripts/reset_database.py`
- Demo data: `backend/finance_demo.db` holds made-up data. Run the backend with `DATABASE_URL=sqlite:///./finance_demo.db` for local testing and screenshots; never use or show the real `finance_tracker.db`.
- Migrations must tolerate tables that already exist, because `verify_database()` runs `create_all` at startup before Alembic.

Coverage gate is enforced via pytest config: `--cov-fail-under=70`. `mypy` runs in `strict` mode.

### Frontend (`frontend/`)

```bash
cd frontend
npm install
npm run dev   # http://localhost:3000
```

- Test: `npm test` (watch mode: `npm run test:watch`; coverage: `npm run test:coverage`)
- Single test file: `npx vitest run src/__tests__/unit/<file>.test.tsx`
- Lint/format/typecheck all at once: `npm run check` (= eslint + prettier --check + tsc -b --noEmit)
- Build: `npm run build`

Vitest coverage thresholds are 70% (statements/branches/functions/lines), enforced in `vite.config.ts`.

## Architecture

### Backend: strict layering

`routers/` → `services/` → `repositories/` → `models/`, with `schemas/` (Pydantic) as the I/O contract.

- **Routers** (`app/routers/*.py`) only do request/response plumbing: call a service method, catch `HTTPException`/`ValueError`, and wrap the result in the `ApiResponse` envelope (`app/schemas/common.py`). They never touch the DB or SQLAlchemy directly.
- **Services** (`app/services/*.py`) hold business logic (validation rules, cross-table effects like cash balance updates, gain/loss calculation). They call repositories, never raw queries.
- **Repositories** (`app/repositories/*.py`) are the only layer that issues SQLAlchemy queries.
- **Models** (`app/models/*.py`) are SQLAlchemy ORM classes; all share `Base` from `app/database.py`.
- DB sessions are injected via the `get_db` FastAPI dependency (`app/database.py`); never instantiate `SessionLocal()` directly inside request handling — only background jobs (`_refresh_market_data` in `main.py`) create their own session.

Every API response, success or error, is wrapped in the same envelope: `{"success": bool, "data": ..., "error": str | null}`. Validation errors (422) additionally include a `details` array of `{field, message}`. This is enforced globally by exception handlers in `app/main.py`, not per-router — don't hand-roll error responses that bypass it.

**Stocks vs. ETFs share one table.** `holdings.holding_type` (`'stock'` | `'etf'`) distinguishes them; `app/routers/holdings.py` and `app/routers/etf_holdings.py` are two thin routers over the same `HoldingsService`/`Holding` model, filtered by `holding_type`. When adding holding-related logic, check whether it needs to apply to both routers.

**Background refresh:** `APScheduler` (configured in the `lifespan` context manager in `app/main.py`) runs `MarketDataService.refresh_all_prices()` on an interval set by `REFRESH_INTERVAL_MINUTES` (1–1440, clamped). It updates `current_price` on holdings/watchlist and appends to `price_history` (pruned after 365 days). The same method backs the manual `POST /api/market/refresh` endpoint.

**Database bootstrapping:** `verify_database()` in `app/database.py` runs at startup — creates the SQLite file/tables if missing, runs `PRAGMA integrity_check`, and includes an inline compatibility patch that adds `holdings.holding_type` if an old DB predates that column. Schema changes still go through Alembic (`backend/alembic/versions/`); this startup check is a safety net, not a substitute for migrations.

### Frontend: feature-folder + hooks-over-fetch

- `src/api/*.ts` — one file per resource, thin axios wrappers around `apiClient` (`src/api/client.ts`). All responses go through `unwrapResponse()`, which unwraps the `ApiResponse` envelope and throws on `success: false`.
- `src/hooks/use*.ts` — TanStack Query hooks wrapping the `api/` functions; components should consume data through these hooks, not call `api/` directly.
- `src/store/uiStore.ts` — Zustand store for UI-only state (currently theme).
- `src/pages/*.tsx` — route-level components, registered in the router in `src/App.tsx`.
- `src/components/<feature>/` — components grouped by domain (`dashboard`, `holdings`, `options`, `watchlist`, `shared`, `layout`).
- `src/types/*.ts` mirror the backend Pydantic schemas; keep them in sync when changing API contracts.

### Database tables

| Table | Purpose |
|-------|---------|
| `holdings` | Active positions (stocks and ETFs, distinguished by `holding_type`) |
| `transactions` | All buy/sell records; preserved even after a holding is deleted (`holding_id` is nullable for this reason) |
| `watchlist` | Stocks being monitored for potential purchase |
| `price_history` | Historical daily prices per ticker, pruned after 365 days |
| `cash_balance` | Single-row table tracking available cash, updated on every buy/sell |
| `options_trades` | Options trades (calls/puts) tracked separately from equity holdings |
| `earnings_cache` | Cached Finnhub earnings calendar lookups |
| `sell_lot_allocations` | Which buy lots each sell took shares from (lots are scoped to one holding, i.e. one ticker at one broker) |
| `financial_accounts` | Net Worth accounts: checking, savings, credit cards, loans, mortgage, property, vehicle, crypto; manual or Plaid-linked |
| `plaid_items` | Plaid connections (one per institution login) |
| `net_worth_snapshots` | One row per day of total assets, liabilities and net worth (totals only, not per account) |
| `recurring_expenses` | Fixed costs / bills with category, frequency, next due date, paying account, autopay |
| `income_sources` | Paychecks and other income with pay schedule and deposit account |
| `owner` | The one sign-in account: username, scrypt password hash, failed-sign-in count and lock, TOTP key and backup-code hashes |
| `auth_sessions` | Signed-in browsers: hash of the cookie token, last seen, expiry |

### Configuration

All backend config is env vars / `backend/.env` (see `backend/.env.example`), loaded via `app/config.py` (`pydantic-settings`, cached with `lru_cache`): `DATABASE_URL`, `MARKET_API_PROVIDER`, `REFRESH_INTERVAL_MINUTES`, `BROKERS` (comma-separated, drives the broker dropdown), `FINNHUB_API_KEY`, `PLAID_CLIENT_ID`, `PLAID_SECRET`, `PLAID_ENV`, `OWNER_USER_ID` (chat tools act only for this id), `CHAT_ENGINE` (`rules`), the `AUTH_*` sign-in settings (`docs/auth.md`) and the `CHAT_*` limits (see `docs/chat-api.md`). Frontend: `VITE_API_BASE_URL` (defaults to `http://localhost:8000`).

### Auth

The app has its own sign-in page and one account, the owner's, created on the server with `backend/scripts/create_owner.py` (also `--reset`, `--unlock`, `--enable-2fa`, `--disable-2fa`, `--backup-codes`); there is no sign-up page and no user model beyond the `owner` table, so services still take no user argument. See `docs/auth.md`.

- `POST /api/auth/login` sets an HttpOnly, SameSite=Strict `finapp_session` cookie; only a hash of the token is stored (`auth_sessions`). Sessions end after `AUTH_SESSION_IDLE_MINUTES` idle or `AUTH_SESSION_MAX_HOURS` after sign-in. Failed sign-ins lock the account after `AUTH_MAX_FAILED_LOGINS`. Optional two-step verification (TOTP plus one-time backup codes, `app/services/totp.py`): with it on, a password-only login answers `code_required: true` and the page resends with `code`.
- Every router except `auth` is included with `Depends(require_session)` in `app/main.py`; add new routers to that list. The app-level `require_csrf_header` refuses any non-GET request without `X-Requested-With: FinApp`, which the axios client always sends (`withCredentials` on).
- Frontend: `RequireAuth` wraps every page except `/login`; a 401 from any non-auth call clears the query cache and goes to `/login?expired=1&next=…`.
- Tests: the autouse `signed_in` fixture in `tests/conftest.py` signs every test in and skips the CSRF check; use the `real_auth` fixture to test them for real.
- Locally, run the backend with `AUTH_COOKIE_SECURE=false` and create an owner in the database you use.
- On the VM, nginx does HTTPS and forwards `/api/` (`docs/GCP-VM-Frontend.md`); its config is edited by hand, not by the deploy workflow. CORS allows only `http://localhost:3000`. New settings must be deployed before they're added to the VM's `backend/.env`; `pydantic-settings` rejects unknown keys and the service won't start.

### Error handling and logging

- Services raise `HTTPException` (404, 422, ...) with a plain-English `detail`; the global handlers in `app/main.py` turn it into the error envelope. Unhandled exceptions are logged and returned as a generic 500 "Internal server error".
- Logging is the standard library: `logger = logging.getLogger(__name__)` at module level, used in `main.py`, `database.py`, and the services that call external APIs (market data, Plaid, earnings). No structured logging or request IDs.
- Frontend: `unwrapResponse()` throws on `success: false`; components show errors inline (for example a `role="alert"` line) or with `ErrorNotification`. Axios timeout is 10s.

### Deployment

`.github/workflows/deploy.yml` deploys on push to `main`: backend changes are deployed via SSH (`git pull` + `pip install .` + `alembic upgrade head` + restart a `systemd` service named `finapp`) to a GCP VM; frontend changes are built and `scp`'d to the same VM behind nginx. Backend and frontend deploy independently based on which paths changed in the last commit. The production database is `backend/finance_tracker.db` on the VM.

### Testing conventions

- Backend tests use an in-memory SQLite DB (`tests/conftest.py`) with the `get_db` dependency overridden; `setup_database` autouse fixture creates/drops all tables per test for isolation. Tests are split into `tests/unit/`, `tests/integration/` (router-level via `httpx.AsyncClient`), and `tests/property/` (Hypothesis-based).
- Frontend tests live in `src/__tests__/unit/` and `src/__tests__/property/` (fast-check), plus some co-located `*.test.tsx` next to components (e.g. `components/holdings/`). Page tests usually `vi.mock` the hooks module rather than mocking HTTP; `msw` is available for API mocking. Use dates relative to today in tests, not hard-coded ones that go stale.
- Some tests already fail on `main` (backend: a handful in watchlist/ETF tests; frontend: `FrontendComponents`, `MetricsCards` and others with out-of-date fixtures), and `tsc -b` reports errors in old test files. Compare against `main` before assuming a failure is new.

## Backlog

Open work, deferred ideas and decisions not to revisit are in `docs/backlog.md`. Keep it current: add new deferred items there and move finished ones to its "Done" section.

## Conventions

- **Python:** black + ruff (line length 88), mypy strict, full type hints. Services are classes of `@staticmethod`s named `<Thing>Service`; repositories are `<Thing>Repository`. Module names are `snake_case`; one model per file in `app/models/`, registered in `app/models/__init__.py`. Pydantic schemas are `<Thing>Create` / `<Thing>Update` / `<Thing>Response`; enums are `Literal[...]` aliases. Docstrings and comments are short and plain-English.
- **Routers:** `APIRouter(prefix="/api/<resource-kebab-case>")`; return `{"success": True, "data": ..., "error": None}` with `response_model=ApiResponse[...]`. Some older routers (`transactions.py /sells`, `income.py`) still contain logic or build dicts by hand; don't copy that pattern.
- **TypeScript/React:** function components, default export per component file, `PascalCase.tsx` for components and `camelCase.ts` for helpers. Pure helpers live in separate `.ts` files (ESLint `react-refresh/only-export-components`). Feature folders under `src/components/<feature>/` with an `index.ts` barrel. Types in `src/types/<resource>.ts` mirror backend schemas.
- **Styling:** Tailwind v4 utility classes only (no component library). Dark mode via the `dark` class on `<html>` (toggled from `uiStore.theme`); newer pages (Net Worth, Dashboard 2) use named colour tokens plus `dark:` variants. Dark is the default theme. Colours are switchable palettes (`src/palettes.css`, `uiStore.palette`, picked in Settings; a deployment's starting palette is `VITE_DEFAULT_PALETTE`): use Tailwind palette classes or the tokens there (`accent-*`, `ink-*`, `hero-*`, `gain-*`, `loss-*`), including `var(--color-…)` in chart props, never new hex values, except for fixed category and brand colours. Use `tabular-nums` for money. Layouts must work at 390px wide with no horizontal scroll.
- **Money formatting:** per-feature helpers, not one shared util: `components/networth/format.ts` (`fmtMoney`, `fmtCompact`, `fmtPct`, `timeAgo`, `staleDays`) and `components/dashboard2/format.ts` (`fmtMoney`, `fmtSigned`). Both respect the "hide numbers" toggle (`uiStore.hideBalances`, mask `••••••`) and use `−` (U+2212) for negatives.
- **Charts:** Recharts.
- **Chat contract:** the chat assistant's request/response shapes are mirrored in `backend/app/schemas/chat.py` (Pydantic) and `frontend/src/types/chat.ts` (Zod), checked against shared examples in `docs/chat-contract.examples.json`. Change all three together; see `docs/chat-contract.md`. This API is camelCase on the wire, unlike the rest.
- **Chat tools:** read-only functions in `backend/app/services/chat_tools/`, registered in a `ToolRegistry` for function calling. They reuse services/repositories, take the user from a server-built `ToolContext` (only `OWNER_USER_ID` is allowed), and return money as `Decimal` cents. See `docs/chat-tools.md`.
- **Chat widget:** `src/components/chat/` (launcher in `AppLayout`, panel lazy-loaded), talking to `POST /api/chat` through `useChat` (`src/hooks/useChat.ts`, `src/api/chat.ts`). One component per message type in `src/components/chat/messages/`. Replies are checked against the Zod contract in development only (dynamic import, so Zod stays out of the production bundle). Locally, sign in first like any other page.
- **Chat engine:** `backend/app/services/chat_engine/` turns a `ChatRequest` into a `ChatResponse`. Get one with `create_engine()` (`CHAT_ENGINE` setting, only `rules` so far). Intents, chips and example questions must only point at tools that exist. See `docs/chat-engine.md`.
- **Dependencies:** ask before adding a new package to either side. Zod (frontend) is used for runtime validation of the chat contract.
- **Git:** commit and push only when the owner says so; no Co-Authored-By line.
