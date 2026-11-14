# Backlog

What's still to do on FinApp, so nothing gets forgotten. Newest decisions at the bottom of each section. Move an item to "Done" with its date when it's finished.

## Infrastructure (quick, in GCP and on the VM)

- [ ] *Later:* copies off the VM. Uploading to a bucket needs a one-time Stop/Start, so make the IP static first (`cloudshell_setup.sh` does both; deferred 2026-11-14 to avoid any IP cost). Meanwhile, download a backup now and then from Cloud Shell. See [backup.md](backup.md).
- [ ] **Find out why the VM froze** (it needed a Reset). On the VM:
  ```bash
  free -h; df -h /; sudo journalctl -k -b -1 --no-pager | grep -iE "oom|killed process" | tail -5
  ```
  The VM has about 1 GB of memory. If it ran out, add a 2 GB swap file.
- [ ] *Optional:* an nginx rate limit on `/api/auth/login`, on top of the app's own (snippet at the end of [auth.md](auth.md)).

## My data

- [ ] **Add the payoff date to the real mortgage** on Net Worth, so Mortgage Payoff works out the monthly payment instead of asking for it.

## Standardization pass

Done; see 2026-11-14 below.

## Later: an install friends can host themselves

One copy per person on their own cloud, not a multi-user service.

1. [ ] *Optional:* small differences remain between the migrated schema and the models (`alembic check`): some `created_at`/`updated_at` columns not marked NOT NULL, an extra index on `options_trades.expiry_date`, and `transactions.holding_id`'s `ON DELETE SET NULL`. None changes behaviour today (SQLite here doesn't enforce foreign keys).
2. [ ] Docker Compose: the app (FastAPI plus the built frontend, migrations at startup), Caddy (automatic HTTPS), SQLite on a volume with a nightly backup.
3. [ ] One `.env` for a friend to fill in: domain, `FINNHUB_API_KEY`, Plaid keys, `BROKERS`. They create their account with `scripts/create_owner.py`.
4. [ ] README setup guide: VM → DNS A record → clone → `.env` → `docker compose up -d`.
5. [ ] Optional: a "try it with sample data" mode using `backend/scripts/demo/seed_demo_data.py`.
6. [ ] Optional: move my own VM to the same setup.

## Decided against (don't reopen without a reason)

- **Multi-user / sign-up:** the app is for one person; data isn't separated per user (2026-10-23, confirmed again 2026-11-13).
- **Automatic Plaid sync:** refreshing balances stays manual.
- **Chat feature flag, metrics dashboards, Playwright end-to-end tests:** not needed for one user.

## Done

- 2026-11-14: nightly database backups on the VM (03:15 UTC, newest 14 kept in `~/finapp-backups`; local copies only). See [backup.md](backup.md).

- 2026-11-14: standardization pass.
  - Every router follows one pattern: call the service, declare `response_model=ApiResponse[<schema>]`, no hand-built `JSONResponse`, no repository imports. Logic moved into services: sell history (`TransactionService.get_sell_history`), the earnings calendar (new `EarningsService`), company info (`MarketDataService.fetch_company_info`) and the Plaid item list (`PlaidService.get_items`). New schemas for market, earnings, Plaid and sell-history replies. A recording of 68 replies (successes and errors) was identical before and after.
  - Backend lint is fully clean: black, ruff and strict mypy over app, tests, scripts and migrations (from ~410 ruff and 65 mypy problems). The realized-gain property test now checks the gain; the shared `client` test fixture works.
  - Frontend `npm run check` is clean (from ~335 problems). `HoldingForm` no longer calls a hook conditionally; forms don't copy props into state in effects; option trades have types (`src/types/options.ts`); unused `OptionsLogModal` removed.
  - Dates: one set of formatters in `src/utils/date.ts`, one style ("Nov 13, 2026") everywhere. The Portfolio Growth tooltip and the stale-data warning no longer follow the browser's locale.

- 2026-11-14: frontend tests that failed on `main` all pass (379), and `tsc -b` is clean. They were out of date: tables gained a query hook and renamed columns, dividend and notes columns were removed, gains gained a + sign. The flaky "Activity feed ordering" property test generated invalid dates (`noInvalidDate`). Also fixed an unused import and a `JSX` type in app code.

- 2026-11-14: backend tests that failed on `main` all pass. Four were tests calling live Yahoo Finance (now an `offline_market` fixture) or outdated setup. One was a real rounding bug: selling part of a position nudged the average cost of the shares kept.
- 2026-11-14: unknown routes and wrong methods (404/405) return the usual `{success, data, error}` envelope.
- 2026-11-14: `from_orm` replaced with `model_validate` in `OptionsService`.
- 2026-11-14: fresh installs work. Every migration runs on an empty database (`a1b2c3d4e5f6` no longer drops a column default, which SQLite can't do); `earnings_cache` has a migration; a database the app creates itself is stamped at the newest migration. Covered by `tests/unit/test_migrations.py`.

- 2026-11-14: own sign-in page replacing nginx basic auth; one owner account made on the server; 60-minute idle and 12-hour session limits; lockout after 5 failed sign-ins; CSRF header check. See [auth.md](auth.md).
- 2026-11-14: two-step verification (authenticator codes and backup codes), on in production.
