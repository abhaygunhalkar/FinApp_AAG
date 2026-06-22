# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

A locally-hosted personal stock portfolio tracker: React/TypeScript frontend + FastAPI backend, with a local SQLite file as the only datastore. Market data (prices, history, fundamentals, dividend yield, RSI inputs) comes from Yahoo Finance via `yfinance`, called only from the backend — the frontend never talks to yfinance directly. Earnings calendar data comes from the Finnhub API (`FINNHUB_API_KEY`).

## Commands

### Backend (`backend/`)

```bash
cd backend
python -m venv .venv && source .venv/bin/activate
pip install -e ".[dev]"
alembic upgrade head
uvicorn app.main:app --host 127.0.0.1 --port 8000 --reload
```

- Test: `pytest` (single test: `pytest tests/unit/test_holdings_service.py::test_name`)
- Lint/typecheck: `task lint` (= `black --check . && ruff check . && mypy .`)
- Auto-format: `task format` (= `black . && ruff check --fix .`)
- New migration: `alembic revision --autogenerate -m "description"`, then `alembic upgrade head`
- Reset local DB: `python scripts/reset_database.py`

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

### Configuration

All backend config is env vars / `backend/.env` (see `backend/.env.example`), loaded via `app/config.py` (`pydantic-settings`, cached with `lru_cache`): `DATABASE_URL`, `MARKET_API_PROVIDER`, `REFRESH_INTERVAL_MINUTES`, `BROKERS` (comma-separated, drives the broker dropdown), `FINNHUB_API_KEY`.

### Deployment

`.github/workflows/deploy.yml` deploys on push to `main`: backend changes are deployed via SSH (`git pull` + `pip install .` + restart a `systemd` service named `finapp`) to a GCP VM; frontend changes are built and `scp`'d to the same VM behind nginx. Backend and frontend deploy independently based on which paths changed in the last commit.

### Testing conventions

- Backend tests use an in-memory SQLite DB (`tests/conftest.py`) with the `get_db` dependency overridden; `setup_database` autouse fixture creates/drops all tables per test for isolation. Tests are split into `tests/unit/`, `tests/integration/` (router-level via `httpx.AsyncClient`), and `tests/property/` (Hypothesis-based).
- Frontend tests live in `src/__tests__/unit/` and `src/__tests__/property/` (fast-check), using `msw` for API mocking and `@testing-library/react`.
