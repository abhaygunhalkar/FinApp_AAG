# Chat tools

Read-only functions the chat assistant can call to answer questions. They sit in a `ToolRegistry` so a model can use them through function calling. They reuse the existing services and repositories and run no queries of their own.

| | File |
|---|---|
| Registry, context, errors, `money()` | `backend/app/services/chat_tools/registry.py` |
| Tools | `backend/app/services/chat_tools/accounts.py`, `bills.py` |
| `build_registry()` | `backend/app/services/chat_tools/__init__.py` |
| Input and result schemas | `backend/app/schemas/chat_tools.py` |
| Tests | `backend/tests/unit/test_chat_tools.py` |

No endpoint or model calls these yet.

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

## Planned enhancements

These were specified but need data the app doesn't have yet:

| Tool | Needs |
|---|---|
| `getSpending({ category?, from, to, groupBy?: 'category' \| 'month' })` | Bank and card transactions with dates, amounts and categories. Plaid currently imports balances only; add Plaid's transactions sync, a table and a repository. |
| `getRecentTransactions({ limit ≤ 50, category? })` | Same transactions data. |
| `compareSpending({ periodA, periodB, category? })` | Same, built on `getSpending`. |
| `getBudgetStatus({ category? })` | A budgets table (category, monthly limit), a service and a UI to set them, plus spending data to compare against. |

Other tools could be built today on existing services: net worth trend (`get_snapshots`), cash-flow forecast (`AccountForecastService.get_forecast`), income (`IncomeService`), and portfolio summary (`DashboardService.get_summary`).

## Adding a tool

1. Add the input model (with `Field` limits and descriptions, since models read them) and the result model to `app/schemas/chat_tools.py`, using `ChatModel` as the base. Money fields are `Decimal`.
2. Write the handler `(ctx: ToolContext, data: Input) -> Result` in `app/services/chat_tools/`. Call services or repositories with `ctx.db`, never raw queries. Convert amounts with `money()`. Raise `ToolError` for problems the model should hear about.
3. Define a `Tool(...)` with a camelCase name and a description that states units and limits, and register it in `build_registry()`.
4. Test the result shape, no data, invalid input, and access by another user.
