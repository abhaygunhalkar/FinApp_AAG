# Chat contract

What the chat widget sends to the backend, and what the bot sends back. This defines the shapes only. There is no chat endpoint or widget yet; see `docs/chat-feature-inventory.md` for what they will reuse.

## Where it lives

The frontend and backend are separate builds with no shared package, so the contract is defined twice and kept in step by shared test data:

| | File | Validated with |
|---|---|---|
| Backend | `backend/app/schemas/chat.py` | Pydantic v2 (`parse_chat_request`, `parse_chat_response`) |
| Frontend | `frontend/src/types/chat.ts` | Zod (`ChatRequestSchema`, `parseChatResponse`, `safeParseChatResponse`) |
| Shared examples | `docs/chat-contract.examples.json` | Read by both test suites |
| Tests | `backend/tests/unit/test_chat_schemas.py`, `frontend/src/__tests__/unit/chatContract.test.ts` | |

**To change the contract**, update both schema files, add or adjust examples in `docs/chat-contract.examples.json`, and update this page. Both test suites must pass: every valid example must be accepted (and come back unchanged), and every invalid example rejected, on both sides.

## Conventions

- **camelCase on the wire.** Unlike the rest of the API (snake_case), chat fields are camelCase: `sessionId`, `confirmAction`, `quickReplies`. Python code uses snake_case names (`session_id`), with camelCase aliases. Parse incoming JSON with `parse_chat_request()`, which rejects snake_case keys so both sides agree.
- **Strict.** Unknown fields are rejected on both sides, so a typo fails validation instead of being silently dropped.
- **Envelope.** The chat endpoint will return `ChatResponse` inside the usual envelope: `{ "success": true, "data": ChatResponse, "error": null }`. A failed request (bad input, server error) uses the envelope's `error`. A bot answer that explains a problem ("I couldn't reach Plaid") is a successful response containing an `error` message.
- **Numbers are numbers.** Amounts in `stat`, `table` and `chart` are raw numbers, not formatted strings, so the widget formats them and can apply the "hide numbers" toggle.

## Request

```ts
ChatRequest {
  sessionId: string          // 1–100 chars, chosen by the widget
  message?: string           // typed text; trimmed, then 1–2000 chars
  action?: ChatAction        // a clicked quick reply or confirm button
}                            // exactly one of message / action

ChatAction {
  type: string               // 1–64 chars, e.g. "mark_bill_paid"
  payload?: object           // any JSON object, e.g. { "billId": 12 }
}
```

```json
{ "sessionId": "s-1", "message": "What's my net worth?" }
{ "sessionId": "s-1", "action": { "type": "mark_bill_paid", "payload": { "billId": 12 } } }
```

**How actions round-trip:** the bot puts a `ChatAction` on a quick reply or confirm button. When the user clicks it, the widget sends that same object back, unchanged, as `ChatRequest.action`. The widget never builds actions itself.

## Response

```ts
ChatResponse {
  sessionId: string
  messages: BotMessage[]     // shown in order; may be empty
}
```

`BotMessage` is a union on `type`:

| `type` | Fields | Rules |
|---|---|---|
| `text` | `text` | non-empty |
| `stat` | `label`, `value: number`, `currency`, `delta?: number` | `currency` is a 3-letter uppercase code, default `"USD"` |
| `table` | `columns: string[]`, `rows: (string \| number \| null)[][]` | at least one column; every row has one cell per column |
| `chart` | `kind: "bar" \| "pie" \| "line"`, `series: { name, points: { label, value: number }[] }[]` | at least one series; a pie has exactly one |
| `quickReplies` | `options: { label, action: ChatAction }[]` | 1–6 options |
| `link` | `label`, `route` | an in-app route starting with `/` (e.g. `/net-worth`); `https://…` and `//…` are rejected |
| `confirm` | `prompt`, `confirmAction`, `cancelAction` | both actions required |
| `error` | `message`, `code?` | non-empty message |

```json
{
  "sessionId": "s-1",
  "messages": [
    { "type": "text", "text": "Here's where you stand today." },
    { "type": "stat", "label": "Net worth", "value": 330827.12, "currency": "USD", "delta": 1200.5 },
    { "type": "table", "columns": ["Bill", "Due", "Amount"], "rows": [["Rent", "Nov 5", 2400], ["Gym", null, 45]] },
    {
      "type": "chart",
      "kind": "pie",
      "series": [{ "name": "Assets", "points": [{ "label": "Real estate", "value": 545000 }, { "label": "Investments", "value": 124101 }] }]
    },
    {
      "type": "quickReplies",
      "options": [{ "label": "Bills due this week", "action": { "type": "show_bills_due" } }]
    },
    { "type": "link", "label": "Open Net Worth", "route": "/net-worth" },
    {
      "type": "confirm",
      "prompt": "Mark Rent ($2,400) as paid?",
      "confirmAction": { "type": "mark_bill_paid", "payload": { "billId": 12 } },
      "cancelAction": { "type": "cancel" }
    },
    { "type": "error", "message": "Couldn't reach Plaid. Balances may be out of date.", "code": "plaid_unavailable" }
  ]
}
```

More valid and invalid cases are in `docs/chat-contract.examples.json`.

## Safety rules for the handler and widget

- **Links stay in the app.** `link.route` is validated as an in-app path; the widget should navigate with the router, never `window.location`.
- **Confirm before writing.** Any action that changes data (mark a bill paid, update a balance) must first be offered as a `confirm` message. The backend runs the change only when it receives the `confirmAction` back. Treat action payloads as untrusted input and re-check them (e.g. the bill exists) before acting.
- **Validate on both ends.** The backend parses every request with `parse_chat_request()`, and the widget parses every response with `safeParseChatResponse()`. If a response fails validation, the widget shows a generic error rather than rendering partial data.
