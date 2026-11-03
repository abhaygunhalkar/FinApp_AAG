"""Multi-step chat flows that change data. So far: marking a bill paid.

A flow fills its slots across turns (which bill), then asks for an explicit
confirmation. Its state lives in the server-side session:

    state["flow"] = {"name": "markBillPaid", "step": "choose" | "confirm",
                     "billId": ..., "key": ...}
    state["completed"] = {key: billId, ...}  # recent confirmations

Only the confirm button's action carries the one-time key; the bill comes from
the session, never from the button, so a replayed or edited action can't
change a different bill. The write goes through the markBillPaid tool with
that key as its idempotency key, so a double click marks the bill paid once.
"""

import re
import uuid
from typing import Any

from app.schemas.chat import (
    BotMessage,
    ChatAction,
    ConfirmMessage,
    ErrorMessage,
    LinkMessage,
    QuickRepliesMessage,
    QuickReply,
    TextMessage,
)
from app.schemas.chat_tools import BillItem
from app.services.chat_engine.entities import BillRef, bill_words, match_bills
from app.services.chat_engine.intents import (
    Entities,
    ExtractContext,
    FlowContext,
    Intent,
    chip,
    days_to_sunday,
    fmt_day,
    fmt_money,
    starter_chips,
)
from app.services.chat_tools import ToolError
from app.services.recurring_expense_service import add_periods

FLOW = "markBillPaid"
MAX_CHOICES = 5  # bills offered as chips, plus Cancel
KEEP_COMPLETED = 20

CANCEL_WORDS = re.compile(
    r"^\s*(cancel|never ?mind|stop|forget (it|that)|no thanks)\b", re.I
)
NO_WORDS = re.compile(r"^\s*(no|nope|don'?t)\b", re.I)
YES_WORDS = re.compile(r"^\s*(yes|yep|yeah|confirm|ok(ay)?|sure|do it)\b", re.I)


def _text(text: str) -> TextMessage:
    return TextMessage(type="text", text=text)


def _starters(fctx: FlowContext) -> QuickRepliesMessage:
    return QuickRepliesMessage(type="quickReplies", options=starter_chips(fctx.today))


def _fixed_costs_link() -> LinkMessage:
    return LinkMessage(type="link", label="Open Fixed Costs", route="/fixed-costs")


def _bills(fctx: FlowContext) -> list[BillItem]:
    bills: list[BillItem] = fctx.call("getBills", {}).bills
    return bills


def _bill_label(b: BillItem) -> str:
    if b.next_due_date is None:
        return b.name
    return f"{b.name} · {'overdue' if b.overdue else fmt_day(b.next_due_date)}"


def _end_flow(fctx: FlowContext) -> None:
    fctx.state.pop("flow", None)


# --- steps -------------------------------------------------------------------


def _choose(bills: list[BillItem], lead: str, fctx: FlowContext) -> list[BotMessage]:
    """Ask which bill, offering up to five as chips."""
    if not bills:
        _end_flow(fctx)
        return [
            _text(
                "You have no bills to mark paid: they're all on autopay or have "
                "no due date."
            ),
            _fixed_costs_link(),
            _starters(fctx),
        ]
    fctx.state["flow"] = {"name": FLOW, "step": "choose"}
    options: list[QuickReply] = [
        chip(_bill_label(b), FLOW, billId=b.id) for b in bills[:MAX_CHOICES]
    ]
    options.append(chip("Cancel", "cancelFlow"))
    return [_text(lead), QuickRepliesMessage(type="quickReplies", options=options)]


def _confirm_card(bill: BillItem, key: str) -> ConfirmMessage:
    assert bill.next_due_date is not None
    nxt = add_periods(bill.next_due_date, bill.frequency)
    due = (
        f"overdue since {fmt_day(bill.next_due_date)}"
        if bill.overdue
        else f"due {fmt_day(bill.next_due_date)}"
    )
    return ConfirmMessage(
        type="confirm",
        prompt=(
            f"Mark {bill.name} ({fmt_money(bill.amount)}, {due}) as paid? "
            f"It will next be due {fmt_day(nxt)}."
        ),
        confirm_action=ChatAction(type=FLOW, payload={"confirm": key}),
        cancel_action=ChatAction(type="cancelFlow"),
    )


def _ask_confirm(bill: BillItem, fctx: FlowContext) -> list[BotMessage]:
    if bill.autopay:
        _end_flow(fctx)
        return [
            _text(
                f"{bill.name} is on autopay, so it moves to its next due date by "
                "itself. There's nothing to mark."
            ),
            _starters(fctx),
        ]
    if bill.next_due_date is None:
        _end_flow(fctx)
        return [
            _text(f"{bill.name} has no due date set, so there's nothing to mark paid."),
            _fixed_costs_link(),
            _starters(fctx),
        ]
    key = uuid.uuid4().hex
    fctx.state["flow"] = {
        "name": FLOW,
        "step": "confirm",
        "billId": bill.id,
        "key": key,
    }
    return [_confirm_card(bill, key)]


def _apply(key: str, fctx: FlowContext) -> list[BotMessage]:
    """The confirm button was pressed: mark the bill paid, once per key."""
    completed: dict[str, int] = fctx.state.setdefault("completed", {})
    flow = fctx.state.get("flow") or {}
    if key in completed:
        # A repeat of a confirmation that already went through; the tool's
        # idempotency returns the first result without paying again.
        bill_id = completed[key]
    elif flow.get("step") == "confirm" and flow.get("key") == key:
        bill_id = int(flow["billId"])
    else:
        return [
            ErrorMessage(
                type="error",
                code="expired",
                message="That confirmation is no longer valid, so nothing was changed.",
            ),
            _starters(fctx),
        ]
    try:
        result = fctx.call(FLOW, {"billId": bill_id, "idempotencyKey": key})
    except ToolError as exc:
        _end_flow(fctx)
        return [ErrorMessage(type="error", message=f"{exc}."), _starters(fctx)]
    completed[key] = bill_id
    while len(completed) > KEEP_COMPLETED:
        completed.pop(next(iter(completed)))
    _end_flow(fctx)
    return [
        _text(
            f"Done. {result.name} is marked paid; it's next due "
            f"{fmt_day(result.next_due_date)}."
        ),
        _fixed_costs_link(),
        QuickRepliesMessage(
            type="quickReplies",
            options=[
                chip(
                    "Bills due this week",
                    "upcomingBills",
                    withinDays=days_to_sunday(fctx.today),
                ),
                chip("Mark another bill paid", FLOW),
                chip("Can I cover my bills?", "cashFlowForecast"),
            ],
        ),
    ]


# --- intents -------------------------------------------------------------------


def _mark_extract(text: str, ctx: ExtractContext) -> Entities:
    found = match_bills(text, ctx.bills())
    if len(found) == 1:
        return {"billId": found[0].id}
    if found:
        return {"billChoices": [b.id for b in found]}
    named = bill_words(text)
    return {"unknownBill": named} if named else {}


def _mark_run(entities: Entities, fctx: FlowContext) -> list[BotMessage]:
    if "confirm" in entities:
        return _apply(str(entities["confirm"]), fctx)
    bills = _bills(fctx)
    if "billId" in entities:
        bill = next((b for b in bills if b.id == entities["billId"]), None)
        if bill is None:
            _end_flow(fctx)
            return [
                ErrorMessage(type="error", message="That bill no longer exists."),
                _starters(fctx),
            ]
        return _ask_confirm(bill, fctx)
    payable = [b for b in bills if not b.autopay and b.next_due_date is not None]
    if "billChoices" in entities:
        ids = set(entities["billChoices"])
        return _choose([b for b in bills if b.id in ids], "Which one?", fctx)
    lead = "Which bill did you pay?"
    if "unknownBill" in entities:
        lead = f"I couldn't find a bill called “{entities['unknownBill']}”. {lead}"
    return _choose(payable, lead, fctx)


MARK_BILL_PAID = Intent(
    name=FLOW,
    patterns=(
        re.compile(r"\bmark(ed)?\b.*\bpaid\b"),
        re.compile(r"\b(i|we) (just |already )?paid\b"),
        re.compile(r"^\s*paid\b"),
    ),
    # Checked to exist at startup; the flow calls getBills and markBillPaid.
    tool=FLOW,
    extract=_mark_extract,
    # A chip picks a bill; the confirm button sends its one-time key.
    payload_keys=frozenset({"billId", "confirm"}),
    build_input=lambda _e: {},
    format=lambda _r, _e, _d: [],
    follow_ups=lambda _r, _e, _d: [],
    run=_mark_run,
)


def _cancel_run(_entities: Entities, fctx: FlowContext) -> list[BotMessage]:
    had_flow = fctx.state.pop("flow", None) is not None
    return [
        _text(
            "Okay, nothing was changed." if had_flow else "There's nothing to cancel."
        ),
        _starters(fctx),
    ]


CANCEL_FLOW = Intent(
    name="cancelFlow",
    patterns=(CANCEL_WORDS,),
    tool=None,
    extract=lambda _t, _c: {},
    payload_keys=frozenset(),
    build_input=lambda _e: {},
    format=lambda _r, _e, _d: [],
    follow_ups=lambda _r, _e, _d: [],
    run=_cancel_run,
)


def continue_flow(
    text: str, fctx: FlowContext, bills: list[BillRef]
) -> list[BotMessage] | None:
    """A typed message while a flow is waiting: cancel it, fill its slot, or
    (anything else) drop it and let the message be answered normally."""
    flow: dict[str, Any] | None = fctx.state.get("flow")
    if flow is None:
        return None
    step = flow.get("step")
    if CANCEL_WORDS.search(text) or (step == "confirm" and NO_WORDS.search(text)):
        return _cancel_run({}, fctx)
    if step == "confirm" and YES_WORDS.search(text):
        # Only the button confirms; show the same card again.
        bill = next((b for b in _bills(fctx) if b.id == flow.get("billId")), None)
        if bill is not None and bill.next_due_date is not None:
            return [
                _text("Tap Yes on the card to confirm."),
                _confirm_card(bill, str(flow["key"])),
            ]
    if step == "choose":
        found = match_bills(text, bills)
        if found:
            return _mark_run(
                (
                    {"billId": found[0].id}
                    if len(found) == 1
                    else {"billChoices": [b.id for b in found]}
                ),
                fctx,
            )
    _end_flow(fctx)
    return None
