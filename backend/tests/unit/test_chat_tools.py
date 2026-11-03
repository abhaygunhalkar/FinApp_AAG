"""Unit tests for the chat tools and their registry (app/services/chat_tools)."""

from datetime import date
from decimal import Decimal
from typing import Any

import pytest
from sqlalchemy.orm import Session

from app.models.financial_account import FinancialAccount
from app.models.holding import Holding
from app.models.recurring_expense import RecurringExpense
from app.services.chat_tools import (
    ToolAccessError,
    ToolContext,
    ToolError,
    build_registry,
    money,
)

OWNER = "owner"
TODAY = date(2026, 11, 2)
registry = build_registry(OWNER)


def call(db: Session, name: str, raw: dict[str, Any] | None = None) -> Any:
    return registry.call(name, raw or {}, ToolContext(db, OWNER, TODAY))


def as_json(result: Any) -> Any:
    return result.model_dump(mode="json", by_alias=True)


def add_account(db: Session, name: str, kind: str, balance: float, **kw: Any) -> int:
    account = FinancialAccount(name=name, account_type=kind, balance=balance, **kw)
    db.add(account)
    db.commit()
    return account.id


def add_bill(
    db: Session,
    name: str,
    amount: float,
    due: date | None,
    frequency: str = "monthly",
    **kw: Any,
) -> int:
    bill = RecurringExpense(
        name=name,
        category=kw.pop("category", "Utilities"),
        amount=amount,
        frequency=frequency,
        next_due_date=due,
        **kw,
    )
    db.add(bill)
    db.commit()
    return bill.id


class TestRegistry:
    def test_lists_only_the_tools_with_data(self) -> None:
        assert registry.names() == ["getBalance", "getUpcomingBills"]

    def test_definitions_are_ready_for_function_calling(self) -> None:
        defs = {d["name"]: d for d in registry.definitions()}
        balance = defs["getBalance"]["input_schema"]
        assert set(balance["properties"]) == {"accountId"}
        assert balance["additionalProperties"] is False
        bills = defs["getUpcomingBills"]["input_schema"]["properties"]["withinDays"]
        assert (bills["minimum"], bills["maximum"], bills["default"]) == (1, 60, 30)
        assert all(d["description"] for d in defs.values())

    def test_unknown_tool(self, db_session: Session) -> None:
        with pytest.raises(ToolError, match="Unknown tool: getSpending"):
            call(db_session, "getSpending")

    def test_tool_names_must_be_unique(self) -> None:
        from app.services.chat_tools.accounts import GET_BALANCE

        with pytest.raises(ValueError, match="already registered"):
            build_registry(OWNER).register(GET_BALANCE)

    def test_owner_defaults_to_the_setting(self, db_session: Session) -> None:
        result = build_registry().call(
            "getBalance", {}, ToolContext(db_session, "owner", TODAY)
        )
        assert result.accounts == []


class TestOtherUsers:
    @pytest.mark.parametrize("name", ["getBalance", "getUpcomingBills"])
    def test_another_user_gets_nothing(self, db_session: Session, name: str) -> None:
        add_account(db_session, "Checking", "checking", 500)
        add_bill(db_session, "Rent", 2000, TODAY)
        with pytest.raises(ToolAccessError):
            registry.call(name, {}, ToolContext(db_session, "someone-else", TODAY))

    def test_access_is_checked_before_the_tool_name(self, db_session: Session) -> None:
        # An outsider can't even learn which tools exist.
        with pytest.raises(ToolAccessError):
            registry.call("nope", {}, ToolContext(db_session, "", TODAY))

    @pytest.mark.parametrize("key", ["userId", "user_id", "ownerId"])
    def test_input_cannot_name_a_user(self, db_session: Session, key: str) -> None:
        with pytest.raises(ToolError, match="Extra inputs are not permitted"):
            call(db_session, "getBalance", {key: OWNER})


class TestGetBalance:
    def test_no_accounts(self, db_session: Session) -> None:
        assert as_json(call(db_session, "getBalance")) == {
            "accounts": [],
            "totals": {
                "assets": "0.00",
                "liabilities": "0.00",
                "netWorth": "0.00",
                "portfolio": "0.00",
            },
        }

    def test_all_accounts_with_totals(self, db_session: Session) -> None:
        checking = add_account(
            db_session, "Total Checking", "checking", 1234.565, institution="Chase"
        )
        add_account(db_session, "Sapphire", "credit_card", 300.1)
        db_session.add(
            Holding(
                ticker="VOO",
                quantity=2,
                average_buy_price=400,
                current_price=500.005,
            )
        )
        db_session.commit()

        result = call(db_session, "getBalance")

        first = result.accounts[0]
        assert (first.id, first.name, first.institution) == (
            checking,
            "Total Checking",
            "Chase",
        )
        assert first.balance == Decimal("1234.57")  # half-up, exact cents
        card = result.accounts[1]
        assert (card.is_asset, card.balance) == (False, Decimal("300.10"))
        assert result.totals is not None
        assert result.totals.portfolio == Decimal("1000.01")
        assert result.totals.assets == Decimal("2234.58")
        assert result.totals.liabilities == Decimal("300.10")
        assert result.totals.net_worth == Decimal("1934.48")

    def test_money_is_never_a_float(self, db_session: Session) -> None:
        add_account(db_session, "Savings", "savings", 0.1 + 0.2)
        dumped = as_json(call(db_session, "getBalance"))
        assert dumped["accounts"][0]["balance"] == "0.30"
        assert dumped["accounts"][0]["isAsset"] is True

    def test_one_account(self, db_session: Session) -> None:
        add_account(db_session, "Checking", "checking", 10)
        savings = add_account(db_session, "Savings", "savings", 20)
        result = call(db_session, "getBalance", {"accountId": savings})
        assert [a.name for a in result.accounts] == ["Savings"]
        assert result.totals is None

    def test_unknown_account(self, db_session: Session) -> None:
        with pytest.raises(ToolError, match="No account with id 99"):
            call(db_session, "getBalance", {"accountId": 99})

    @pytest.mark.parametrize("bad", [0, -1, "1", 1.5, True, None])
    def test_invalid_account_id(self, db_session: Session, bad: Any) -> None:
        if bad is None:
            # Explicit null means "all accounts", same as leaving it out.
            assert call(db_session, "getBalance", {"accountId": None}).totals
            return
        with pytest.raises(ToolError, match="Invalid input for getBalance: accountId"):
            call(db_session, "getBalance", {"accountId": bad})

    def test_snake_case_input_is_rejected(self, db_session: Session) -> None:
        with pytest.raises(ToolError, match="Invalid input"):
            call(db_session, "getBalance", {"account_id": 1})


class TestGetUpcomingBills:
    def test_no_bills(self, db_session: Session) -> None:
        assert as_json(call(db_session, "getUpcomingBills")) == {
            "start": "2026-11-02",
            "end": "2026-12-02",
            "bills": [],
            "total": "0.00",
            "withoutDueDate": 0,
        }

    def test_bills_in_the_window_soonest_first(self, db_session: Session) -> None:
        checking = add_account(
            db_session, "Total Checking", "checking", 0, institution="Chase"
        )
        add_bill(
            db_session,
            "Rent",
            2400,
            date(2026, 11, 5),
            category="Housing",
            paid_from_account_id=checking,
        )
        add_bill(db_session, "Internet", 79.99, date(2026, 11, 3), paid_from="Visa")
        add_bill(db_session, "Insurance", 600, date(2026, 12, 20), "semiannual")

        result = call(db_session, "getUpcomingBills", {"withinDays": 14})

        assert [(b.name, b.due_date) for b in result.bills] == [
            ("Internet", date(2026, 11, 3)),
            ("Rent", date(2026, 11, 5)),
        ]
        rent = result.bills[1]
        assert (rent.category, rent.paid_from) == ("Housing", "Total Checking (Chase)")
        assert result.bills[0].paid_from == "Visa"
        assert result.total == Decimal("2479.99")
        assert result.end == date(2026, 11, 16)

    def test_a_repeating_bill_appears_for_each_due_date(
        self, db_session: Session
    ) -> None:
        add_bill(db_session, "Daycare", 0.1, date(2026, 11, 2), "weekly")
        result = call(db_session, "getUpcomingBills", {"withinDays": 21})
        assert [b.due_date.day for b in result.bills] == [2, 9, 16, 23]
        # Four times $0.10 is exactly $0.40, not 0.4000000001.
        assert as_json(result)["total"] == "0.40"

    def test_window_edges_are_inclusive(self, db_session: Session) -> None:
        add_bill(db_session, "Today", 1, TODAY)
        add_bill(db_session, "Last day", 1, date(2026, 11, 9))
        add_bill(db_session, "Too late", 1, date(2026, 11, 10))
        result = call(db_session, "getUpcomingBills", {"withinDays": 7})
        assert [b.name for b in result.bills] == ["Today", "Last day"]

    def test_overdue_manual_bill_is_due_today(self, db_session: Session) -> None:
        add_bill(db_session, "Water", 50, date(2026, 10, 20))
        [water] = call(db_session, "getUpcomingBills", {"withinDays": 7}).bills
        assert (water.due_date, water.overdue) == (TODAY, True)

    def test_autopay_is_rolled_forward_without_saving(
        self, db_session: Session
    ) -> None:
        bill_id = add_bill(db_session, "Phone", 60, date(2026, 10, 25), autopay=True)
        [phone] = call(db_session, "getUpcomingBills", {"withinDays": 30}).bills
        assert (phone.due_date, phone.overdue) == (date(2026, 11, 25), False)
        # Read-only: the stored due date is unchanged.
        stored = db_session.get(RecurringExpense, bill_id)
        assert stored is not None and stored.next_due_date == date(2026, 10, 25)

    def test_bills_without_a_due_date_are_counted(self, db_session: Session) -> None:
        add_bill(db_session, "Gym", 45, None)
        result = call(db_session, "getUpcomingBills")
        assert (result.bills, result.without_due_date) == ([], 1)

    @pytest.mark.parametrize("bad", [0, 61, -5, "30", 7.5, True])
    def test_invalid_range(self, db_session: Session, bad: Any) -> None:
        with pytest.raises(
            ToolError, match="Invalid input for getUpcomingBills: withinDays"
        ):
            call(db_session, "getUpcomingBills", {"withinDays": bad})

    def test_max_range_is_allowed(self, db_session: Session) -> None:
        assert call(db_session, "getUpcomingBills", {"withinDays": 60}).end == date(
            2027, 1, 1
        )


def test_money_rounds_half_up_to_cents() -> None:
    assert money(2.675) == Decimal("2.68")  # float 2.675 is 2.67499...
    assert money(-1.005) == Decimal("-1.01")
    assert money(10) == Decimal("10.00")
