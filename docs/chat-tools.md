# Chat tools

Read-only functions the chat assistant can call to answer questions. They sit in a `ToolRegistry` so a model can use them through function calling. They reuse the existing services and repositories and run no queries of their own.

| | File |
|---|---|
| Registry, context, errors, `money()` | `backend/app/services/chat_tools/registry.py` |
| Tools | `backend/app/services/chat_tools/accounts.py`, `bills.py`, `cashflow.py`, `debts.py`, `networth.py`, `portfolio.py` |
| `build_registry()` | `backend/app/services/chat_tools/__init__.py` |
| Input and result schemas | `backend/app/schemas/chat_tools.py` |
| Tests | `backend/tests/unit/test_chat_tools.py`, `test_chat_tools_more.py` |

The rule-based chat engine (`docs/chat-engine.md`) calls them through `POST /api/chat`.

| Tool | Answers | Reuses |
|---|---|---|
| `getBalance` | Account balances, net worth totals | `FinancialAccountService.get_all`, `get_summary` |
| `getUpcomingBills` | Bills due in the next N days | `RecurringExpenseRepository`, `bill_dates()` |
| `getCashFlowForecast` | Will each bank account cover its bills before payday | `AccountForecastService.get_forecast` |
| `getIncome` | Paychecks, next pay date, what's left over each month | `IncomeService.get_all`, `get_cash_flow_summary` |
| `getDebts` | Credit cards (utilization, APR, due) and loans (paid off, payoff) | `FinancialAccountService.get_all` |
| `getNetWorthTrend` | How net worth changed over 1W–ALL | `FinancialAccountService.get_snapshots`, `get_summary` |
| `getPortfolio` | Portfolio value, gains, today's movers, brokers | `DashboardService.get_summary`, `get_broker_summary`, `HoldingsService.get_all_holdings` |

## How a call works

```python
registry = build_registry()                      # owner id from OWNER_USER_ID
ctx = ToolContext(db=db, user_id=owner_id)       # built by the server
result = registry.call("getUpcomingBills", {"withinDays": 14}, ctx)
result.model_dump(mode="json", by_alias=True)    # what goes back to the model
```

`registry.definitions()` returns `[{name, description, input_schema}]`, where `input_schema` is JSON Schema. This is the shape the Claude API's `tools` parameter takes.

`call()` does these steps in order:
1. **Who:** refuses with `ToolAccessError` unless `ctx.user_id` is the owner. This check comes first, so an outsider can't even learn which tools exist.
2. **Which:** raises `ToolError` for an unknown tool name.
3. **Input:** validates against the tool's schema: camelCase keys only, unknown keys rejected, strict types (`"30"` and `true` are not numbers). Any problem becomes a `ToolError` naming the field, for example `Invalid input for getUpcomingBills: withinDays: Input should be less than or equal to 60`.
4. **Run:** calls the handler, which may itself raise `ToolError`, for example `No account with id 99`.

A `ToolError` message is safe to show to the model so it can correct itself. Any other exception is a bug.

## Users

The app has one owner and no logins (see `CLAUDE.md`, Auth). Tools take the user from `ToolContext.user_id`, which the server sets. Inputs never contain a user, and a `userId` key in the input is rejected as an unknown field. The registry allows only `OWNER_USER_ID` (setting, default `"owner"`); anyone else gets `ToolAccessError` and no data.

When the app gains real users, add `user_id` to the tables and pass `ctx.user_id` into the services so each row is filtered. The handlers already receive the context, so their signatures won't change.

## Money

Amounts are `Decimal` rounded half-up to cents by `money()`, which converts stored floats through `str()` so binary noise doesn't leak (`0.1 + 0.2` → `0.30`). Amounts are never returned as floats. In JSON they serialize as strings (`"1234.57"`). All amounts are USD.

## Tools

### getBalance

Input: `{ accountId?: int ≥ 1 }`

Without `accountId`, returns every Net Worth account plus `totals`. With it, returns just that account and `totals` is null; an unknown id is a `ToolError`.

```json
{
  "accounts": [
    { "id": 3, "name": "Total Checking", "institution": "Chase", "type": "checking",
      "isAsset": true, "balance": "1234.57", "lastUpdated": "2026-11-01T14:03:00" }
  ],
  "totals": { "assets": "2234.58", "liabilities": "300.10", "netWorth": "1934.48", "portfolio": "1000.01" }
}
```

- **Liabilities** (cards, loans, mortgage) are positive amounts owed.
- **`assets`** includes the stock/ETF portfolio, as on the Net Worth page.
- **Totals** are summed from the rounded balances, so they always match the listed accounts.

Reuses `FinancialAccountService.get_all` and `get_summary` (for the portfolio value).

### getUpcomingBills

Input: `{ withinDays?: int 1–60, default 30 }`

Returns fixed costs due from today through today + `withinDays`, both days included, soonest first.

```json
{
  "start": "2026-11-02", "end": "2026-11-16",
  "bills": [
    { "billId": 7, "name": "Rent", "category": "Housing", "amount": "2400.00",
      "dueDate": "2026-11-05", "overdue": false, "autopay": false, "paidFrom": "Total Checking (Chase)" }
  ],
  "total": "2400.00",
  "withoutDueDate": 1
}
```

- **Repeating bills:** a bill that repeats inside the window (weekly, biweekly) appears once per due date.
- **Overdue manual bills:** each missed payment is listed as due today with `overdue: true`.
- **Overdue autopay bills:** these were paid automatically, so the next date is shown.
- **No due date:** these bills can't be placed in the window, so they're only counted in `withoutDueDate`.
- **Read-only:** unlike `RecurringExpenseService.get_all`, this doesn't save the rolled-forward autopay dates.

Reuses `RecurringExpenseRepository.get_all`, `bill_dates()` (`account_forecast_service.py`), and `account_link.display_label`.

### getCashFlowForecast

Input: `{ withinDays?: int 1–90, default 14 }`

For each checking or savings account that has a bill or paycheck in the window: the current balance, bills and income in the window, the ending balance, the lowest balance and its date, and `shortDate`/`shortBill` (the first day and the bill that take it below zero, or null). Also returns bills charged to credit cards (`cardCharges`) and bills with no paying account (`unlinked`, `unlinkedCount`), which aren't in any projection.

### getIncome

Input: none. Returns income sources (soonest next pay date first), with amount, frequency, monthly amount, next pay date and deposit account, plus the monthly picture:
- income, fixed costs and what's left over;
- `keptPct`, the share of income left after fixed costs;
- `liquidCash` in checking and savings;
- `emergencyMonths`, how many months of fixed costs that cash covers.

### getDebts

Input: none. Returns credit cards (balance, limit, `utilizationPct`, APR, due date) and loans or mortgages (balance, original amount, `paidOffPct`, APR, payoff date), largest balance first, plus totals. Overall `utilizationPct` counts only cards with a limit set.

### getNetWorthTrend

Input: `{ range?: "1W" | "1M" | "3M" | "1Y" | "ALL", default "1M" }`

Returns daily snapshots in the range, ending with today's live net worth (the same number the Net Worth page shows), evenly thinned to at most 40 points with both ends kept.
- `change` and `changePct` are measured from the first point.
- `high` and `low` use every day, not just the thinned points.
- **Not enough history:** with fewer than two points there's no trend yet, and `change` is null.

### getPortfolio

Input: none. Returns:
- market value, amount invested, and unrealized gain (with %);
- today's change, realized gain to date, and annual dividends;
- the number of holdings, and value and gain by broker;
- today's three biggest gainers and losers, in dollars;
- `stale: true` when the last market-data refresh failed.

**Read-only by design.** The watchlist and earnings data aren't tools. Reading the watchlist through its service fetches live quotes and writes them, and the earnings calendar calls Finnhub from its router.

## Planned enhancements

These were specified but need data the app doesn't have yet:

| Tool | Needs |
|---|---|
| `getSpending({ category?, from, to, groupBy?: 'category' \| 'month' })` | Bank and card transactions with dates, amounts and categories. Plaid currently imports balances only; add Plaid's transactions sync, a table and a repository. |
| `getRecentTransactions({ limit ≤ 50, category? })` | Same transactions data. |
| `compareSpending({ periodA, periodB, category? })` | Same, built on `getSpending`. |
| `getBudgetStatus({ category? })` | A budgets table (category, monthly limit), a service and a UI to set them, plus spending data to compare against. |

Other tools could be built from existing data but were left out as rarely asked, or better seen on their pages: realized gains by year, options summary, recent trades, watchlist and portfolio insights. Realized gains would first need the `/api/transactions/sells` logic moved from its router into a service.

## Adding a tool

1. Add the input model (with `Field` limits and descriptions, since models read them) and the result model to `app/schemas/chat_tools.py`, using `ChatModel` as the base. Money fields are `Decimal`.
2. Write the handler `(ctx: ToolContext, data: Input) -> Result` in `app/services/chat_tools/`. Call services or repositories with `ctx.db`, never raw queries. Convert amounts with `money()`. Raise `ToolError` for problems the model should hear about.
3. Define a `Tool(...)` with a camelCase name and a description that states units and limits, and register it in `build_registry()`.
4. Test the result shape, no data, invalid input, and access by another user.
