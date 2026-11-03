# Chat assistant: what to reuse

Read-only review before building a chat assistant (a floating widget that answers questions about the owner's finances). This lists what already exists and should be called, not rebuilt, and what is missing. Conventions are in `CLAUDE.md`.

## Backend: data the chat can read

All services are classes of `@staticmethod`s that take a SQLAlchemy `Session`. The chat's tools should call these service methods directly (the same `get_db` session), not make HTTP calls back to its own API, and not query repositories from a router.

### Accounts and balances (Net Worth)

| Need | Reuse | Endpoint |
|---|---|---|
| All accounts with balance, type, APR, limit, due date, last sync | `FinancialAccountService.get_all(db)` | `GET /api/net-worth/accounts` |
| Totals: assets, liabilities, net worth, portfolio value | `FinancialAccountService.get_summary(db)` | `GET /api/net-worth/summary` |
| Daily net worth history (totals only) | `FinancialAccountService.get_snapshots(db)` | `GET /api/net-worth/snapshots` |
| Display name for an account | `FinancialAccountService.label(account)` | |
| Bank/card balances from Plaid | `PlaidService.sync_all(db)` (writes; balances only) | `POST /api/plaid/sync` |

Account types: `checking`, `savings`, `credit_card`, `loan`, `mortgage`, `investment`, `real_estate`, `vehicle`, `crypto`, `other_asset`, `other_liability`. Liabilities are stored as positive balances.

### Bills (Fixed Costs)

| Need | Reuse | Endpoint |
|---|---|---|
| All bills with amount, frequency, next due date, paying account, autopay | `RecurringExpenseService.get_all(db)` | `GET /api/recurring-expenses` |
| Monthly equivalent of any frequency | `RecurringExpenseService.monthly_amount(amount, frequency)` | |
| Next due date after a payment | `roll_forward()`, `add_periods()` in `recurring_expense_service.py` | |
| Bill dates in a window | `bill_dates()` in `account_forecast_service.py` | |
| Mark a bill paid (a write) | `RecurringExpenseService.mark_paid(db, id)` | `POST /api/recurring-expenses/{id}/mark-paid` |

### Income and cash flow

| Need | Reuse | Endpoint |
|---|---|---|
| Income sources and pay schedules | `IncomeService.get_all(db)` | `GET /api/income` |
| Monthly income vs. bills summary | `IncomeService.get_cash_flow_summary(db)` | `GET /api/cash-flow/summary` |
| Each account's balance through upcoming bills and paydays | `AccountForecastService.get_forecast(db, days)` (1–90 days) | `GET /api/cash-flow/forecast?days=` |
| Pay dates from a schedule | `app/services/pay_schedule.py` | |

### Categories

There is no categories table. Categories are fixed `Literal` lists in the schemas:
- Bills: `ExpenseCategory` in `app/schemas/recurring_expense.py` (Housing, Utilities, Groceries, Subscriptions, Debt payments, and others).
- Income: `IncomeCategory` in `app/schemas/income.py`.

### Investments

| Need | Reuse | Endpoint |
|---|---|---|
| Portfolio totals, unrealized and realized gain, daily change | `DashboardService.get_summary(db)` | `GET /api/dashboard/summary` |
| Value by broker | `DashboardService.get_broker_summary(db)` | `GET /api/dashboard/by-broker` |
| Holdings (stocks and ETFs) | `HoldingsService` | `GET /api/holdings`, `GET /api/etf-holdings` |
| Stock buy/sell history and lots | `TransactionService.get_transactions(db, holding_id)` | `GET /api/transactions?holding_id=` |
| Sells with realized gain | logic in the `/sells` router, using `LotService.cost_basis_by_sell` | `GET /api/transactions/sells` |
| Options trades and P&L | `OptionsService` | `GET /api/options`, `/api/options/summary` |
| Rule-based portfolio insights | `PortfolioAnalysisService` | `GET /api/portfolio/analysis` |

The `/sells` realized-gain calculation lives in the router, not a service. Move it into a service before the chat uses it.

### Budgets

None. There is no budget model, endpoint or page.

## How the user is identified

It isn't. The app has no users, logins, tokens or sessions; every request acts on the one owner's data and no service takes a user argument. Access is controlled at the edge by nginx basic auth on the VM (`docs/GCP-VM-Frontend.md`). In that documented config, basic auth is on the site (`location /`) but not on `location /api/`. Check the live config on the VM before exposing a chat endpoint that can read every balance.

## Frontend

- **Where to mount a floating widget:** `src/components/layout/AppLayout.tsx`, beside `<main>`. It renders on every page and is inside both `QueryClientProvider` and the router (`src/App.tsx`), so the widget can use query hooks and `useLocation()` to know the current page. Use `position: fixed` with a z-index above page content but below modals (dialogs use `fixed inset-0` overlays). Keep it clear of the mobile header and usable at 390px wide.
- **UI library and theme:** no component library. Tailwind v4 utilities; dark mode via the `dark` class on `<html>`, driven by `useUIStore().theme` (`src/store/uiStore.ts`). Shared pieces in `src/components/shared/`: `LoadingSpinner`, `EmptyState`, `ErrorNotification`, `DeleteConfirmation`, `IssuerBadge` (bank/card logos), `AccountSelect`.
- **Data fetching:** axios client in `src/api/client.ts` (`unwrapResponse()` unwraps the envelope, 10s timeout), one file per resource in `src/api/`, TanStack Query hooks in `src/hooks/` (`useAccounts`, `useNetWorthSummary`, `useRecurringExpenses`, `useCashFlowSummary`, `useAccountForecast`, `useDashboardSummary`, …). After the chat performs a write, invalidate the same query keys those hooks use.
- **UI state:** Zustand (`src/store/uiStore.ts`). Widget open/closed state belongs there; conversation history does not.
- **Charts:** Recharts (e.g. `components/networth/NetWorthChart.tsx`, `components/dashboard2/`).
- **Formatting:** `components/networth/format.ts` (`fmtMoney`, `fmtCompact`, `fmtPct`, `fmtShortDate`, `timeAgo`) and `components/dashboard2/format.ts` (`fmtMoney`, `fmtSigned`). They respect the "hide numbers" toggle (`uiStore.hideBalances`); chat answers that show amounts should too.

## Gaps

1. **No LLM client.** No Anthropic SDK in `pyproject.toml` and no API key setting in `app/config.py`. Adding the `anthropic` package and an `ANTHROPIC_API_KEY` setting needs the owner's OK (new dependency).
2. **No streaming.** Every endpoint returns the JSON envelope, and axios with a 10s timeout won't suit long or streamed answers. A chat endpoint needs either server-sent events (read with `fetch`, not axios) or a longer timeout and a non-streaming reply. It is the one place that would bypass the envelope, so document it as an exception.
3. **No conversation storage.** Add a table plus an Alembic migration if history should survive a reload; otherwise keep it client-side only.
4. **No auth on the API.** See above. A chat endpoint can return any balance, so confirm `/api/` is behind basic auth before deploying.
5. **No bank transactions or spending history.** Plaid sync imports balances only, and `transactions` holds stock buys and sells only. Questions like "what did I spend on groceries last month" can't be answered from data; the chat can only use bill amounts and categories.
6. **No budgets.** "Am I over budget?" needs a new model, service and UI, or must be out of scope.
7. **Net worth history is totals only.** The chat can't say which account moved, or separate a newly added account from real gains.
8. **Logic in routers.** `/api/transactions/sells` realized gain and parts of `income.py` live in routers; move them into services before the chat tools call them.
9. **Privacy.** Answering means sending balances and account names to an external model API. Decide what is sent (for example, no account numbers or notes) and whether the "hide numbers" toggle also hides amounts in chat.
10. **Writes.** If the chat may act (mark a bill paid, update a balance), each action should be an explicit tool that calls the existing service method, with a confirm step in the widget, not free-form database access.
