"""What the rule-based engine understands, and how it answers.

Each intent has patterns that recognise it, the entities it pulls from the
message, the chat tool it calls, a formatter for the tool's result, and the
follow-up quick replies that end every answer. Quick replies only ever point
at intents registered here, and each intent's tool must exist in the
ToolRegistry, so no chip leads nowhere.
"""

import re
from collections.abc import Callable, Mapping
from dataclasses import dataclass, field
from datetime import date
from decimal import Decimal
from typing import Any

from app.schemas.chat import (
    BotMessage,
    ChatAction,
    LinkMessage,
    QuickRepliesMessage,
    QuickReply,
    StatMessage,
    TableMessage,
    TextMessage,
)
from app.schemas.chat_tools import GetBalanceResult, GetUpcomingBillsResult
from app.services.chat_engine.entities import (
    MAX_DAYS,
    AccountRef,
    extract_window,
    match_accounts,
)

Entities = dict[str, Any]


@dataclass(frozen=True)
class ExtractContext:
    today: date
    # The user's accounts, loaded through the getBalance tool only when needed.
    accounts: Callable[[], list[AccountRef]]


@dataclass(frozen=True)
class Intent:
    name: str  # also the quick-reply action type that triggers it
    patterns: tuple[re.Pattern[str], ...]
    tool: str | None  # None: answered without a tool (help)
    extract: Callable[[str, ExtractContext], Entities]
    # Entity keys a quick-reply payload may set; anything else is ignored.
    payload_keys: frozenset[str]
    build_input: Callable[[Entities], dict[str, Any]]
    format: Callable[[Any, Entities, date], list[BotMessage]]
    follow_ups: Callable[[Any, Entities, date], list[QuickReply]]
    # Entities that must be present before calling the tool.
    required: tuple[str, ...] = ()
    # Messages that ask the user to fill in or narrow down entities, or None
    # when the entities are complete.
    clarify: Callable[[Entities], list[BotMessage] | None] = field(
        default=lambda _e: None
    )

    def score(self, text: str) -> int:
        return sum(1 for p in self.patterns if p.search(text))

    def from_payload(self, payload: Mapping[str, Any]) -> Entities:
        return {k: v for k, v in payload.items() if k in self.payload_keys}


class IntentRegistry:
    def __init__(self) -> None:
        self._intents: dict[str, Intent] = {}

    def register(self, intent: Intent) -> None:
        if intent.name in self._intents:
            raise ValueError(f"Intent {intent.name} is already registered")
        self._intents[intent.name] = intent

    def get(self, name: str) -> Intent | None:
        return self._intents.get(name)

    def all(self) -> list[Intent]:
        return list(self._intents.values())

    def match(self, text: str) -> Intent | None:
        """The intent whose patterns match the message most; ties go to the
        one registered first."""
        best, best_score = None, 0
        for intent in self._intents.values():
            score = intent.score(text.lower())
            if score > best_score:
                best, best_score = intent, score
        return best


# --- formatting helpers ----------------------------------------------------


def fmt_money(amount: Decimal) -> str:
    sign = "−" if amount < 0 else ""
    return f"{sign}${abs(amount):,.2f}"


def fmt_day(d: date) -> str:
    return f"{d:%b} {d.day}"


def chip(label: str, intent: str, **payload: Any) -> QuickReply:
    return QuickReply(
        label=label, action=ChatAction(type=intent, payload=payload or None)
    )


def days_to_sunday(today: date) -> int:
    return max(6 - today.weekday(), 1)


def starter_chips(today: date) -> list[QuickReply]:
    """The top things the bot can do; used for help, fallback and errors."""
    return [
        chip("Net worth", "netWorth"),
        chip("Account balances", "balances"),
        chip("Bills due this week", "upcomingBills", withinDays=days_to_sunday(today)),
    ]


# Shown in the widget before the first message.
EXAMPLE_QUESTIONS = [
    "What's my net worth?",
    "Show my account balances",
    "What bills are due this week?",
]

TYPE_LABELS = {
    "checking": "Checking",
    "savings": "Savings",
    "credit_card": "Credit card",
    "loan": "Loan",
    "mortgage": "Mortgage",
    "investment": "Investment",
    "real_estate": "Property",
    "vehicle": "Vehicle",
    "crypto": "Crypto",
    "other_asset": "Other asset",
    "other_liability": "Other liability",
}


def _p(*patterns: str) -> tuple[re.Pattern[str], ...]:
    return tuple(re.compile(p) for p in patterns)


def _no_entities(_text: str, _ctx: ExtractContext) -> Entities:
    return {}


# --- help --------------------------------------------------------------------


def _help_format(_r: Any, _e: Entities, _today: date) -> list[BotMessage]:
    return [
        TextMessage(
            type="text",
            text=(
                "I can tell you your net worth, the balance of any account, and "
                "which bills are coming up. Try one of these:"
            ),
        )
    ]


HELP = Intent(
    name="help",
    patterns=_p(r"\bhelp\b", r"\bwhat can you do\b", r"^(hi|hello|hey)\b"),
    tool=None,
    extract=_no_entities,
    payload_keys=frozenset(),
    build_input=lambda _e: {},
    format=_help_format,
    follow_ups=lambda _r, _e, today: starter_chips(today),
)


# --- net worth ---------------------------------------------------------------


def _net_worth_format(
    result: GetBalanceResult, _e: Entities, _today: date
) -> list[BotMessage]:
    totals = result.totals
    assert totals is not None  # getBalance without accountId always has totals
    return [
        StatMessage(type="stat", label="Net worth", value=float(totals.net_worth)),
        StatMessage(type="stat", label="Assets", value=float(totals.assets)),
        StatMessage(type="stat", label="Liabilities", value=float(totals.liabilities)),
        LinkMessage(type="link", label="Open Net Worth", route="/net-worth"),
    ]


NET_WORTH = Intent(
    name="netWorth",
    patterns=_p(
        r"\bnet ?worth\b",
        r"\bhow much am i worth\b",
        r"\btotal (assets|liabilities|debt)\b",
    ),
    tool="getBalance",
    extract=_no_entities,
    payload_keys=frozenset(),
    build_input=lambda _e: {},
    format=_net_worth_format,
    follow_ups=lambda _r, _e, today: [
        chip("Account balances", "balances"),
        chip("Bills due this week", "upcomingBills", withinDays=days_to_sunday(today)),
    ],
)


# --- balances ----------------------------------------------------------------


def _balances_extract(text: str, ctx: ExtractContext) -> Entities:
    found = match_accounts(text, ctx.accounts())
    if len(found) == 1:
        return {"accountId": found[0].id}
    if found:
        return {"choices": found}
    return {}


def _balances_clarify(entities: Entities) -> list[BotMessage] | None:
    choices: list[AccountRef] = entities.get("choices", [])
    if not choices:
        return None
    return [
        TextMessage(type="text", text="Which account do you mean?"),
        QuickRepliesMessage(
            type="quickReplies",
            options=[chip(a.label, "balances", accountId=a.id) for a in choices[:6]],
        ),
    ]


def _balances_format(
    result: GetBalanceResult, entities: Entities, _today: date
) -> list[BotMessage]:
    if not result.accounts:
        return [
            TextMessage(
                type="text",
                text="You haven't added any accounts yet. Add them on the Net "
                "Worth page.",
            ),
            LinkMessage(type="link", label="Open Net Worth", route="/net-worth"),
        ]
    if "accountId" in entities:
        a = result.accounts[0]
        name = f"{a.name} ({a.institution})" if a.institution else a.name
        return [
            StatMessage(
                type="stat",
                label=name if a.is_asset else f"{name} · owed",
                value=float(a.balance),
            )
        ]
    return [
        TableMessage(
            type="table",
            columns=["Account", "Type", "Balance"],
            rows=[
                [
                    f"{a.name} ({a.institution})" if a.institution else a.name,
                    TYPE_LABELS.get(a.type, a.type),
                    float(a.balance),
                ]
                for a in result.accounts
            ],
        ),
        TextMessage(
            type="text",
            text="Card, loan and mortgage balances are amounts owed.",
        ),
        LinkMessage(type="link", label="Open Net Worth", route="/net-worth"),
    ]


def _balances_follow_ups(
    _r: GetBalanceResult, entities: Entities, today: date
) -> list[QuickReply]:
    first = (
        chip("All balances", "balances")
        if "accountId" in entities
        else chip("Net worth", "netWorth")
    )
    return [
        first,
        chip("Bills due this week", "upcomingBills", withinDays=days_to_sunday(today)),
    ]


BALANCES = Intent(
    name="balances",
    patterns=_p(
        r"\bbalances?\b",
        r"\baccounts?\b",
        r"\bhow much (money|cash)\b",
        r"\bhow much (is|do i have) (in|left)\b",
        r"\b(owe|owed)\b",
    ),
    tool="getBalance",
    extract=_balances_extract,
    payload_keys=frozenset({"accountId"}),
    build_input=lambda e: {"accountId": e["accountId"]} if "accountId" in e else {},
    format=_balances_format,
    follow_ups=_balances_follow_ups,
    clarify=_balances_clarify,
)


# --- upcoming bills ----------------------------------------------------------


def _bills_extract(text: str, ctx: ExtractContext) -> Entities:
    window = extract_window(text, ctx.today)
    if window is None:
        return {}
    return {"withinDays": window.days, "capped": window.capped}


def _bills_format(
    result: GetUpcomingBillsResult, entities: Entities, _today: date
) -> list[BotMessage]:
    out: list[BotMessage] = []
    if entities.get("capped"):
        out.append(
            TextMessage(
                type="text",
                text=f"I can look up to {MAX_DAYS} days ahead, so this runs "
                f"through {fmt_day(result.end)}.",
            )
        )
    if not result.bills:
        out.append(
            TextMessage(
                type="text", text=f"No bills due through {fmt_day(result.end)}."
            )
        )
    else:
        overdue = sum(1 for b in result.bills if b.overdue)
        out += [
            StatMessage(
                type="stat",
                label=f"Bills due through {fmt_day(result.end)}",
                value=float(result.total),
            ),
            TableMessage(
                type="table",
                columns=["Bill", "Due", "Amount", "Paid from"],
                rows=[
                    [
                        b.name,
                        "Overdue" if b.overdue else fmt_day(b.due_date),
                        float(b.amount),
                        b.paid_from,
                    ]
                    for b in result.bills
                ],
            ),
        ]
        if overdue:
            out.append(
                TextMessage(
                    type="text",
                    text=f"{overdue} {'is' if overdue == 1 else 'are'} overdue. "
                    "Mark them paid on the Fixed Costs page once paid.",
                )
            )
    if result.without_due_date:
        n = result.without_due_date
        out.append(
            TextMessage(
                type="text",
                text=f"{n} bill{'' if n == 1 else 's'} {'has' if n == 1 else 'have'} "
                "no due date, so I can't place "
                f"{'it' if n == 1 else 'them'}.",
            )
        )
    out.append(LinkMessage(type="link", label="Open Fixed Costs", route="/fixed-costs"))
    return out


def _bills_follow_ups(
    result: GetUpcomingBillsResult, _e: Entities, today: date
) -> list[QuickReply]:
    shown = (result.end - result.start).days
    windows = [
        ("Due this week", days_to_sunday(today)),
        ("Next 30 days", 30),
        ("Next 60 days", MAX_DAYS),
    ]
    chips = [
        chip(label, "upcomingBills", withinDays=days)
        for label, days in windows
        if days != shown
    ]
    return [*chips[:2], chip("Net worth", "netWorth")]


UPCOMING_BILLS = Intent(
    name="upcomingBills",
    patterns=_p(
        r"\bbills?\b",
        r"\bdue\b",
        r"\bpayments?\b",
        r"\bwhat do i (have to|need to) pay\b",
        r"\b(upcoming|coming up)\b",
    ),
    tool="getUpcomingBills",
    extract=_bills_extract,
    payload_keys=frozenset({"withinDays"}),
    build_input=lambda e: {"withinDays": e["withinDays"]} if "withinDays" in e else {},
    format=_bills_format,
    follow_ups=_bills_follow_ups,
)

# Topics people will ask about that need data the app doesn't have yet.
UNSUPPORTED = re.compile(
    r"\b(spen[dt]|spending|budgets?|transactions?|purchases?|bought|groceries)\b"
)


def default_intents() -> IntentRegistry:
    registry = IntentRegistry()
    for intent in (HELP, NET_WORTH, UPCOMING_BILLS, BALANCES):
        registry.register(intent)
    return registry


__all__ = [
    "EXAMPLE_QUESTIONS",
    "ExtractContext",
    "Intent",
    "IntentRegistry",
    "UNSUPPORTED",
    "default_intents",
    "starter_chips",
]
