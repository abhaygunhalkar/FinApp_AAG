# Backlog

What's still to do on FinApp, so nothing gets forgotten. Newest decisions at the bottom of each section. Move an item to "Done" with its date when it's finished.

## Infrastructure (quick, in GCP and on the VM)

- [ ] **Make the VM's external IP static.** Route 53 points `finapp.techysnacks.click` at `35.209.242.92`, which is ephemeral: a VM stop/start can change it and take the site offline until DNS is updated. GCP console → VPC network → IP addresses → `35.209.242.92` → **Promote to static IP address**. No VM, DNS or certificate changes. No extra cost while the VM runs; a reserved static IP bills while idle, so release it if the app is ever shut down for good.
- [ ] **Find out why the VM froze** (it needed a Reset). On the VM:
  ```bash
  free -h; df -h /; sudo journalctl -k -b -1 --no-pager | grep -iE "oom|killed process" | tail -5
  ```
  The VM has about 1 GB of memory. If it ran out, add a 2 GB swap file.
- [ ] *Optional:* an nginx rate limit on `/api/auth/login`, on top of the app's own (snippet at the end of [auth.md](auth.md)).

## My data

- [ ] **Add the payoff date to the real mortgage** on Net Worth, so Mortgage Payoff works out the monthly payment instead of asking for it.

## Standardization pass (after the initial features)

- [ ] **Fix the frontend tests that already fail on `main`:** about 30 failures, mostly old fixtures in `FrontendComponents`, `MetricsCards` and `WatchlistTable`. The property test "Activity feed ordering and limit" (`dashboard-logic.test.ts`) fails now and then. Also `tsc -b` errors in old test files.
- [ ] **Format dates the same way everywhere**, with the browser's built-in date formatting (`Intl.DateTimeFormat`).
- [ ] **Bring older code up to the current conventions:**
  - `transactions.py` `/sells` and `income.py` routers still hold logic and build response dicts by hand;
  - lint warnings in older files (ruff and mypy in `portfolio_analysis_service.py`, `plaid.py` and others; prettier in `Sidebar.tsx` and `Settings.tsx`);

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

- 2026-11-14: backend tests that failed on `main` all pass. Four were tests calling live Yahoo Finance (now an `offline_market` fixture) or outdated setup. One was a real rounding bug: selling part of a position nudged the average cost of the shares kept.
- 2026-11-14: unknown routes and wrong methods (404/405) return the usual `{success, data, error}` envelope.
- 2026-11-14: `from_orm` replaced with `model_validate` in `OptionsService`.
- 2026-11-14: fresh installs work. Every migration runs on an empty database (`a1b2c3d4e5f6` no longer drops a column default, which SQLite can't do); `earnings_cache` has a migration; a database the app creates itself is stamped at the newest migration. Covered by `tests/unit/test_migrations.py`.

- 2026-11-14: own sign-in page replacing nginx basic auth; one owner account made on the server; 60-minute idle and 12-hour session limits; lockout after 5 failed sign-ins; CSRF header check. See [auth.md](auth.md).
- 2026-11-14: two-step verification (authenticator codes and backup codes), on in production.
