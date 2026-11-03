# Chat engine

Turns one user turn (`ChatRequest`) into the bot's reply (`ChatResponse`, see `docs/chat-contract.md`) by calling the chat tools (`docs/chat-tools.md`). There is no endpoint or widget yet.

| | File |
|---|---|
| Interface and context | `backend/app/services/chat_engine/base.py` |
| Factory (`CHAT_ENGINE`) | `backend/app/services/chat_engine/factory.py` |
| Rule-based engine | `backend/app/services/chat_engine/rules.py` |
| Intents, formatters, follow-ups, example questions | `backend/app/services/chat_engine/intents.py` |
| Entity extraction (windows, accounts) | `backend/app/services/chat_engine/entities.py` |
| Tests | `backend/tests/unit/test_chat_engine.py` |

## Interface

```python
class ChatEngine(Protocol):
    def handle(self, request: ChatRequest, ctx: EngineContext) -> ChatResponse: ...

EngineContext(db, user_id, session: ChatSession(id, state), today)
```

- **Synchronous.** The tools are synchronous database reads, so `handle` is too. FastAPI runs synchronous endpoints in a thread pool. An LLM engine can add an async method later if it needs one.
- **Identity.** `user_id` comes from the server, never from the request. Anyone but the owner gets a single `error` message (`code: "forbidden"`) and nothing else.
- **Errors.** `handle` never raises for bad input or a tool error; it replies with an `error` message.

Get an engine through the factory, so callers don't depend on which one runs:

```python
engine = create_engine()  # CHAT_ENGINE setting, default "rules"
```

Only `rules` exists, and any other value is a startup error naming the available engines. To add an LLM engine, write a class with `handle`, give it the same `ToolRegistry` (`registry.definitions()` is already in function-calling format), and add it to `ENGINES` in `factory.py`.

## What the rule-based engine understands

It only offers what the tools can answer.

| Intent | Example phrasings | Entities | Tool |
|---|---|---|---|
| `netWorthTrend` | "how has my net worth changed this month", "net worth trend over the past year" | `range` (1W, 1M, 3M, 1Y, ALL) | `getNetWorthTrend` |
| `netWorth` | "what's my net worth", "how much am I worth", "total assets" | none | `getBalance` |
| `cashFlowForecast` | "will I have enough to cover my bills", "am I going to run short before payday", "can I afford my bills in the next 30 days" | `withinDays` | `getCashFlowForecast` |
| `debts` | "credit card utilization", "which card has the highest APR", "how much is left on my mortgage", "total debt" | none | `getDebts` |
| `income` | "when's my next paycheck", "when do I get paid", "what's left over each month", "cash flow" | none | `getIncome` |
| `portfolio` | "how is my portfolio doing today", "how are my stocks doing", "top movers" | none | `getPortfolio` |
| `markBillPaid` (flow) | "I paid rent", "mark the water bill as paid", "mark a bill paid" | `billId`, fuzzy-matched against your bills | `getBills`, then `markBillPaid` |
| `cancelFlow` | "cancel", "never mind", "stop" | none | none |
| `balances` | "show my balances", "how much is in savings", "what do I owe on amex", "chase balance" | `accountId`, matched against the user's own accounts | `getBalance` |
| `upcomingBills` | "bills due this week", "payments due in the next 10 days", "what do I have to pay tomorrow" | `withinDays` (1–60) | `getUpcomingBills` |
| `help` | "help", "hi", "what can you do" | none | none |

**Matching.** Each intent has regex patterns. The intent with the most matching patterns wins, and ties go to the one registered first. The order is `help`, `netWorthTrend`, `netWorth`, `cashFlowForecast`, `debts`, `upcomingBills`, `income`, `portfolio`, `balances`, chosen so the more specific intent wins:
- "what's my net worth" is a snapshot, because `netWorthTrend` only matches change words ("changed", "trend", "grown").
- "will I have enough to pay my bills" is a forecast.
- "credit card balances" lists the cards.

**Account entity.** The message's words, minus words like "my" and "balance", are fuzzy-matched with `difflib` against the user's account names, institutions and types, so a typo like "chse" still finds Chase. The accounts come from the `getBalance` tool, loaded only when needed.
- One account matches: its balance is shown.
- Several match equally ("chase" with two Chase accounts): the bot asks "Which account do you mean?" with one chip per account.

**Window entity.** Regex handles "today" and "tomorrow" (1 day), "this week" (through Sunday), "next week", "this month", "next month", and "N days, weeks or months" (numbers or "a" to "six"). Anything over 60 days is capped at 60, and the reply says so.

**Not handled yet.** Amounts and categories aren't extracted, because no tool takes them yet. They come with the spending tools.

**Unsupported topics.** Questions about spending, transactions, budgets or purchases get a plain "I can't see spending, transactions or budgets yet" answer instead of a wrong one.

## Flows that change data

**Marking a bill paid** is a multi-step flow (`backend/app/services/chat_engine/flows.py`), the one place the chat changes data. It mirrors Mark paid on the Fixed Costs page.

1. **Which bill.** "I paid rent" names it; a typo ("rnt") still finds it.
   - **Ambiguous** ("I paid the insurance"): "Which one?" with a chip per match.
   - **Missing** ("mark a bill paid") or **unknown** ("I paid unicorn"): chips for up to five bills you pay yourself, soonest due first (overdue first), plus Cancel. At this step you can also type the bill's name.
   - **Refused:** an autopay bill ("it moves on by itself") or one with no due date.
2. **Confirm.** A confirm card says "Mark Rent ($2,400.00, due Nov 5) as paid? It will next be due Dec 5." with Yes and No.
3. **Yes** marks it paid, says when it's next due, and offers "Mark another bill paid".

Safety rules:
- **Only the Yes button confirms.** Typing "yes" shows the card again with "Tap Yes on the card to confirm."
- **One-time key.** Each confirm card carries a random key. The bill to change is kept in the server-side session, not on the button, so a replayed or edited action can't change a different bill. A key that isn't the session's current one (after No, a cancel, a new conversation, or asking something else) gets "That confirmation is no longer valid, so nothing was changed."
- **Double clicks are safe.** The key is the tool's idempotency key, and recent keys are remembered in the session, so repeating Yes answers "Done" again without moving the date twice.
- **Cancel at any step:** the No or Cancel buttons, or typing "cancel", "never mind" or "stop" (and "no" at the confirm step). Asking something else or clicking another chip also drops the flow. "cancel" with nothing waiting answers "There's nothing to cancel."
- **The page refreshes.** After a confirmed action, the widget refreshes the app's cached data, so Fixed Costs shows the new date.

Session state for flows: `state["flow"] = {"name", "step": "choose" | "confirm", "billId", "key"}` and `state["completed"]` (the last 20 keys). An intent with a `run` function writes its own reply instead of calling one tool; flows import `FlowContext` (date, session state, tool caller).

## Replies

- **Answers** combine `stat`, `table`, `text`, `chart`, `error` and `link` messages:
  - **Net worth:** three stats and a link to Net Worth.
  - **One account:** a stat; card, loan and mortgage balances say "owed".
  - **All balances:** a table and a note that liability balances are owed.
  - **Bills:** a total stat, a table with overdue rows marked, notes for overdue and undated bills, and a link to Fixed Costs.
  - **Cash-flow forecast:** "Yes, every account stays above zero" or an `error` (code `shortfall`) naming the day and bill per account that runs short, then a table (account, lowest, on, ending), and a note on bills charged to cards.
  - **Income:** the next paycheck, monthly income and left-over stats, a table of sources, and how many months of fixed costs your cash covers.
  - **Debts:** a total-owed stat, card utilization, a cards table (balance, % used, APR, due) and a loans table (balance, % paid off, APR, payoff), and the highest-APR card with a balance.
  - **Net worth trend:** a stat with the change as its delta, a sentence with the % change and high/low, and a line chart.
  - **Portfolio:** a value stat with today's change as its delta, the overall gain, today's movers table and a by-broker table.
- **No repeated numbers.** When a stat card shows the change, the sentence under it gives something else (the %, the overall gain) rather than the same amount again.
- **Chat-panel-sized tables.** Tables keep to three or four columns so they fit the panel. Percentages are text (`"+2.2%"`) because number cells are drawn as money.
- **Follow-up chips:** every reply ends with a `quickReplies` message, except the forbidden error and a flow's confirm card (whose Yes/No buttons are the next step). The chips only ever point at the intents above. The bills answer adds "Mark a bill paid" when there's a bill you pay yourself.
  - Bills replies offer the other windows (this week / 30 / 60 days), never the one just shown.
  - A test clicks every chip reachable from the example questions, two levels deep, and checks none of them errors.
- **Quick replies skip parsing.** A chip's action `{type: <intent>, payload: {...}}` runs that intent directly. Only that intent's known keys are taken from the payload (`accountId`, `withinDays`), and the tool validates them again. An unknown action type gets an error and the starter chips.
- **Fallback.** "Sorry, I didn't catch that…" plus six starter chips: net worth, bills this week, "can I cover my bills?", next paycheck, credit cards and portfolio today. The same chips follow help and errors.
- **Unmatched messages are logged** (`INFO`, `app.services.chat_engine.rules`) to plan new intents. Before logging, digits become `#`, emails become `<email>`, the user's account and institution names become `<account>`, and the message is cut to 200 characters.
- **Example questions** for the widget's empty state are in `EXAMPLE_QUESTIONS`; a test checks each one is understood.

## Adding an intent

Before adding one, the tool it calls must exist; the engine refuses to start if any intent names a tool missing from the registry. Then:

1. Define an `Intent` in `intents.py` with:
   - `patterns`;
   - `extract` (text → entities);
   - `payload_keys` (the entities a chip may set);
   - `build_input` (entities → tool input);
   - `format` (tool result → messages);
   - `follow_ups` (chips, which must point at registered intents);
   - optionally `required` entities and a `clarify` hook.
2. Register it in `default_intents()`, in an order that resolves ties sensibly.
3. Add rows to the phrasing table in the tests: sample text, expected intent and entities.
