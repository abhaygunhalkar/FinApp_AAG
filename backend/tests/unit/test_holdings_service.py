"""Unit tests for the HoldingsService."""

import pytest
from sqlalchemy.orm import Session

from app.models.cash_balance import CashBalance
from app.models.holding import Holding
from app.models.transaction import Transaction
from app.schemas.holding import HoldingCreate, HoldingUpdate
from app.services.holdings_service import HoldingsService


class TestGetAllHoldings:
    """Tests for HoldingsService.get_all_holdings."""

    def test_returns_empty_list_when_no_holdings(self, db_session: Session) -> None:
        result = HoldingsService.get_all_holdings(db_session)
        assert result == []

    def test_filters_out_zero_quantity_holdings(self, db_session: Session) -> None:
        holding = Holding(
            ticker="AAPL",
            company_name="Apple Inc.",
            quantity=1e-8,
            average_buy_price=150.0,
            current_price=175.0,
        )
        db_session.add(holding)
        db_session.commit()

        result = HoldingsService.get_all_holdings(db_session)
        assert result == []

    def test_returns_holdings_with_calculated_fields(self, db_session: Session) -> None:
        holding = Holding(
            ticker="AAPL",
            company_name="Apple Inc.",
            quantity=10.0,
            average_buy_price=150.0,
            current_price=175.0,
            sector="Technology",
            industry="Consumer Electronics",
            dividend_yield=0.005,
        )
        db_session.add(holding)
        db_session.commit()

        result = HoldingsService.get_all_holdings(db_session)
        assert len(result) == 1

        h = result[0]
        assert h.ticker == "AAPL"
        assert h.total_invested == 1500.0  # 150 * 10
        assert h.current_value == 1750.0  # 175 * 10
        assert h.unrealized_gain == 250.0  # (175 - 150) * 10
        assert h.unrealized_gain_pct == 16.67  # ((175-150)/150)*100
        assert h.allocation_pct == 100.0  # only holding
        assert h.annual_dividend_income == 8.75  # 0.005 * 175 * 10

    def test_allocation_pct_across_multiple_holdings(
        self, db_session: Session
    ) -> None:
        h1 = Holding(
            ticker="AAPL",
            quantity=10.0,
            average_buy_price=100.0,
            current_price=100.0,
        )
        h2 = Holding(
            ticker="MSFT",
            quantity=10.0,
            average_buy_price=100.0,
            current_price=100.0,
        )
        db_session.add_all([h1, h2])
        db_session.commit()

        result = HoldingsService.get_all_holdings(db_session)
        assert len(result) == 2
        # Each holding is 50% of portfolio
        assert result[0].allocation_pct == 50.0
        assert result[1].allocation_pct == 50.0


class TestGetHolding:
    """Tests for HoldingsService.get_holding."""

    def test_returns_holding_by_id(self, db_session: Session) -> None:
        holding = Holding(
            ticker="AAPL",
            quantity=5.0,
            average_buy_price=150.0,
            current_price=160.0,
        )
        db_session.add(holding)
        db_session.commit()

        result = HoldingsService.get_holding(db_session, holding.id)
        assert result.ticker == "AAPL"
        assert result.quantity == 5.0

    def test_raises_404_for_nonexistent_holding(self, db_session: Session) -> None:
        from fastapi import HTTPException

        with pytest.raises(HTTPException) as exc_info:
            HoldingsService.get_holding(db_session, 999)
        assert exc_info.value.status_code == 404


class TestCreateHolding:
    """Tests for HoldingsService.create_holding."""

    def test_creates_holding_and_transaction(self, db_session: Session) -> None:
        # Set up initial cash balance
        cash = CashBalance(balance=10000.0)
        db_session.add(cash)
        db_session.commit()

        data = HoldingCreate(
            ticker="AAPL",
            quantity=10.0,
            buy_price=150.0,
            company_name="Apple Inc.",
            sector="Technology",
        )

        result = HoldingsService.create_holding(db_session, data)

        assert result.ticker == "AAPL"
        assert result.quantity == 10.0
        assert result.average_buy_price == 150.0
        assert result.current_price == 150.0
        assert result.total_invested == 1500.0

        # Verify transaction was created
        transactions = (
            db_session.query(Transaction)
            .filter(Transaction.holding_id == result.id)
            .all()
        )
        assert len(transactions) == 1
        assert transactions[0].transaction_type == "buy"
        assert transactions[0].quantity == 10.0
        assert transactions[0].price == 150.0

    def test_decreases_cash_balance_on_create(self, db_session: Session) -> None:
        cash = CashBalance(balance=5000.0)
        db_session.add(cash)
        db_session.commit()

        data = HoldingCreate(ticker="MSFT", quantity=5.0, buy_price=200.0)
        HoldingsService.create_holding(db_session, data)

        updated_cash = db_session.query(CashBalance).first()
        assert updated_cash is not None
        assert updated_cash.balance == 4000.0  # 5000 - (5 * 200)

    def test_rejects_duplicate_ticker(self, db_session: Session) -> None:
        from fastapi import HTTPException

        holding = Holding(
            ticker="AAPL",
            quantity=10.0,
            average_buy_price=150.0,
            current_price=150.0,
        )
        db_session.add(holding)
        db_session.commit()

        data = HoldingCreate(ticker="AAPL", quantity=5.0, buy_price=160.0)

        with pytest.raises(HTTPException) as exc_info:
            HoldingsService.create_holding(db_session, data)
        assert exc_info.value.status_code == 400
        assert "already exists" in exc_info.value.detail


class TestUpdateHolding:
    """Tests for HoldingsService.update_holding."""

    def test_updates_editable_fields(self, db_session: Session) -> None:
        holding = Holding(
            ticker="AAPL",
            quantity=10.0,
            average_buy_price=150.0,
            current_price=160.0,
        )
        db_session.add(holding)
        db_session.commit()

        data = HoldingUpdate(
            company_name="Apple Inc.",
            sector="Technology",
            industry="Consumer Electronics",
            notes="Long-term hold",
        )

        result = HoldingsService.update_holding(db_session, holding.id, data)
        assert result.company_name == "Apple Inc."
        assert result.sector == "Technology"
        assert result.industry == "Consumer Electronics"

    def test_raises_404_for_nonexistent_holding(self, db_session: Session) -> None:
        from fastapi import HTTPException

        data = HoldingUpdate(company_name="Test")

        with pytest.raises(HTTPException) as exc_info:
            HoldingsService.update_holding(db_session, 999, data)
        assert exc_info.value.status_code == 404

    def test_updates_broker(self, db_session: Session) -> None:
        holding = Holding(
            ticker="SOFI",
            quantity=250.0,
            average_buy_price=10.0,
            current_price=12.0,
            broker="Robinhood",
        )
        db_session.add(holding)
        db_session.commit()

        data = HoldingUpdate(broker="Schwab")

        result = HoldingsService.update_holding(db_session, holding.id, data)
        assert result.broker == "Schwab"

    def test_rejects_broker_change_that_collides_with_another_holding(
        self, db_session: Session
    ) -> None:
        from fastapi import HTTPException

        robinhood_holding = Holding(
            ticker="SOFI",
            quantity=250.0,
            average_buy_price=10.0,
            current_price=12.0,
            broker="Robinhood",
        )
        schwab_holding = Holding(
            ticker="SOFI",
            quantity=50.0,
            average_buy_price=9.0,
            current_price=12.0,
            broker="Schwab",
        )
        db_session.add_all([robinhood_holding, schwab_holding])
        db_session.commit()

        data = HoldingUpdate(broker="Schwab")

        with pytest.raises(HTTPException) as exc_info:
            HoldingsService.update_holding(db_session, robinhood_holding.id, data)
        assert exc_info.value.status_code == 400
        assert "already exists" in exc_info.value.detail


class TestDeleteHolding:
    """Tests for HoldingsService.delete_holding."""

    def test_deletes_holding_and_returns_cash(self, db_session: Session) -> None:
        cash = CashBalance(balance=1000.0)
        db_session.add(cash)
        db_session.commit()

        holding = Holding(
            ticker="AAPL",
            quantity=10.0,
            average_buy_price=150.0,
            current_price=160.0,
        )
        db_session.add(holding)
        db_session.commit()
        holding_id = holding.id

        HoldingsService.delete_holding(db_session, holding_id)

        # Holding should be gone
        assert db_session.query(Holding).filter(Holding.id == holding_id).first() is None

        # Cash should be increased by quantity * average_buy_price
        updated_cash = db_session.query(CashBalance).first()
        assert updated_cash is not None
        assert updated_cash.balance == 2500.0  # 1000 + (10 * 150)

    def test_raises_404_for_nonexistent_holding(self, db_session: Session) -> None:
        from fastapi import HTTPException

        with pytest.raises(HTTPException) as exc_info:
            HoldingsService.delete_holding(db_session, 999)
        assert exc_info.value.status_code == 404

    def test_cascade_deletes_transactions(self, db_session: Session) -> None:
        cash = CashBalance(balance=10000.0)
        db_session.add(cash)
        db_session.commit()

        data = HoldingCreate(ticker="GOOG", quantity=5.0, buy_price=100.0)
        result = HoldingsService.create_holding(db_session, data)

        # Verify transaction exists
        txns = (
            db_session.query(Transaction)
            .filter(Transaction.holding_id == result.id)
            .all()
        )
        assert len(txns) == 1

        HoldingsService.delete_holding(db_session, result.id)

        # Transactions should be cascade deleted
        remaining_txns = (
            db_session.query(Transaction)
            .filter(Transaction.holding_id == result.id)
            .all()
        )
        assert len(remaining_txns) == 0


class TestMetricsCalculation:
    """Tests for portfolio metrics edge cases."""

    def test_zero_portfolio_value_gives_zero_allocation(
        self, db_session: Session
    ) -> None:
        holding = Holding(
            ticker="AAPL",
            quantity=10.0,
            average_buy_price=150.0,
            current_price=0.0,  # Zero current price = zero portfolio value
        )
        db_session.add(holding)
        db_session.commit()

        result = HoldingsService.get_all_holdings(db_session)
        assert result[0].allocation_pct == 0.0

    def test_zero_dividend_yield_gives_zero_income(
        self, db_session: Session
    ) -> None:
        holding = Holding(
            ticker="AAPL",
            quantity=10.0,
            average_buy_price=150.0,
            current_price=175.0,
            dividend_yield=0.0,
        )
        db_session.add(holding)
        db_session.commit()

        result = HoldingsService.get_all_holdings(db_session)
        assert result[0].annual_dividend_income == 0.0

    def test_negative_unrealized_gain(self, db_session: Session) -> None:
        holding = Holding(
            ticker="AAPL",
            quantity=10.0,
            average_buy_price=200.0,
            current_price=150.0,
        )
        db_session.add(holding)
        db_session.commit()

        result = HoldingsService.get_all_holdings(db_session)
        assert result[0].unrealized_gain == -500.0  # (150 - 200) * 10
        assert result[0].unrealized_gain_pct == -25.0  # ((150-200)/200)*100
