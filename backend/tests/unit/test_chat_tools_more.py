"""Unit tests for getCashFlowForecast, getIncome, getDebts, getNetWorthTrend and
getPortfolio (app/services/chat_tools)."""

from datetime import date, timedelta
from decimal import Decimal
from typing import Any

import pytest
from sqlalchemy.orm import Session

from app.models.holding import Holding
from app.models.income_source import IncomeSource
from app.models.net_worth_snapshot import NetWorthSnapshot
from app.models.price_history import PriceHistory
from app.services.chat_tools import ToolAccessError, ToolContext, ToolError
from tests.unit.test_chat_tools import (
    TODAY,
    add_account,
    add_bill,
    call,
    registry,
)


def add_income(db: Session, name: str, amount: float, pay_date: date, **kw: Any) -> int:
    income = IncomeSource(
        name=name,
        category="Salary",
        amount=amount,
        frequency=kw.pop("frequency", "biweekly"),
        pay_date=pay_date,
        weekend_rule="none",
        **kw,
    )
    db.add(income)
    db.commit()
    return income.id


@pytest.mark.parametrize(
    "name",
    [
        "getCashFlowForecast",
        "getIncome",
        "getDebts",
        "getNetWorthTrend",
        "getPortfolio",
    ],
)
def test_another_user_gets_nothing(db_session: Session, name: str) -> None:
    with pytest.raises(ToolAccessError):
        registry.call(name, {}, ToolContext(db_session, "someone-else", TODAY))


@pytest.mark.parametrize("name", ["getIncome", "getDebts", "getPortfolio"])
def test_tools_without_input_reject_any(db_session: Session, name: str) -> None:
    with pytest.raises(ToolError, match="Extra inputs are not permitted"):
        call(db_session, name, {"accountId": 1})


class TestCashFlowForecast:
    def test_no_accounts(self, db_session: Session) -> None:
        result = call(db_session, "getCashFlowForecast")
        assert (result.accounts, result.end) == ([], TODAY + timedelta(days=14))
        assert result.card_charges == Decimal("0.00")

    def test_finds_the_day_an_account_runs_short(self, db_session: Session) -> None:
        checking = add_account(
            db_session, "Checking", "checking", 1000, institution="Chase"
        )
        card = add_account(db_session, "Visa", "credit_card", 0)
        add_bill(
            db_session, "Rent", 1500, date(2026, 11, 5), paid_from_account_id=checking
        )
        add_bill(
            db_session, "Netflix", 15.49, date(2026, 11, 8), paid_from_account_id=card
        )
        add_bill(db_session, "Water", 20, date(2026, 11, 9))  # no paying account
        add_income(
            db_session,
            "Paycheck",
            800,
            date(2026, 11, 6),
            deposited_to_account_id=checking,
        )

        result = call(db_session, "getCashFlowForecast", {"withinDays": 7})

        [a] = result.accounts
        assert (a.name, a.balance) == ("Checking (Chase)", Decimal("1000.00"))
        assert (a.short_date, a.short_bill) == (date(2026, 11, 5), "Rent")
        assert (a.lowest_balance, a.lowest_date) == (
            Decimal("-500.00"),
            date(2026, 11, 5),
        )
        assert a.ending_balance == Decimal("300.00")
        assert (a.bills, a.income) == (Decimal("1500.00"), Decimal("800.00"))
        assert result.card_charges == Decimal("15.49")
        assert (result.unlinked, result.unlinked_count) == (Decimal("20.00"), 1)

    @pytest.mark.parametrize("bad", [0, 91, "14"])
    def test_invalid_window(self, db_session: Session, bad: Any) -> None:
        with pytest.raises(ToolError, match="withinDays"):
            call(db_session, "getCashFlowForecast", {"withinDays": bad})


class TestIncome:
    def test_no_income(self, db_session: Session) -> None:
        result = call(db_session, "getIncome")
        assert result.sources == []
        assert result.monthly_income == Decimal("0.00")

    def test_sources_soonest_first_with_the_monthly_picture(
        self, db_session: Session
    ) -> None:
        savings = add_account(db_session, "Savings", "savings", 5000)
        add_income(
            db_session, "Rent from unit", 1000, date(2026, 11, 20), frequency="monthly"
        )
        add_income(
            db_session,
            "Paycheck",
            2400,
            date(2026, 11, 6),
            deposited_to_account_id=savings,
        )
        add_bill(db_session, "Mortgage", 2000, date(2026, 11, 10))

        result = call(db_session, "getIncome")

        assert [s.name for s in result.sources] == ["Paycheck", "Rent from unit"]
        pay = result.sources[0]
        assert (pay.next_pay_date, pay.amount, pay.deposited_to) == (
            date(2026, 11, 6),
            Decimal("2400.00"),
            "Savings",
        )
        assert pay.monthly_amount == Decimal("5200.00")  # 26 paychecks / 12
        assert result.monthly_income == Decimal("6200.00")
        assert result.monthly_fixed_costs == Decimal("2000.00")
        assert result.monthly_left_over == Decimal("4200.00")
        assert result.liquid_cash == Decimal("5000.00")
        assert result.emergency_months == 2.5


class TestDebts:
    def test_no_debts(self, db_session: Session) -> None:
        result = call(db_session, "getDebts")
        assert (result.cards, result.loans, result.utilization_pct) == ([], [], None)
        assert result.total == Decimal("0.00")

    def test_cards_and_loans(self, db_session: Session) -> None:
        add_account(
            db_session,
            "Sapphire",
            "credit_card",
            300,
            institution="Chase",
            credit_limit=10000,
            apr=21.49,
            due_date=date(2026, 11, 14),
        )
        add_account(db_session, "Store card", "credit_card", 700, apr=29.99)  # no limit
        add_account(
            db_session,
            "Mortgage",
            "mortgage",
            300000,
            original_amount=400000,
            apr=6.125,
            payoff_date=date(2054, 6, 1),
        )
        add_account(db_session, "Car", "loan", 5000)
        add_account(db_session, "Checking", "checking", 9999)  # not a debt

        result = call(db_session, "getDebts")

        assert [c.name for c in result.cards] == ["Store card", "Sapphire (Chase)"]
        sapphire = result.cards[1]
        assert (sapphire.utilization_pct, sapphire.apr, sapphire.due_date) == (
            3.0,
            21.49,
            date(2026, 11, 14),
        )
        assert result.cards[0].utilization_pct is None
        # Overall use counts only cards with a limit: 300 of 10,000.
        assert (result.card_limit, result.utilization_pct) == (Decimal("10000.00"), 3.0)
        assert result.card_balance == Decimal("1000.00")
        mortgage, car = result.loans
        assert (mortgage.paid_off_pct, mortgage.type) == (25.0, "mortgage")
        assert car.paid_off_pct is None
        assert result.loan_balance == Decimal("305000.00")
        assert result.total == Decimal("306000.00")


class TestNetWorthTrend:
    def snapshots(self, db: Session, days: int, start: float = 1000.0) -> None:
        for i in range(days, 0, -1):
            db.add(
                NetWorthSnapshot(
                    date=TODAY - timedelta(days=i),
                    total_assets=0,
                    total_liabilities=0,
                    net_worth=start + (days - i) * 10,
                )
            )
        db.commit()

    def test_not_enough_history(self, db_session: Session) -> None:
        result = call(db_session, "getNetWorthTrend")
        assert len(result.points) == 1
        assert (result.change, result.change_pct, result.high) == (None, None, None)

    def test_change_over_the_range_ends_at_the_live_value(
        self, db_session: Session
    ) -> None:
        self.snapshots(db_session, 60)  # 1000, 1010, ... 1590 yesterday
        add_account(db_session, "Checking", "checking", 1700)  # live net worth

        result = call(db_session, "getNetWorthTrend", {"range": "1W"})

        assert result.points[0].value == Decimal("1530.00")  # 7 days ago
        assert (result.points[-1].date, result.points[-1].value) == (
            TODAY,
            Decimal("1700.00"),
        )
        assert result.change == Decimal("170.00")
        assert result.change_pct == 11.1
        assert (result.high, result.low) == (Decimal("1700.00"), Decimal("1530.00"))

    def test_long_ranges_are_thinned_keeping_both_ends(
        self, db_session: Session
    ) -> None:
        self.snapshots(db_session, 200)
        result = call(db_session, "getNetWorthTrend", {"range": "ALL"})
        assert len(result.points) == 40
        assert result.points[0].date == TODAY - timedelta(days=200)
        assert result.points[-1].date == TODAY
        # Change and extremes use every day, not just the thinned points.
        assert result.change == Decimal("-1000.00")  # live value is 0

    @pytest.mark.parametrize("bad", ["2W", "1m", 30])
    def test_invalid_range(self, db_session: Session, bad: Any) -> None:
        with pytest.raises(ToolError, match="range"):
            call(db_session, "getNetWorthTrend", {"range": bad})


class TestPortfolio:
    def test_no_holdings(self, db_session: Session) -> None:
        result = call(db_session, "getPortfolio")
        assert (result.holdings, result.brokers, result.gainers) == (0, [], [])
        assert result.unrealized_gain_pct is None

    def test_value_gain_brokers_and_movers(self, db_session: Session) -> None:
        yesterday = date.today() - timedelta(days=1)
        for ticker, qty, cost, price, prev, broker in [
            ("AAA", 10, 100, 120, 110, "Schwab"),  # +100 today
            ("BBB", 5, 200, 150, 160, "Schwab"),  # −50 today
            ("CCC", 100, 10, 11, 10.5, "Merrill"),  # +50 today
        ]:
            db_session.add(
                Holding(
                    ticker=ticker,
                    quantity=qty,
                    average_buy_price=cost,
                    current_price=price,
                    broker=broker,
                )
            )
            db_session.add(
                PriceHistory(
                    ticker=ticker, open_price=None, close_price=prev, date=yesterday
                )
            )
        db_session.commit()

        result = call(db_session, "getPortfolio")

        assert result.value == Decimal("3050.00")
        assert result.invested == Decimal("3000.00")
        assert (result.unrealized_gain, result.unrealized_gain_pct) == (
            Decimal("50.00"),
            1.7,
        )
        assert result.holdings == 3
        assert [(m.ticker, m.day_change) for m in result.gainers] == [
            ("AAA", Decimal("100.00")),
            ("CCC", Decimal("50.00")),
        ]
        assert [(m.ticker, m.day_change_pct) for m in result.losers] == [("BBB", -6.25)]
        assert {b.broker: b.holdings for b in result.brokers} == {
            "Schwab": 2,
            "Merrill": 1,
        }


class TestPortfolioByType:
    def holdings(self, db: Session) -> None:
        for ticker, kind, qty, cost, price, broker in [
            ("AAPL", "stock", 10, 100, 110, "Schwab"),
            ("VOO", "etf", 2, 400, 500, "Schwab"),
            ("SCHD", "etf", 10, 25, 24, "Robinhood"),
        ]:
            db.add(
                Holding(
                    ticker=ticker,
                    holding_type=kind,
                    quantity=qty,
                    average_buy_price=cost,
                    current_price=price,
                    broker=broker,
                )
            )
        db.commit()

    def test_etfs_only(self, db_session: Session) -> None:
        self.holdings(db_session)
        result = call(db_session, "getPortfolio", {"type": "etf"})
        assert result.type == "etf"
        assert (result.holdings, result.value) == (2, Decimal("1240.00"))
        assert result.invested == Decimal("1050.00")
        assert (result.unrealized_gain, result.unrealized_gain_pct) == (
            Decimal("190.00"),
            18.1,
        )
        assert result.realized_gain is None  # only for the whole portfolio
        assert [(b.broker, b.holdings) for b in result.brokers] == [
            ("Schwab", 1),
            ("Robinhood", 1),
        ]

    def test_stocks_and_etfs_add_up_to_all(self, db_session: Session) -> None:
        self.holdings(db_session)
        parts = [
            call(db_session, "getPortfolio", {"type": t}).value
            for t in ("stock", "etf")
        ]
        whole = call(db_session, "getPortfolio")
        assert sum(parts) == whole.value == Decimal("2340.00")
        assert whole.realized_gain is not None

    def test_invalid_type(self, db_session: Session) -> None:
        with pytest.raises(ToolError, match="type"):
            call(db_session, "getPortfolio", {"type": "bonds"})


class TestOptions:
    def trade(self, db: Session, **kw: Any) -> None:
        from app.models.options_trade import OptionsTrade

        defaults: dict[str, Any] = {
            "ticker": "AAPL",
            "trade_type": "sell_put",
            "strike_price": 180,
            "premium": 2.5,
            "contracts": 1,
            "open_date": date.today() - timedelta(days=30),
            "expiry_date": date.today() + timedelta(days=20),
            "status": "open",
        }
        db.add(OptionsTrade(**{**defaults, **kw}))
        db.commit()

    def test_no_trades(self, db_session: Session) -> None:
        result = call(db_session, "getOptions")
        assert (result.trades, result.open, result.win_rate) == (0, [], None)

    def test_summary_and_open_positions(self, db_session: Session) -> None:
        soon = date.today() + timedelta(days=2)
        self.trade(
            db_session,
            ticker="MSFT",
            trade_type="sell_call",
            strike_price=565,
            premium=5.4,
            expiry_date=soon,
        )
        self.trade(
            db_session,
            ticker="SPY",
            trade_type="buy_put",
            strike_price=500.5,
            premium=3,
            contracts=2,
        )
        # Closed: +250 (expired worthless) and −100 (bought back higher).
        self.trade(db_session, status="expired_worthless")
        self.trade(db_session, status="closed", close_price=3.5)

        result = call(db_session, "getOptions")

        assert (result.trades, result.open_positions, result.expiring_this_week) == (
            4,
            2,
            1,
        )
        assert result.realized_pnl == Decimal("150.00")
        assert result.win_rate == 50.0
        msft, spy = result.open
        assert (msft.ticker, msft.expiry_date, msft.premium) == (
            "MSFT",
            soon,
            Decimal("540.00"),  # received
        )
        assert (spy.contracts, spy.premium, spy.strike) == (
            2,
            Decimal("-600.00"),  # paid
            Decimal("500.50"),
        )
