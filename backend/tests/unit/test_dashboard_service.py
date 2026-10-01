"""Unit tests for the DashboardService."""

from datetime import date, datetime, timedelta

from sqlalchemy.orm import Session

from app.models.cash_balance import CashBalance
from app.models.holding import Holding
from app.models.price_history import PriceHistory
from app.models.transaction import Transaction
from app.models.watchlist_item import WatchlistItem
from app.services.dashboard_service import DashboardService


class TestGetSummary:
    """Tests for DashboardService.get_summary."""

    def test_returns_zeros_when_no_holdings(self, db_session: Session) -> None:
        result = DashboardService.get_summary(db_session)

        assert result.total_portfolio_value == 0.0
        assert result.total_invested == 0.0
        assert result.unrealized_gain == 0.0
        assert result.realized_gain == 0.0
        assert result.daily_change == 0.0
        assert result.annual_dividend_income == 0.0
        assert result.number_of_holdings == 0
        assert result.stale_data is False

    def test_calculates_portfolio_value_and_invested(
        self, db_session: Session
    ) -> None:
        h1 = Holding(
            ticker="AAPL",
            quantity=10.0,
            average_buy_price=150.0,
            current_price=175.0,
        )
        h2 = Holding(
            ticker="MSFT",
            quantity=5.0,
            average_buy_price=200.0,
            current_price=220.0,
        )
        db_session.add_all([h1, h2])
        db_session.commit()

        result = DashboardService.get_summary(db_session)

        # total_portfolio_value = (175*10) + (220*5) = 1750 + 1100 = 2850
        assert result.total_portfolio_value == 2850.0
        # total_invested = (150*10) + (200*5) = 1500 + 1000 = 2500
        assert result.total_invested == 2500.0
        # unrealized_gain = 2850 - 2500 = 350
        assert result.unrealized_gain == 350.0
        assert result.number_of_holdings == 2

    def test_calculates_annual_dividend_income(
        self, db_session: Session
    ) -> None:
        holding = Holding(
            ticker="AAPL",
            quantity=10.0,
            average_buy_price=150.0,
            current_price=175.0,
            dividend_yield=0.005,
        )
        db_session.add(holding)
        db_session.commit()

        result = DashboardService.get_summary(db_session)

        # annual_dividend_income = 0.005 * 175 * 10 = 8.75
        assert result.annual_dividend_income == 8.75

    def test_calculates_cash_position(self, db_session: Session) -> None:
        cash = CashBalance(balance=5000.0)
        db_session.add(cash)
        db_session.commit()

        result = DashboardService.get_summary(db_session)
        assert result.cash_position == 5000.0

    def test_calculates_realized_gain_from_sell_transactions(
        self, db_session: Session
    ) -> None:
        holding = Holding(
            ticker="AAPL",
            quantity=5.0,
            average_buy_price=100.0,
            current_price=150.0,
        )
        db_session.add(holding)
        db_session.commit()

        # Sell transaction: sold 5 shares at 150, avg buy was 100
        txn = Transaction(
            holding_id=holding.id,
            ticker="AAPL",
            transaction_type="sell",
            quantity=5.0,
            price=150.0,
            fees=0.0,
            transaction_date=date.today(),
        )
        db_session.add(txn)
        db_session.commit()

        result = DashboardService.get_summary(db_session)

        # realized_gain = (150 - 100) * 5 = 250
        assert result.realized_gain == 250.0

    def test_calculates_realized_gain_fifo_for_sequential_buy_sell_cycles(
        self, db_session: Session
    ) -> None:
        holding = Holding(
            ticker="WDCX",
            quantity=150.0,
            average_buy_price=98.25,
            current_price=107.95,
        )
        db_session.add(holding)
        db_session.commit()

        first_buy = Transaction(
            holding_id=holding.id,
            ticker="WDCX",
            transaction_type="buy",
            quantity=200.0,
            price=78.14,
            fees=0.0,
            transaction_date=date.today(),
        )
        first_sell = Transaction(
            holding_id=holding.id,
            ticker="WDCX",
            transaction_type="sell",
            quantity=200.0,
            price=95.14,
            fees=0.0,
            transaction_date=date.today() + timedelta(days=1),
        )
        second_buy = Transaction(
            holding_id=holding.id,
            ticker="WDCX",
            transaction_type="buy",
            quantity=150.0,
            price=98.25,
            fees=0.0,
            transaction_date=date.today() + timedelta(days=2),
        )
        second_sell = Transaction(
            holding_id=holding.id,
            ticker="WDCX",
            transaction_type="sell",
            quantity=150.0,
            price=107.95,
            fees=0.0,
            transaction_date=date.today() + timedelta(days=3),
        )
        db_session.add_all([first_buy, first_sell, second_buy, second_sell])
        db_session.commit()

        result = DashboardService.get_summary(db_session)

        expected_realized = (95.14 - 78.14) * 200.0 + (107.95 - 98.25) * 150.0
        assert result.realized_gain == round(expected_realized, 2)

    def test_calculates_daily_change_with_previous_close(
        self, db_session: Session
    ) -> None:
        holding = Holding(
            ticker="AAPL",
            quantity=10.0,
            average_buy_price=150.0,
            current_price=175.0,
        )
        db_session.add(holding)
        db_session.commit()

        # Add previous close price
        yesterday = date.today() - timedelta(days=1)
        price_record = PriceHistory(
            ticker="AAPL",
            close_price=170.0,
            date=yesterday,
            fetched_at=datetime.now() - timedelta(days=1),
        )
        db_session.add(price_record)
        db_session.commit()

        result = DashboardService.get_summary(db_session)

        # daily_change = (175 - 170) * 10 = 50
        assert result.daily_change == 50.0

    def test_daily_change_zero_when_no_previous_close(
        self, db_session: Session
    ) -> None:
        holding = Holding(
            ticker="AAPL",
            quantity=10.0,
            average_buy_price=150.0,
            current_price=175.0,
        )
        db_session.add(holding)
        db_session.commit()

        result = DashboardService.get_summary(db_session)
        assert result.daily_change == 0.0

    def test_stale_data_indicator(self, db_session: Session) -> None:
        holding = Holding(
            ticker="AAPL",
            quantity=10.0,
            average_buy_price=150.0,
            current_price=175.0,
        )
        db_session.add(holding)
        db_session.commit()

        # Add a price history record fetched long ago (> 2x refresh interval)
        old_fetch_time = datetime.now() - timedelta(minutes=60)
        price_record = PriceHistory(
            ticker="AAPL",
            close_price=170.0,
            date=date.today() - timedelta(days=1),
            fetched_at=old_fetch_time,
        )
        db_session.add(price_record)
        db_session.commit()

        result = DashboardService.get_summary(db_session)
        # Default REFRESH_INTERVAL_MINUTES=15, so stale threshold = 30 min
        # 60 min > 30 min => stale_data = True
        assert result.stale_data is True

    def test_last_successful_fetch(self, db_session: Session) -> None:
        fetch_time = datetime.now() - timedelta(minutes=5)
        price_record = PriceHistory(
            ticker="AAPL",
            close_price=170.0,
            date=date.today() - timedelta(days=1),
            fetched_at=fetch_time,
        )
        db_session.add(price_record)
        db_session.commit()

        result = DashboardService.get_summary(db_session)
        assert result.last_successful_fetch == fetch_time


class TestGetBrokerSummary:
    """Tests for DashboardService.get_broker_summary."""

    def test_returns_empty_list_when_no_holdings(self, db_session: Session) -> None:
        result = DashboardService.get_broker_summary(db_session)
        assert result == []

    def test_aggregates_market_value_by_broker(self, db_session: Session) -> None:
        holdings = [
            Holding(
                ticker="AAPL",
                quantity=10.0,
                average_buy_price=150.0,
                current_price=175.0,
                broker="Robinhood",
            ),
            Holding(
                ticker="MSFT",
                quantity=5.0,
                average_buy_price=300.0,
                current_price=320.0,
                broker="Robinhood",
            ),
            Holding(
                ticker="VOO",
                quantity=2.0,
                average_buy_price=400.0,
                current_price=420.0,
                holding_type="etf",
                broker="Schwab",
            ),
        ]
        db_session.add_all(holdings)
        db_session.commit()

        result = DashboardService.get_broker_summary(db_session)

        by_broker = {r.broker: r for r in result}
        assert by_broker["Robinhood"].market_value == 10 * 175.0 + 5 * 320.0
        assert by_broker["Robinhood"].total_invested == 10 * 150.0 + 5 * 300.0
        assert by_broker["Robinhood"].holding_count == 2
        assert by_broker["Schwab"].market_value == 2 * 420.0
        assert by_broker["Schwab"].holding_count == 1

    def test_groups_holdings_without_broker_as_unassigned(
        self, db_session: Session
    ) -> None:
        holding = Holding(
            ticker="AAPL",
            quantity=10.0,
            average_buy_price=150.0,
            current_price=175.0,
        )
        db_session.add(holding)
        db_session.commit()

        result = DashboardService.get_broker_summary(db_session)
        assert len(result) == 1
        assert result[0].broker == "Unassigned"
        assert result[0].market_value == 1750.0

    def test_sorted_by_market_value_descending(self, db_session: Session) -> None:
        holdings = [
            Holding(
                ticker="AAPL",
                quantity=1.0,
                average_buy_price=100.0,
                current_price=100.0,
                broker="Small",
            ),
            Holding(
                ticker="MSFT",
                quantity=100.0,
                average_buy_price=100.0,
                current_price=100.0,
                broker="Big",
            ),
        ]
        db_session.add_all(holdings)
        db_session.commit()

        result = DashboardService.get_broker_summary(db_session)
        assert [r.broker for r in result] == ["Big", "Small"]


class TestGetActivityFeed:
    """Tests for DashboardService.get_activity_feed."""

    def test_returns_empty_list_when_no_events(
        self, db_session: Session
    ) -> None:
        result = DashboardService.get_activity_feed(db_session)
        assert result == []

    def test_includes_holding_added_events(self, db_session: Session) -> None:
        holding = Holding(
            ticker="AAPL",
            company_name="Apple Inc.",
            quantity=10.0,
            average_buy_price=150.0,
            current_price=175.0,
        )
        db_session.add(holding)
        db_session.commit()

        result = DashboardService.get_activity_feed(db_session)

        assert len(result) >= 1
        holding_events = [e for e in result if e.event_type == "holding_added"]
        assert len(holding_events) == 1
        assert holding_events[0].ticker == "AAPL"
        assert holding_events[0].details["quantity"] == 10.0
        assert holding_events[0].details["buy_price"] == 150.0

    def test_includes_stock_sold_events(self, db_session: Session) -> None:
        holding = Holding(
            ticker="AAPL",
            quantity=5.0,
            average_buy_price=100.0,
            current_price=150.0,
        )
        db_session.add(holding)
        db_session.commit()

        txn = Transaction(
            holding_id=holding.id,
            ticker="AAPL",
            transaction_type="sell",
            quantity=3.0,
            price=150.0,
            fees=0.0,
            transaction_date=date.today(),
        )
        db_session.add(txn)
        db_session.commit()

        result = DashboardService.get_activity_feed(db_session)

        sold_events = [e for e in result if e.event_type == "stock_sold"]
        assert len(sold_events) == 1
        assert sold_events[0].ticker == "AAPL"
        assert sold_events[0].details["quantity"] == 3.0
        assert sold_events[0].details["sell_price"] == 150.0

    def test_includes_watchlist_added_events(
        self, db_session: Session
    ) -> None:
        item = WatchlistItem(
            ticker="GOOG",
            current_price=140.0,
        )
        db_session.add(item)
        db_session.commit()

        result = DashboardService.get_activity_feed(db_session)

        watchlist_events = [
            e for e in result if e.event_type == "watchlist_added"
        ]
        assert len(watchlist_events) == 1
        assert watchlist_events[0].ticker == "GOOG"

    def test_events_sorted_by_timestamp_descending(
        self, db_session: Session
    ) -> None:
        # Create holdings with different timestamps
        h1 = Holding(
            ticker="AAPL",
            quantity=10.0,
            average_buy_price=150.0,
            current_price=175.0,
        )
        db_session.add(h1)
        db_session.commit()

        h2 = Holding(
            ticker="MSFT",
            quantity=5.0,
            average_buy_price=200.0,
            current_price=220.0,
        )
        db_session.add(h2)
        db_session.commit()

        result = DashboardService.get_activity_feed(db_session)

        # Verify descending order
        for i in range(len(result) - 1):
            assert result[i].timestamp >= result[i + 1].timestamp

    def test_limits_to_specified_count(self, db_session: Session) -> None:
        # Create more than 5 holdings to test limit
        for i in range(10):
            ticker = f"T{i:03d}"[:5]
            h = Holding(
                ticker=ticker,
                quantity=1.0,
                average_buy_price=100.0,
                current_price=100.0,
            )
            db_session.add(h)
        db_session.commit()

        result = DashboardService.get_activity_feed(db_session, limit=5)
        assert len(result) == 5

    def test_default_limit_is_20(self, db_session: Session) -> None:
        # Create 25 holdings
        for i in range(25):
            ticker = f"T{i:04d}"[:5]
            h = Holding(
                ticker=ticker,
                quantity=1.0,
                average_buy_price=100.0,
                current_price=100.0,
            )
            db_session.add(h)
        db_session.commit()

        result = DashboardService.get_activity_feed(db_session)
        assert len(result) == 20


class TestGetPortfolioHistory:
    """Tests for DashboardService.get_portfolio_history."""

    def test_returns_empty_list_when_no_holdings(
        self, db_session: Session
    ) -> None:
        result = DashboardService.get_portfolio_history(db_session)
        assert result == []

    def test_returns_empty_list_when_no_price_history(
        self, db_session: Session
    ) -> None:
        holding = Holding(
            ticker="AAPL",
            quantity=10.0,
            average_buy_price=150.0,
            current_price=175.0,
        )
        db_session.add(holding)
        db_session.commit()

        result = DashboardService.get_portfolio_history(db_session)
        assert result == []

    def test_calculates_daily_portfolio_value(
        self, db_session: Session
    ) -> None:
        holding = Holding(
            ticker="AAPL",
            quantity=10.0,
            average_buy_price=150.0,
            current_price=175.0,
        )
        db_session.add(holding)
        db_session.commit()

        # Add price history for 3 days
        today = date.today()
        for i in range(3):
            d = today - timedelta(days=2 - i)
            price = PriceHistory(
                ticker="AAPL",
                close_price=170.0 + i,
                date=d,
                fetched_at=datetime.now(),
            )
            db_session.add(price)
        db_session.commit()

        result = DashboardService.get_portfolio_history(db_session, days=30)

        assert len(result) == 3
        # Values: 170*10=1700, 171*10=1710, 172*10=1720
        assert result[0].total_value == 1700.0
        assert result[1].total_value == 1710.0
        assert result[2].total_value == 1720.0

    def test_aggregates_multiple_holdings(self, db_session: Session) -> None:
        h1 = Holding(
            ticker="AAPL",
            quantity=10.0,
            average_buy_price=150.0,
            current_price=175.0,
        )
        h2 = Holding(
            ticker="MSFT",
            quantity=5.0,
            average_buy_price=200.0,
            current_price=220.0,
        )
        db_session.add_all([h1, h2])
        db_session.commit()

        today = date.today()
        d = today - timedelta(days=1)
        p1 = PriceHistory(
            ticker="AAPL", close_price=170.0, date=d, fetched_at=datetime.now()
        )
        p2 = PriceHistory(
            ticker="MSFT", close_price=215.0, date=d, fetched_at=datetime.now()
        )
        db_session.add_all([p1, p2])
        db_session.commit()

        result = DashboardService.get_portfolio_history(db_session, days=30)

        assert len(result) == 1
        # total_value = (170*10) + (215*5) = 1700 + 1075 = 2775
        assert result[0].total_value == 2775.0
        assert result[0].date == d

    def test_respects_days_parameter(self, db_session: Session) -> None:
        holding = Holding(
            ticker="AAPL",
            quantity=10.0,
            average_buy_price=150.0,
            current_price=175.0,
        )
        db_session.add(holding)
        db_session.commit()

        today = date.today()
        # Add price history: one within 7 days, one outside
        recent = PriceHistory(
            ticker="AAPL",
            close_price=170.0,
            date=today - timedelta(days=3),
            fetched_at=datetime.now(),
        )
        old = PriceHistory(
            ticker="AAPL",
            close_price=160.0,
            date=today - timedelta(days=10),
            fetched_at=datetime.now(),
        )
        db_session.add_all([recent, old])
        db_session.commit()

        result = DashboardService.get_portfolio_history(db_session, days=7)

        # Only the recent record should be included
        assert len(result) == 1
        assert result[0].total_value == 1700.0  # 170 * 10

    def test_results_ordered_by_date_ascending(
        self, db_session: Session
    ) -> None:
        holding = Holding(
            ticker="AAPL",
            quantity=10.0,
            average_buy_price=150.0,
            current_price=175.0,
        )
        db_session.add(holding)
        db_session.commit()

        today = date.today()
        for i in range(5):
            d = today - timedelta(days=4 - i)
            price = PriceHistory(
                ticker="AAPL",
                close_price=170.0 + i,
                date=d,
                fetched_at=datetime.now(),
            )
            db_session.add(price)
        db_session.commit()

        result = DashboardService.get_portfolio_history(db_session, days=30)

        # Verify ascending date order
        for i in range(len(result) - 1):
            assert result[i].date < result[i + 1].date
