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

It only offers what the two tools can answer.

| Intent | Example phrasings | Entities | Tool |
|---|---|---|---|
| `netWorth` | "what's my net worth", "how much am I worth", "total debt" | none | `getBalance` |
| `balances` | "show my balances", "how much is in savings", "what do I owe on amex", "chase balance" | `accountId`, matched against the user's own accounts | `getBalance` |
| `upcomingBills` | "bills due this week", "payments due in the next 10 days", "what do I have to pay tomorrow" | `withinDays` (1–60) | `getUpcomingBills` |
| `help` | "help", "hi", "what can you do" | none | none |

**Matching.** Each intent has regex patterns. The intent with the most matching patterns wins, and ties go to the one registered first.

**Account entity.** The message's words, minus words like "my" and "balance", are fuzzy-matched with `difflib` against the user's account names, institutions and types, so a typo like "chse" still finds Chase. The accounts come from the `getBalance` tool, loaded only when needed.
- One account matches: its balance is shown.
- Several match equally ("chase" with two Chase accounts): the bot asks "Which account do you mean?" with one chip per account.

**Window entity.** Regex handles "today" and "tomorrow" (1 day), "this week" (through Sunday), "next week", "this month", "next month", and "N days, weeks or months" (numbers or "a" to "six"). Anything over 60 days is capped at 60, and the reply says so.

**Not handled yet.** Amounts and categories aren't extracted, because no tool takes them yet. They come with the spending tools.

**Unsupported topics.** Questions about spending, transactions, budgets or purchases get a plain "I can't see spending, transactions or budgets yet" answer instead of a wrong one.

## Replies

- **Answers** combine `stat`, `table`, `text` and `link` messages:
  - **Net worth:** three stats and a link to Net Worth.
  - **One account:** a stat; card, loan and mortgage balances say "owed".
  - **All balances:** a table and a note that liability balances are owed.
  - **Bills:** a total stat, a table with overdue rows marked, notes for overdue and undated bills, and a link to Fixed Costs.
- **Follow-up chips:** every reply ends with a `quickReplies` message, except the forbidden error. The chips only ever point at the intents above.
  - Bills replies offer the other windows (this week / 30 / 60 days), never the one just shown.
  - A test clicks every chip reachable from the example questions, two levels deep, and checks none of them errors.
- **Quick replies skip parsing.** A chip's action `{type: <intent>, payload: {...}}` runs that intent directly. Only that intent's known keys are taken from the payload (`accountId`, `withinDays`), and the tool validates them again. An unknown action type gets an error and the starter chips.
- **Fallback.** "Sorry, I didn't catch that…" plus chips for net worth, balances and bills this week.
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
