"""Unit tests for the rule-based chat engine (app/services/chat_engine)."""

import logging
import re
from datetime import date
from typing import Any

import pytest
from sqlalchemy.orm import Session

from app.models.financial_account import FinancialAccount
from app.models.recurring_expense import RecurringExpense
from app.schemas.chat import (
    ChatAction,
    ChatRequest,
    dump_chat_response,
    parse_chat_response,
)
from app.services.chat_engine import (
    EXAMPLE_QUESTIONS,
    ChatSession,
    EngineContext,
    RuleBasedEngine,
    create_engine,
)
from app.services.chat_engine.entities import AccountRef, extract_window
from app.services.chat_engine.intents import (
    ExtractContext,
    Intent,
    IntentRegistry,
    default_intents,
)
from app.services.chat_engine.rules import redact
from app.services.chat_tools import ToolRegistry, build_registry
from app.services.chat_tools.accounts import GET_BALANCE

OWNER = "owner"
TODAY = date(2026, 11, 2)  # a Monday

ACCOUNTS = [
    AccountRef(1, "Total Checking", "Chase", "checking"),
    AccountRef(2, "High-Yield Savings", "Ally", "savings"),
    AccountRef(3, "Sapphire", "Chase", "credit_card"),
    AccountRef(4, "Amex Credit Card", "American Express", "credit_card"),
]


# --- phrasing -> intent and entities ------------------------------------------

PHRASES: list[tuple[str, str | None, dict[str, Any]]] = [
    # net worth
    ("What's my net worth?", "netWorth", {}),
    ("networth", "netWorth", {}),
    ("how much am I worth", "netWorth", {}),
    ("total assets", "netWorth", {}),
    # balances, all and one account
    ("Show my account balances", "balances", {}),
    ("balances", "balances", {}),
    ("how much money do I have", "balances", {}),
    ("balance of my ally savings", "balances", {"accountId": 2}),
    ("how much is in savings", "balances", {"accountId": 2}),
    ("what do I owe on amex?", "balances", {"accountId": 4}),
    ("whats my chse checking balance", "balances", {"accountId": 1}),  # typo
    ("Sapphire balance", "balances", {"accountId": 3}),
    ("chase balance", "balances", {"choices": [ACCOUNTS[0], ACCOUNTS[2]]}),
    # upcoming bills, with look-ahead windows
    ("What bills are due this week?", "upcomingBills", {"withinDays": 6}),
    ("bills due next week", "upcomingBills", {"withinDays": 13}),
    ("upcoming bills", "upcomingBills", {}),
    ("payments due in the next 10 days", "upcomingBills", {"withinDays": 10}),
    ("any bills in the next two weeks?", "upcomingBills", {"withinDays": 14}),
    ("bills due this month", "upcomingBills", {"withinDays": 28}),
    ("what do I have to pay tomorrow", "upcomingBills", {"withinDays": 1}),
    ("bills for the next 90 days", "upcomingBills", {"withinDays": 60}),
    # net worth trend
    ("how has my net worth changed this month?", "netWorthTrend", {"range": "1M"}),
    ("net worth trend over the past year", "netWorthTrend", {"range": "1Y"}),
    ("has my net worth grown in the last 3 months", "netWorthTrend", {"range": "3M"}),
    ("how is my net worth doing", "netWorthTrend", {}),
    ("net worth history since the beginning", "netWorthTrend", {"range": "ALL"}),
    # cash-flow forecast
    ("Will I have enough to cover my bills?", "cashFlowForecast", {}),
    ("am I going to run short before payday", "cashFlowForecast", {}),
    (
        "can I afford my bills in the next 30 days",
        "cashFlowForecast",
        {"withinDays": 30},
    ),
    ("cash forecast for next week", "cashFlowForecast", {"withinDays": 13}),
    # income
    ("when is my next paycheck?", "income", {}),
    ("when do I get paid", "income", {}),
    ("how much do I earn a month", "income", {}),
    ("what's left over each month", "income", {}),
    ("cash flow", "income", {}),
    # debts
    ("how much do I owe in total debt", "debts", {}),
    ("credit card utilization", "debts", {}),
    ("show my credit card balances", "debts", {}),
    ("which card has the highest APR", "debts", {}),
    ("how much is left on my mortgage", "debts", {}),
    # portfolio
    ("How is my portfolio doing today?", "portfolio", {}),
    ("how are my stocks doing", "portfolio", {}),
    ("top movers today", "portfolio", {}),
    ("unrealized gains on my investments", "portfolio", {}),
    # help
    ("help", "help", {}),
    ("hi there", "help", {}),
    ("what can you do?", "help", {}),
    # nothing matches
    ("what's the weather", None, {}),
    ("tell me a joke", None, {}),
]


@pytest.mark.parametrize(("text", "intent", "entities"), PHRASES)
def test_phrasing(text: str, intent: str | None, entities: dict[str, Any]) -> None:
    matched = default_intents().match(text)
    assert (matched.name if matched else None) == intent
    if matched:
        got = matched.extract(text, ExtractContext(TODAY, lambda: ACCOUNTS))
        got.pop("capped", None)
        assert got == entities


@pytest.mark.parametrize(
    ("text", "days", "capped"),
    [
        ("today", 1, False),
        ("this week", 6, False),
        ("a week", 7, False),
        ("3 days", 3, False),
        ("2 months", 60, False),
        ("next month", 59, False),  # through Dec 31
        ("120 days", 60, True),
        ("0 days", 1, False),
    ],
)
def test_windows(text: str, days: int, capped: bool) -> None:
    window = extract_window(text, TODAY)
    assert window is not None and (window.days, window.capped) == (days, capped)


def test_this_week_on_a_sunday_still_looks_a_day_ahead() -> None:
    window = extract_window("this week", date(2026, 11, 8))
    assert window is not None and window.days == 1


# --- the engine ---------------------------------------------------------------


@pytest.fixture
def engine() -> RuleBasedEngine:
    return RuleBasedEngine(build_registry(OWNER))


def ask(
    engine: RuleBasedEngine,
    db: Session,
    message: str | None = None,
    action: dict[str, Any] | None = None,
    user: str = OWNER,
) -> dict[str, Any]:
    """The reply as the widget receives it (JSON)."""
    request = ChatRequest(
        session_id="s-1",
        message=message,
        action=ChatAction(**action) if action else None,
    )
    response = engine.handle(
        request, EngineContext(db, user, ChatSession("s-1"), TODAY)
    )
    wire: dict[str, Any] = dump_chat_response(response)
    # Every reply must satisfy the wire contract.
    parse_chat_response(wire)
    return wire


def kinds(response: dict[str, Any]) -> list[str]:
    return [m["type"] for m in response["messages"]]


def chips(response: dict[str, Any]) -> list[tuple[str, str, dict[str, Any] | None]]:
    last = response["messages"][-1]
    assert last["type"] == "quickReplies"
    return [
        (o["label"], o["action"]["type"], o["action"].get("payload"))
        for o in last["options"]
    ]


@pytest.fixture
def data(db_session: Session) -> Session:
    for name, inst, kind, bal in [
        ("Total Checking", "Chase", "checking", 1500.25),
        ("High-Yield Savings", "Ally", "savings", 10000),
        ("Sapphire", "Chase", "credit_card", 300.1),
    ]:
        db_session.add(
            FinancialAccount(
                name=name, institution=inst, account_type=kind, balance=bal
            )
        )
    for name, amount, due, extra in [
        ("Rent", 2400, date(2026, 11, 5), {}),
        ("Water", 50, date(2026, 10, 20), {}),  # overdue
        ("Gym", 45, None, {}),
        ("Insurance", 600, date(2026, 12, 20), {"frequency": "semiannual"}),
    ]:
        db_session.add(
            RecurringExpense(
                name=name,
                category="Housing",
                amount=amount,
                frequency=extra.get("frequency", "monthly"),
                next_due_date=due,
            )
        )
    db_session.commit()
    return db_session


class TestAnswers:
    def test_net_worth(self, engine: RuleBasedEngine, data: Session) -> None:
        r = ask(engine, data, "what's my net worth?")
        assert kinds(r) == ["stat", "stat", "stat", "link", "quickReplies"]
        stats = {m["label"]: m["value"] for m in r["messages"] if m["type"] == "stat"}
        assert stats == {
            "Net worth": 11200.15,
            "Assets": 11500.25,
            "Liabilities": 300.1,
        }

    def test_all_balances(self, engine: RuleBasedEngine, data: Session) -> None:
        r = ask(engine, data, "show my balances")
        table = r["messages"][0]
        assert table["type"] == "table"
        rows = {row[0]: row[1:] for row in table["rows"]}
        assert rows["Total Checking (Chase)"] == ["Checking", 1500.25]
        assert rows["Sapphire (Chase)"] == ["Credit card", 300.1]
        assert len(rows) == 3

    def test_one_balance(self, engine: RuleBasedEngine, data: Session) -> None:
        r = ask(engine, data, "how much do I owe on sapphire")
        stat = r["messages"][0]
        assert stat["type"] == "stat"
        assert (stat["label"], stat["value"]) == ("Sapphire (Chase) · owed", 300.1)
        assert chips(r)[0][:2] == ("All balances", "balances")

    def test_ambiguous_account_asks_which(
        self, engine: RuleBasedEngine, data: Session
    ) -> None:
        r = ask(engine, data, "chase balance")
        assert kinds(r) == ["text", "quickReplies"]
        options = chips(r)
        assert [o[0] for o in options] == ["Total Checking (Chase)", "Sapphire (Chase)"]
        # Picking one answers for that account.
        label, action, payload = options[1]
        answer = ask(engine, data, action={"type": action, "payload": payload})
        assert answer["messages"][0]["type"] == "stat"
        assert answer["messages"][0]["label"].startswith("Sapphire")

    def test_no_accounts(self, engine: RuleBasedEngine, db_session: Session) -> None:
        r = ask(engine, db_session, "balances")
        assert r["messages"][0]["type"] == "text"
        assert "haven't added any accounts" in r["messages"][0]["text"]

    def test_upcoming_bills(self, engine: RuleBasedEngine, data: Session) -> None:
        r = ask(engine, data, "what bills are due this week?")
        assert kinds(r) == [
            "stat",
            "table",
            "text",
            "text",
            "link",
            "quickReplies",
        ]
        stat, table, overdue, undated = r["messages"][:4]
        assert (stat["label"], stat["value"]) == ("Bills due through Nov 8", 2450.0)
        assert [row[:3] for row in table["rows"]] == [
            ["Water", "Overdue", 50.0],
            ["Rent", "Nov 5", 2400.0],
        ]
        assert overdue["text"].startswith("1 is overdue")
        assert undated["text"] == "1 bill has no due date, so I can't place it."
        # The chips offer other windows, not the one just shown.
        assert [c[0] for c in chips(r)] == [
            "Next 30 days",
            "Next 60 days",
            "Mark a bill paid",
            "Net worth",
        ]

    def test_no_bills_in_window(
        self, engine: RuleBasedEngine, db_session: Session
    ) -> None:
        r = ask(engine, db_session, "bills due tomorrow")
        assert r["messages"][0]["text"] == "No bills due through Nov 3."

    def test_window_over_the_limit_says_so(
        self, engine: RuleBasedEngine, data: Session
    ) -> None:
        r = ask(engine, data, "bills in the next 6 months")
        assert r["messages"][0]["text"].startswith("I can look up to 60 days ahead")

    def test_every_answer_ends_with_quick_replies(
        self, engine: RuleBasedEngine, data: Session
    ) -> None:
        for question in [*EXAMPLE_QUESTIONS, "help", "weather?", "spending"]:
            assert ask(engine, data, question)["messages"][-1]["type"] == "quickReplies"


class TestQuickReplies:
    def test_action_runs_the_intent_without_parsing(
        self, engine: RuleBasedEngine, data: Session
    ) -> None:
        r = ask(
            engine,
            data,
            action={"type": "upcomingBills", "payload": {"withinDays": 60}},
        )
        assert r["messages"][0]["type"] == "stat"
        assert r["messages"][0]["label"] == "Bills due through Jan 1"

    def test_payload_cannot_add_other_inputs(
        self, engine: RuleBasedEngine, data: Session
    ) -> None:
        r = ask(
            engine,
            data,
            action={"type": "netWorth", "payload": {"userId": "x", "accountId": 1}},
        )
        assert r["messages"][0]["label"] == "Net worth"

    def test_bad_payload_is_an_error_not_a_crash(
        self, engine: RuleBasedEngine, data: Session
    ) -> None:
        r = ask(
            engine,
            data,
            action={"type": "upcomingBills", "payload": {"withinDays": 999}},
        )
        assert kinds(r) == ["error", "quickReplies"]
        assert "withinDays" in r["messages"][0]["message"]

    def test_unknown_action(self, engine: RuleBasedEngine, data: Session) -> None:
        r = ask(engine, data, action={"type": "getSpending"})
        assert kinds(r) == ["error", "quickReplies"]

    def test_no_chip_leads_nowhere(
        self, engine: RuleBasedEngine, data: Session
    ) -> None:
        """Click every chip reachable from the start, two levels deep."""
        intents = {i.name for i in default_intents().all()}
        frontier = [ask(engine, data, q) for q in [*EXAMPLE_QUESTIONS, "help"]]
        clicked = 0
        for _depth in range(2):
            nxt = []
            for response in frontier:
                for _label, action, payload in chips(response):
                    assert action in intents
                    reply = ask(
                        engine, data, action={"type": action, "payload": payload}
                    )
                    assert "error" not in kinds(reply), (action, payload)
                    nxt.append(reply)
                    clicked += 1
            frontier = nxt
        assert clicked > 20

    def test_example_questions_are_all_understood(self) -> None:
        for question in EXAMPLE_QUESTIONS:
            assert default_intents().match(question) is not None


class TestFallback:
    def test_unrecognised_message(
        self, engine: RuleBasedEngine, data: Session, caplog: pytest.LogCaptureFixture
    ) -> None:
        with caplog.at_level(logging.INFO, logger="app.services.chat_engine.rules"):
            r = ask(engine, data, "send $500 to Total Checking 1234, cc me@x.com")
        assert kinds(r) == ["text", "quickReplies"]
        assert [c[1] for c in chips(r)] == [
            "netWorth",
            "upcomingBills",
            "cashFlowForecast",
            "income",
            "debts",
            "portfolio",
        ]
        [record] = caplog.records
        logged = record.getMessage()
        assert "no_intent" in logged
        assert "500" not in logged and "1234" not in logged
        assert "Total Checking" not in logged and "me@x.com" not in logged
        assert "<account>" in logged and "<email>" in logged

    def test_spending_questions_say_what_is_missing(
        self, engine: RuleBasedEngine, data: Session, caplog: pytest.LogCaptureFixture
    ) -> None:
        with caplog.at_level(logging.INFO, logger="app.services.chat_engine.rules"):
            r = ask(engine, data, "how much did I spend on groceries?")
        assert "can't see spending" in r["messages"][0]["text"]
        assert "unsupported" in caplog.records[0].getMessage()

    def test_redact(self) -> None:
        assert redact("Pay Chase 12.50 now", ["Chase"]) == "Pay <account> ##.## now"
        assert len(redact("x" * 500, [])) == 200


class TestAccess:
    def test_another_user_gets_only_an_error(
        self, engine: RuleBasedEngine, data: Session
    ) -> None:
        for message in ["net worth", "help", "nonsense"]:
            r = ask(engine, data, message, user="someone-else")
            assert kinds(r) == ["error"]
            assert r["messages"][0]["code"] == "forbidden"


class TestEngineSetup:
    def test_factory_defaults_to_rules(self) -> None:
        assert isinstance(create_engine(), RuleBasedEngine)
        assert isinstance(create_engine("rules"), RuleBasedEngine)

    def test_factory_rejects_engines_that_dont_exist(self) -> None:
        with pytest.raises(ValueError, match=re.escape("Unknown CHAT_ENGINE 'llm'")):
            create_engine("llm")

    def test_intents_must_use_existing_tools(self) -> None:
        tools = ToolRegistry(OWNER)
        tools.register(GET_BALANCE)  # no getUpcomingBills
        with pytest.raises(ValueError, match="upcomingBills"):
            RuleBasedEngine(tools)

    def test_required_entities_are_asked_for(self, db_session: Session) -> None:
        intents = IntentRegistry()
        intents.register(
            Intent(
                name="one",
                patterns=(re.compile("one"),),
                tool="getBalance",
                extract=lambda _t, _c: {},
                payload_keys=frozenset({"accountId"}),
                build_input=lambda e: {"accountId": e["accountId"]},
                format=lambda _r, _e, _d: [],
                follow_ups=lambda _r, _e, _d: [],
                required=("accountId",),
            )
        )
        engine = RuleBasedEngine(build_registry(OWNER), intents)
        r = ask(engine, db_session, "one")
        assert r["messages"][0]["type"] == "error"
        assert r["messages"][0]["message"] == "I need accountId to answer that."


@pytest.fixture
def money(db_session: Session) -> Session:
    """Accounts with a bill that overdraws checking, a paycheck, history and
    holdings, for the cash flow, income, debt, trend and portfolio answers."""
    from app.models.holding import Holding
    from app.models.income_source import IncomeSource
    from app.models.net_worth_snapshot import NetWorthSnapshot

    checking = FinancialAccount(
        name="Total Checking",
        institution="Chase",
        account_type="checking",
        balance=1000,
    )
    card = FinancialAccount(
        name="Sapphire",
        institution="Chase",
        account_type="credit_card",
        balance=300,
        credit_limit=10000,
        apr=21.49,
    )
    store = FinancialAccount(
        name="Store card", account_type="credit_card", balance=50, apr=29.99
    )
    db_session.add_all([checking, card, store])
    db_session.commit()
    db_session.add_all(
        [
            RecurringExpense(
                name="Rent",
                category="Housing",
                amount=1500,
                frequency="monthly",
                next_due_date=date(2026, 11, 5),
                paid_from_account_id=checking.id,
            ),
            IncomeSource(
                name="Paycheck",
                category="Salary",
                amount=2000,
                frequency="biweekly",
                pay_date=date(2026, 11, 6),
                weekend_rule="none",
                deposited_to_account_id=checking.id,
            ),
            *[
                NetWorthSnapshot(
                    date=date(2026, 10, d),
                    total_assets=0,
                    total_liabilities=0,
                    net_worth=500 + d,
                )
                for d in range(3, 32)
            ],
            Holding(
                ticker="AAA",
                quantity=10,
                average_buy_price=100,
                current_price=120,
                broker="Schwab",
            ),
        ]
    )
    db_session.commit()
    return db_session


class TestMoreAnswers:
    def test_cash_flow_forecast_warns_of_a_shortfall(
        self, engine: RuleBasedEngine, money: Session
    ) -> None:
        r = ask(engine, money, "will I have enough to cover my bills?")
        assert kinds(r) == ["error", "table", "link", "quickReplies"]
        assert r["messages"][0] == {
            "type": "error",
            "code": "shortfall",
            "message": (
                "Total Checking (Chase) could run short on Nov 5, when Rent is due."
            ),
        }
        row = r["messages"][1]["rows"][0]
        assert row == ["Total Checking (Chase)", -500.0, "Nov 5", 1500.0]
        assert [c[0] for c in chips(r)] == [
            "Next 7 days",
            "Next 30 days",
            "Next paycheck",
            "Bills due this week",
        ]

    def test_cash_flow_forecast_all_clear(
        self, engine: RuleBasedEngine, money: Session
    ) -> None:
        r = ask(
            engine,
            money,
            action={"type": "cashFlowForecast", "payload": {"withinDays": 2}},
        )
        assert r["messages"][0]["text"].startswith(
            "No bills or paychecks reach your checking or savings accounts "
            "through Nov 4."
        )
        r = ask(
            engine,
            money,
            action={"type": "cashFlowForecast", "payload": {"withinDays": 7}},
        )
        assert r["messages"][0]["type"] == "error"  # Rent on Nov 5
        money.query(RecurringExpense).update({"amount": 900})
        money.commit()
        r = ask(
            engine,
            money,
            action={"type": "cashFlowForecast", "payload": {"withinDays": 7}},
        )
        assert r["messages"][0]["text"] == (
            "Yes. Every account stays above zero through Nov 9."
        )

    def test_income(self, engine: RuleBasedEngine, money: Session) -> None:
        r = ask(engine, money, "when's my next paycheck?")
        assert kinds(r) == [
            "text",
            "stat",
            "stat",
            "table",
            "text",
            "link",
            "quickReplies",
        ]
        assert (
            r["messages"][0]["text"] == "Next paycheck: Paycheck on Nov 6 ($2,000.00)."
        )
        assert r["messages"][1] == {
            "type": "stat",
            "label": "Monthly income",
            "value": 4333.33,
            "currency": "USD",
        }
        assert r["messages"][3]["rows"] == [["Paycheck", "Nov 6", 2000.0, "biweekly"]]

    def test_debts(self, engine: RuleBasedEngine, money: Session) -> None:
        r = ask(engine, money, "how are my credit cards looking")
        assert kinds(r) == ["stat", "text", "table", "text", "link", "quickReplies"]
        assert r["messages"][1]["text"] == (
            "Credit cards: $350.00 of $10,000.00 limit, 3% used."
        )
        assert r["messages"][2]["rows"][0] == [
            "Sapphire (Chase)",
            300.0,
            "3%",
            "21.49%",
            None,
        ]
        assert r["messages"][3]["text"] == (
            "Highest APR with a balance: Store card at 29.99%."
        )

    def test_net_worth_trend(self, engine: RuleBasedEngine, money: Session) -> None:
        r = ask(engine, money, "how has my net worth changed this week?")
        assert kinds(r) == ["stat", "text", "chart", "link", "quickReplies"]
        stat, text, chart = r["messages"][:3]
        # Live net worth: 1,000 checking + 1,200 portfolio − 350 cards.
        # The week starts at Oct 26's snapshot, $526.
        assert (stat["value"], stat["delta"]) == (1850.0, 1324.0)
        assert text["text"] == (
            "Up 251.7% over the past week. High $1,850.00, low $526.00."
        )
        assert chart["kind"] == "line"
        assert [p["label"] for p in chart["series"][0]["points"]][-1] == "Nov 2"
        assert [c[0] for c in chips(r)] == [
            "Past month",
            "Past 3 months",
            "Net worth breakdown",
        ]

    def test_net_worth_without_history(
        self, engine: RuleBasedEngine, db_session: Session
    ) -> None:
        r = ask(engine, db_session, "net worth trend")
        assert r["messages"][0]["text"].startswith("There isn't enough history yet")

    def test_portfolio(self, engine: RuleBasedEngine, money: Session) -> None:
        r = ask(engine, money, "how is my portfolio doing today?")
        assert kinds(r) == ["stat", "text", "link", "quickReplies"]
        assert r["messages"][0]["label"] == "Portfolio value"
        assert r["messages"][1]["text"] == (
            "Overall +$200.00 (+20%) on $1,000.00 invested, across 1 holdings."
        )

    def test_empty_states(self, engine: RuleBasedEngine, db_session: Session) -> None:
        for question, start in [
            ("when do I get paid", "You haven't added any income yet."),
            ("my debts", "You have no credit cards or loans tracked."),
            ("portfolio", "You don't have any stocks or ETFs yet."),
            ("can I cover my bills", "No bills or paychecks reach your checking"),
        ]:
            reply = ask(engine, db_session, question)
            assert reply["messages"][0]["text"].startswith(start), question
