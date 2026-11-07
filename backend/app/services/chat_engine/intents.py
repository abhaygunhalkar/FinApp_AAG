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
    ChartMessage,
    ChartPoint,
    ChartSeries,
    ChatAction,
    ErrorMessage,
    LinkMessage,
    QuickRepliesMessage,
    QuickReply,
    StatMessage,
    TableMessage,
    TextMessage,
)
from app.schemas.chat_tools import (
    GetBalanceResult,
    GetCashFlowForecastResult,
    GetDebtsResult,
    GetIncomeResult,
    GetNetWorthTrendResult,
    GetOptionsResult,
    GetPortfolioResult,
    GetUpcomingBillsResult,
    OptionPosition,
)
from app.services.chat_engine.entities import (
    MAX_DAYS,
    AccountRef,
    BillRef,
    extract_range,
    extract_window,
    match_accounts,
)

Entities = dict[str, Any]


@dataclass(frozen=True)
class ExtractContext:
    today: date
    # The user's accounts, loaded through the getBalance tool only when needed.
    accounts: Callable[[], list[AccountRef]]
    # The user's bills, loaded through the getBills tool only when needed.
    bills: Callable[[], list[BillRef]] = field(default=lambda: [])


@dataclass(frozen=True)
class FlowContext:
    """What a multi-step flow (Intent.run) can use: the date, the session's
    state (kept between turns), and the tools."""

    today: date
    state: dict[str, Any]
    call: Callable[[str, dict[str, Any]], Any]


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
    # A multi-step flow that writes its own reply (and any follow-ups) instead
    # of calling `tool` once; used for actions that change data.
    run: Callable[[Entities, FlowContext], list[BotMessage]] | None = None

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
        chip("Bills due this week", "upcomingBills", withinDays=days_to_sunday(today)),
        chip("Can I cover my bills?", "cashFlowForecast"),
        chip("Next paycheck", "income"),
        chip("Credit cards", "debts"),
        chip("Portfolio today", "portfolio"),
    ]


# Shown in the widget before the first message; mirrored in
# frontend/src/components/chat/examples.ts.
EXAMPLE_QUESTIONS = [
    "What's my net worth?",
    "Will I have enough to cover my bills?",
    "What bills are due this week?",
    "How is my portfolio doing today?",
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
                "I can tell you your net worth and how it's changed, any account's "
                "balance, which bills are coming up and whether your accounts "
                "cover them, your income, your credit cards and loans, how "
                "your stocks and ETFs are doing, and your options. You can also "
                'mark a bill paid ("I paid rent"). Try one of these:'
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
        r"\btotal (assets|liabilities)\b",
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
    # Offered only when there's a bill you pay yourself to mark.
    manual = (
        [chip("Mark a bill paid", "markBillPaid")]
        if any(not b.autopay for b in result.bills)
        else []
    )
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
    return [*chips[:2], *manual, chip("Net worth", "netWorth")]


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


def _text(text: str) -> TextMessage:
    return TextMessage(type="text", text=text)


def _stat(label: str, value: Decimal, delta: Decimal | None = None) -> StatMessage:
    return StatMessage(
        type="stat",
        label=label,
        value=float(value),
        delta=float(delta) if delta is not None else None,
    )


def _link(label: str, route: str) -> LinkMessage:
    return LinkMessage(type="link", label=label, route=route)


def _pct(value: float | None) -> str:
    return "—" if value is None else f"{value:g}%"


def _signed(amount: Decimal) -> str:
    return f"+{fmt_money(amount)}" if amount > 0 else fmt_money(amount)


def _signed_pct(value: float) -> str:
    """ "+2.2%" / "−2.83%", with a true minus sign like the rest of the app."""
    return f"{value:+g}%".replace("-", "−")


def _bills_this_week(today: date) -> QuickReply:
    return chip(
        "Bills due this week", "upcomingBills", withinDays=days_to_sunday(today)
    )


# --- cash-flow forecast --------------------------------------------------------

FORECAST_DAYS = 90


def _forecast_extract(text: str, ctx: ExtractContext) -> Entities:
    window = extract_window(text, ctx.today)
    return {} if window is None else {"withinDays": window.days}


def _forecast_format(
    result: GetCashFlowForecastResult, _e: Entities, _today: date
) -> list[BotMessage]:
    if not result.accounts:
        # Only accounts with a bill or paycheck in the window are projected.
        return [
            _text(
                "No bills or paychecks reach your checking or savings accounts "
                f"through {fmt_day(result.end)}. Only bills and pay linked to an "
                "account are projected; link them on Fixed Costs and Cash Flow."
            ),
            _link("Open Cash Flow", "/cash-flow"),
        ]
    short = [a for a in result.accounts if a.short_date is not None]
    out: list[BotMessage] = []
    if short:
        for a in short:
            assert a.short_date is not None
            out.append(
                ErrorMessage(
                    type="error",
                    code="shortfall",
                    message=f"{a.name} could run short on {fmt_day(a.short_date)}"
                    + (f", when {a.short_bill} is due." if a.short_bill else "."),
                )
            )
    else:
        out.append(
            _text(
                "Yes. Every account stays above zero through " f"{fmt_day(result.end)}."
            )
        )
    out.append(
        TableMessage(
            type="table",
            # Lowest point and where it ends up answer "will I have enough";
            # four columns also fit the chat panel.
            columns=["Account", "Lowest", "On", f"{fmt_day(result.end)}"],
            rows=[
                [
                    a.name,
                    float(a.lowest_balance),
                    fmt_day(a.lowest_date),
                    float(a.ending_balance),
                ]
                for a in result.accounts
            ],
        )
    )
    notes = []
    if result.card_charges:
        notes.append(f"{fmt_money(result.card_charges)} of bills go on credit cards")
    if result.unlinked_count:
        notes.append(
            f"{fmt_money(result.unlinked)} in {result.unlinked_count} "
            f"bill{'' if result.unlinked_count == 1 else 's'} with no paying "
            "account isn't counted"
        )
    if notes:
        out.append(_text("; ".join(notes).capitalize() + "."))
    out.append(_link("Open Cash Flow", "/cash-flow"))
    return out


def _forecast_follow_ups(
    result: GetCashFlowForecastResult, _e: Entities, today: date
) -> list[QuickReply]:
    shown = (result.end - result.start).days
    windows = [("Next 7 days", 7), ("Next 30 days", 30), ("Next 60 days", 60)]
    chips = [
        chip(label, "cashFlowForecast", withinDays=d)
        for label, d in windows
        if d != shown
    ]
    return [*chips[:2], chip("Next paycheck", "income"), _bills_this_week(today)]


CASH_FLOW_FORECAST = Intent(
    name="cashFlowForecast",
    patterns=_p(
        r"\benough\b",
        r"\b(run|running) (out|short|low)\b",
        r"\b(cover|afford)\b",
        r"\b(forecast|projected|projection)\b",
        r"\b(before|until|till) (my )?(next )?pay ?(day|check)\b",
        r"\boverdra\w*\b",
    ),
    tool="getCashFlowForecast",
    extract=_forecast_extract,
    payload_keys=frozenset({"withinDays"}),
    build_input=lambda e: {"withinDays": e["withinDays"]} if "withinDays" in e else {},
    format=_forecast_format,
    follow_ups=_forecast_follow_ups,
)


# --- income ----------------------------------------------------------------------


def _income_format(
    result: GetIncomeResult, _e: Entities, _today: date
) -> list[BotMessage]:
    if not result.sources:
        return [
            _text("You haven't added any income yet. Add it on the Cash Flow page."),
            _link("Open Cash Flow", "/cash-flow"),
        ]
    out: list[BotMessage] = []
    nxt = next((s for s in result.sources if s.next_pay_date), None)
    if nxt is not None and nxt.next_pay_date is not None:
        out.append(
            _text(
                f"Next paycheck: {nxt.name} on {fmt_day(nxt.next_pay_date)} "
                f"({fmt_money(nxt.amount)})."
            )
        )
    out += [
        _stat("Monthly income", result.monthly_income),
        _stat("Left over each month", result.monthly_left_over),
        TableMessage(
            type="table",
            columns=["Income", "Next pay", "Amount", "How often"],
            rows=[
                [
                    s.name,
                    fmt_day(s.next_pay_date) if s.next_pay_date else None,
                    float(s.amount),
                    s.frequency,
                ]
                for s in result.sources
            ],
        ),
    ]
    facts = [
        f"Fixed costs take {fmt_money(result.monthly_fixed_costs)} a month"
        + (
            f", so you keep {result.kept_pct:g}% of income"
            if result.kept_pct is not None
            else ""
        )
        + "."
    ]
    if result.emergency_months is not None:
        facts.append(
            f"Your {fmt_money(result.liquid_cash)} in checking and savings covers "
            f"{result.emergency_months:g} months of fixed costs."
        )
    out += [_text(" ".join(facts)), _link("Open Cash Flow", "/cash-flow")]
    return out


INCOME = Intent(
    name="income",
    patterns=_p(
        r"\b(income|salary|earn\w*)\b",
        r"\bpay ?(day|check|checks)\b",
        r"\bget(ting)? paid\b",
        r"\b(left ?over|surplus)\b",
        r"\bcash ?flow\b",
    ),
    tool="getIncome",
    extract=_no_entities,
    payload_keys=frozenset(),
    build_input=lambda _e: {},
    format=_income_format,
    follow_ups=lambda _r, _e, today: [
        chip("Can I cover my bills?", "cashFlowForecast"),
        _bills_this_week(today),
        chip("Net worth", "netWorth"),
    ],
)


# --- debts -------------------------------------------------------------------------


def _debts_format(
    result: GetDebtsResult, _e: Entities, _today: date
) -> list[BotMessage]:
    if not result.cards and not result.loans:
        return [
            _text("You have no credit cards or loans tracked."),
            _link("Open Net Worth", "/net-worth"),
        ]
    out: list[BotMessage] = [_stat("Total owed", result.total)]
    if result.cards:
        used = (
            f" of {fmt_money(result.card_limit)} limit, "
            f"{_pct(result.utilization_pct)} used"
            if result.card_limit
            else ""
        )
        out += [
            _text(f"Credit cards: {fmt_money(result.card_balance)}{used}."),
            TableMessage(
                type="table",
                columns=["Card", "Balance", "Used", "APR", "Due"],
                rows=[
                    [
                        c.name,
                        float(c.balance),
                        _pct(c.utilization_pct),
                        _pct(c.apr),
                        fmt_day(c.due_date) if c.due_date else None,
                    ]
                    for c in result.cards
                ],
            ),
        ]
        priced = [c for c in result.cards if c.apr is not None and c.balance > 0]
        if len(priced) > 1:
            top = max(priced, key=lambda c: c.apr or 0)
            out.append(
                _text(f"Highest APR with a balance: {top.name} at {_pct(top.apr)}.")
            )
    if result.loans:
        out.append(
            TableMessage(
                type="table",
                columns=["Loan", "Balance", "Paid off", "APR", "Payoff"],
                rows=[
                    [
                        loan.name,
                        float(loan.balance),
                        _pct(loan.paid_off_pct),
                        _pct(loan.apr),
                        f"{loan.payoff_date:%b %Y}" if loan.payoff_date else None,
                    ]
                    for loan in result.loans
                ],
            )
        )
    out.append(_link("Open Net Worth", "/net-worth"))
    return out


DEBTS = Intent(
    name="debts",
    patterns=_p(
        r"\bcredit ?cards?\b",
        r"\butili[sz]ation\b",
        r"\b(debts?|loans?|mortgage)\b",
        r"\baprs?\b",
        r"\bpay ?off\b",
        r"\binterest\b",
    ),
    tool="getDebts",
    extract=_no_entities,
    payload_keys=frozenset(),
    build_input=lambda _e: {},
    format=_debts_format,
    follow_ups=lambda _r, _e, today: [
        _bills_this_week(today),
        chip("Account balances", "balances"),
        chip("Net worth", "netWorth"),
    ],
)


# --- net worth trend ---------------------------------------------------------------

RANGE_WORDS = {
    "1W": "past week",
    "1M": "past month",
    "3M": "past 3 months",
    "1Y": "past year",
    "ALL": "since you started tracking",
}


def _trend_extract(text: str, _ctx: ExtractContext) -> Entities:
    found = extract_range(text)
    return {} if found is None else {"range": found}


def _trend_format(
    result: GetNetWorthTrendResult, _e: Entities, _today: date
) -> list[BotMessage]:
    words = RANGE_WORDS[result.range]
    if result.change is None:
        return [
            _text(
                "There isn't enough history yet to show a trend. A snapshot is "
                "saved every day, so check back soon."
            ),
            _link("Open Net Worth", "/net-worth"),
        ]
    assert result.high is not None and result.low is not None
    # The stat card already shows the change in dollars; say it as a share.
    if result.change == 0:
        summary = f"No change over the {words}."
    else:
        size = (
            f"{abs(result.change_pct):g}%"
            if result.change_pct is not None
            else fmt_money(abs(result.change))
        )
        direction = "Up" if result.change > 0 else "Down"
        summary = (
            f"{direction} {size} over the {words}. "
            f"High {fmt_money(result.high)}, low {fmt_money(result.low)}."
        )
    return [
        _stat("Net worth", result.points[-1].value, result.change),
        _text(summary),
        ChartMessage(
            type="chart",
            kind="line",
            series=[
                ChartSeries(
                    name="Net worth",
                    points=[
                        ChartPoint(label=fmt_day(p.date), value=float(p.value))
                        for p in result.points
                    ],
                )
            ],
        ),
        _link("Open Net Worth", "/net-worth"),
    ]


def _trend_follow_ups(
    result: GetNetWorthTrendResult, _e: Entities, _today: date
) -> list[QuickReply]:
    ranges = [
        ("Past week", "1W"),
        ("Past month", "1M"),
        ("Past 3 months", "3M"),
        ("Past year", "1Y"),
    ]
    chips = [
        chip(label, "netWorthTrend", range=code)
        for label, code in ranges
        if code != result.range
    ]
    return [*chips[:2], chip("Net worth breakdown", "netWorth")]


NET_WORTH_TREND = Intent(
    name="netWorthTrend",
    patterns=_p(
        r"\bnet ?worth\b.*\b(chang\w*|trend\w*|grow\w*|grew|gone (up|down)|went "
        r"(up|down)|histor\w*|over time)\b",
        r"\bhow (has|did|is) my net ?worth (been )?(chang|do|go|trend)\w*",
        r"\b(trend|history) of my net ?worth\b",
    ),
    tool="getNetWorthTrend",
    extract=_trend_extract,
    payload_keys=frozenset({"range"}),
    build_input=lambda e: {"range": e["range"]} if "range" in e else {},
    format=_trend_format,
    follow_ups=_trend_follow_ups,
)


# --- portfolio ---------------------------------------------------------------------


# What each portfolio filter is called, and where its page is.
KINDS = {
    "all": (
        "Portfolio value",
        "holdings",
        "stocks or ETFs",
        "Open Holdings",
        "/holdings",
    ),
    "stock": ("Stock value", "stocks", "stocks", "Open Holdings", "/holdings"),
    "etf": ("ETF value", "ETFs", "ETFs", "Open ETF Holdings", "/etf-holdings"),
}

ETF_WORDS = re.compile(r"\b(etfs?|index funds?|funds?)\b")
STOCK_WORDS = re.compile(r"\b(stocks?|shares|equit(y|ies))\b")


def _portfolio_extract(text: str, _ctx: ExtractContext) -> Entities:
    t = text.lower()
    etf, stock = bool(ETF_WORDS.search(t)), bool(STOCK_WORDS.search(t))
    if etf and not stock:
        return {"type": "etf"}
    if stock and not etf:
        return {"type": "stock"}
    return {}


def _portfolio_format(
    result: GetPortfolioResult, _e: Entities, _today: date
) -> list[BotMessage]:
    label, count_word, empty_word, link_label, route = KINDS[result.type]
    if result.holdings == 0:
        return [
            _text(f"You don't have any {empty_word} yet."),
            _link(link_label, route),
        ]
    gain_pct = (
        f" ({_signed_pct(result.unrealized_gain_pct)})"
        if result.unrealized_gain_pct is not None
        else ""
    )
    out: list[BotMessage] = []
    if result.stale:
        out.append(_text("Prices may be out of date: the last market update failed."))
    out += [
        _stat(label, result.value, result.day_change),
        # Today's change is on the stat card; this adds the overall gain.
        _text(
            f"Overall {_signed(result.unrealized_gain)}"
            f"{gain_pct} on {fmt_money(result.invested)} invested, across "
            f"{result.holdings} {count_word}."
        ),
    ]
    movers = [*result.gainers, *result.losers]
    if movers:
        out.append(
            TableMessage(
                type="table",
                # Today's biggest moves; three columns fit the chat panel.
                columns=["Mover", "%", "Today"],
                rows=[
                    [m.ticker, _signed_pct(m.day_change_pct), float(m.day_change)]
                    for m in movers
                ],
            )
        )
    if len(result.brokers) > 1:
        out.append(
            TableMessage(
                type="table",
                columns=["Broker", "Value", "Gain"],
                rows=[
                    [b.broker, float(b.value), float(b.gain)] for b in result.brokers
                ],
            )
        )
    out.append(_link(link_label, route))
    return out


def _portfolio_follow_ups(
    result: GetPortfolioResult, _e: Entities, _today: date
) -> list[QuickReply]:
    switch = {
        "all": [
            chip("ETFs only", "portfolio", type="etf"),
            chip("Stocks only", "portfolio", type="stock"),
        ],
        "etf": [
            chip("Stocks only", "portfolio", type="stock"),
            chip("Whole portfolio", "portfolio", type="all"),
        ],
        "stock": [
            chip("ETFs only", "portfolio", type="etf"),
            chip("Whole portfolio", "portfolio", type="all"),
        ],
    }[result.type]
    return [*switch, chip("Options", "options"), chip("Net worth", "netWorth")]


PORTFOLIO = Intent(
    name="portfolio",
    patterns=_p(
        r"\bportfolio\b",
        r"\b(stocks?|etfs?|investments?|holdings?|shares|funds?)\b",
        r"\b(movers?|gainers?|losers?)\b",
        r"\b(market|unreali[sz]ed|dividends?)\b",
        r"\b(up|down) today\b",
    ),
    tool="getPortfolio",
    extract=_portfolio_extract,
    payload_keys=frozenset({"type"}),
    build_input=lambda e: {"type": e["type"]} if "type" in e else {},
    format=_portfolio_format,
    follow_ups=_portfolio_follow_ups,
)


# --- options -----------------------------------------------------------------------

MAX_OPTION_ROWS = 8


def _contract(p: OptionPosition) -> str:
    """ "MSFT 565C sold" / "SPY 500P bought ×2"."""
    right = "P" if p.trade_type.endswith("put") else "C"
    side = "sold" if p.trade_type.startswith("sell_") else "bought"
    count = f" ×{p.contracts}" if p.contracts > 1 else ""
    return f"{p.ticker} {p.strike.normalize():f}{right} {side}{count}"


def _options_format(
    result: GetOptionsResult, _e: Entities, today: date
) -> list[BotMessage]:
    if result.trades == 0:
        return [
            _text("You have no options trades yet."),
            _link("Open Options", "/options"),
        ]
    n = result.open_positions
    facts = [
        f"{n} open position{'' if n == 1 else 's'}, "
        f"{result.expiring_this_week} expiring this week."
    ]
    if result.win_rate is not None:
        facts.append(f"Win rate {result.win_rate:g}% on closed trades.")
    out: list[BotMessage] = [
        _stat("Options P&L", result.realized_pnl),
        _text(" ".join(facts)),
    ]
    if result.open:
        out.append(
            TableMessage(
                type="table",
                columns=["Open", "Expires", "Premium"],
                rows=[
                    [
                        _contract(p),
                        "Today" if p.expiry_date == today else fmt_day(p.expiry_date),
                        float(p.premium),
                    ]
                    for p in result.open[:MAX_OPTION_ROWS]
                ],
            )
        )
        if len(result.open) > MAX_OPTION_ROWS:
            more = len(result.open) - MAX_OPTION_ROWS
            out.append(_text(f"{more} more on the Options page."))
    out.append(_link("Open Options", "/options"))
    return out


OPTIONS = Intent(
    name="options",
    patterns=_p(
        r"\boptions?\b",
        r"\b(puts?|calls?)\b",
        r"\bpremiums?\b",
        r"\bexpir\w*",
        r"\b(strikes?|wheel|assigned|assignment|contracts?)\b",
    ),
    tool="getOptions",
    extract=_no_entities,
    payload_keys=frozenset(),
    build_input=lambda _e: {},
    format=_options_format,
    follow_ups=lambda _r, _e, _today: [
        chip("Portfolio today", "portfolio"),
        chip("Net worth", "netWorth"),
    ],
)


# Topics people will ask about that need data the app doesn't have yet.
UNSUPPORTED = re.compile(
    r"\b(spen[dt]|spending|budgets?|transactions?|purchases?|groceries)\b"
)


def default_intents() -> IntentRegistry:
    registry = IntentRegistry()
    # Order breaks ties: the more specific intent goes first.
    from app.services.chat_engine.flows import CANCEL_FLOW, MARK_BILL_PAID

    for intent in (
        HELP,
        CANCEL_FLOW,
        MARK_BILL_PAID,
        NET_WORTH_TREND,
        NET_WORTH,
        CASH_FLOW_FORECAST,
        DEBTS,
        UPCOMING_BILLS,
        INCOME,
        OPTIONS,
        PORTFOLIO,
        BALANCES,
    ):
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
