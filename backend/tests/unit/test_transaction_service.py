"""Unit tests for the TransactionService."""

from datetime import date

import pytest
from sqlalchemy.orm import Session

from app.models.cash_balance import CashBalance
from app.models.holding import Holding
from app.models.transaction import Transaction
from app.schemas.transaction import TransactionCreate
from app.services.transaction_service import TransactionService


class TestGetTransactions:
    """Tests for TransactionService.get_transactions."""

    def test_returns_empty_list_when_no_transactions(self, db_session: Session) -> None:
        holding = Holding(
            ticker="AAPL",
            quantity=10.0,
            average_buy_price=150.0,
            current_price=160.0,
        )
        db_session.add(holding)
        db_session.commit()

        result = TransactionService.get_transactions(db_session, holding.id)
        assert result == []

    def test_returns_transactions_for_holding(self, db_session: Session) -> None:
        holding = Holding(
            ticker="AAPL",
            quantity=10.0,
            average_buy_price=150.0,
            current_price=160.0,
        )
        db_session.add(holding)
        db_session.commit()

        txn = Transaction(
            holding_id=holding.id,
            ticker="AAPL",
            transaction_type="buy",
            quantity=10.0,
            price=150.0,
            fees=5.0,
            transaction_date=date(2024, 1, 15),
        )
        db_session.add(txn)
        db_session.commit()

        result = TransactionService.get_transactions(db_session, holding.id)
        assert len(result) == 1
        assert result[0].ticker == "AAPL"
        assert result[0].quantity == 10.0

    def test_raises_404_for_nonexistent_holding(self, db_session: Session) -> None:
        from fastapi import HTTPException

        with pytest.raises(HTTPException) as exc_info:
            TransactionService.get_transactions(db_session, 999)
        assert exc_info.value.status_code == 404


class TestCreateBuyTransaction:
    """Tests for TransactionService.create_transaction with buy type."""

    def test_buy_creates_new_holding_if_none_exists(self, db_session: Session) -> None:
        cash = CashBalance(balance=10000.0)
        db_session.add(cash)
        db_session.commit()

        data = TransactionCreate(
            ticker="AAPL",
            transaction_type="buy",
            quantity=10.0,
            price=150.0,
            fees=5.0,
            transaction_date=date(2024, 1, 15),
        )

        result = TransactionService.create_transaction(db_session, data)

        assert result.ticker == "AAPL"
        assert result.transaction_type == "buy"
        assert result.quantity == 10.0
        assert result.price == 150.0

        # Verify holding was created
        holding = db_session.query(Holding).filter(Holding.ticker == "AAPL").first()
        assert holding is not None
        assert holding.quantity == 10.0
        assert holding.average_buy_price == 150.0

    def test_buy_updates_weighted_average(self, db_session: Session) -> None:
        cash = CashBalance(balance=50000.0)
        db_session.add(cash)

        holding = Holding(
            ticker="AAPL",
            quantity=10.0,
            average_buy_price=100.0,
            current_price=110.0,
        )
        db_session.add(holding)
        db_session.commit()

        data = TransactionCreate(
            ticker="AAPL",
            transaction_type="buy",
            quantity=10.0,
            price=200.0,
            fees=0.0,
            transaction_date=date(2024, 2, 1),
        )

        TransactionService.create_transaction(db_session, data)

        db_session.refresh(holding)
        # new_avg = ((100 * 10) + (200 * 10)) / (10 + 10) = 3000 / 20 = 150
        assert holding.average_buy_price == 150.0
        assert holding.quantity == 20.0

    def test_buy_decreases_cash_balance(self, db_session: Session) -> None:
        cash = CashBalance(balance=5000.0)
        db_session.add(cash)

        holding = Holding(
            ticker="MSFT",
            quantity=5.0,
            average_buy_price=100.0,
            current_price=110.0,
        )
        db_session.add(holding)
        db_session.commit()

        data = TransactionCreate(
            ticker="MSFT",
            transaction_type="buy",
            quantity=5.0,
            price=200.0,
            fees=10.0,
            transaction_date=date(2024, 3, 1),
        )

        TransactionService.create_transaction(db_session, data)

        updated_cash = db_session.query(CashBalance).first()
        assert updated_cash is not None
        # 5000 - (200 * 5 + 10) = 5000 - 1010 = 3990
        assert updated_cash.balance == 3990.0


class TestCreateSellTransaction:
    """Tests for TransactionService.create_transaction with sell type."""

    def test_sell_decreases_holding_quantity(self, db_session: Session) -> None:
        cash = CashBalance(balance=0.0)
        db_session.add(cash)

        holding = Holding(
            ticker="AAPL",
            quantity=20.0,
            average_buy_price=100.0,
            current_price=150.0,
        )
        db_session.add(holding)
        db_session.commit()

        data = TransactionCreate(
            ticker="AAPL",
            transaction_type="sell",
            quantity=5.0,
            price=150.0,
            fees=5.0,
            transaction_date=date(2024, 3, 1),
        )

        result = TransactionService.create_transaction(db_session, data)

        assert result.transaction_type == "sell"
        assert result.quantity == 5.0

        db_session.refresh(holding)
        assert holding.quantity == 15.0

    def test_sell_increases_cash_balance(self, db_session: Session) -> None:
        cash = CashBalance(balance=1000.0)
        db_session.add(cash)

        holding = Holding(
            ticker="AAPL",
            quantity=20.0,
            average_buy_price=100.0,
            current_price=150.0,
        )
        db_session.add(holding)
        db_session.commit()

        data = TransactionCreate(
            ticker="AAPL",
            transaction_type="sell",
            quantity=10.0,
            price=150.0,
            fees=10.0,
            transaction_date=date(2024, 3, 1),
        )

        TransactionService.create_transaction(db_session, data)

        updated_cash = db_session.query(CashBalance).first()
        assert updated_cash is not None
        # 1000 + (150 * 10 - 10) = 1000 + 1490 = 2490
        assert updated_cash.balance == 2490.0

    def test_sell_rejects_if_quantity_exceeds_holding(
        self, db_session: Session
    ) -> None:
        from fastapi import HTTPException

        holding = Holding(
            ticker="AAPL",
            quantity=5.0,
            average_buy_price=100.0,
            current_price=150.0,
        )
        db_session.add(holding)
        db_session.commit()

        data = TransactionCreate(
            ticker="AAPL",
            transaction_type="sell",
            quantity=10.0,
            price=150.0,
            fees=0.0,
            transaction_date=date(2024, 3, 1),
        )

        with pytest.raises(HTTPException) as exc_info:
            TransactionService.create_transaction(db_session, data)
        assert exc_info.value.status_code == 422
        assert "Insufficient shares" in exc_info.value.detail

    def test_sell_removes_holding_when_quantity_becomes_zero(
        self, db_session: Session
    ) -> None:
        cash = CashBalance(balance=0.0)
        db_session.add(cash)

        holding = Holding(
            ticker="AAPL",
            quantity=10.0,
            average_buy_price=100.0,
            current_price=150.0,
        )
        db_session.add(holding)
        db_session.commit()
        holding_id = holding.id

        data = TransactionCreate(
            ticker="AAPL",
            transaction_type="sell",
            quantity=10.0,
            price=150.0,
            fees=0.0,
            transaction_date=date(2024, 3, 1),
        )

        TransactionService.create_transaction(db_session, data)

        # Holding should be removed
        remaining = db_session.query(Holding).filter(Holding.id == holding_id).first()
        assert remaining is None

    def test_sell_removes_holding_when_quantity_is_near_zero_due_to_float_drift(
        self, db_session: Session
    ) -> None:
        cash = CashBalance(balance=0.0)
        db_session.add(cash)

        holding = Holding(
            ticker="AAPL",
            quantity=0.9,
            average_buy_price=100.0,
            current_price=150.0,
        )
        db_session.add(holding)
        db_session.commit()
        holding_id = holding.id

        first_sell = TransactionCreate(
            ticker="AAPL",
            transaction_type="sell",
            quantity=0.8,
            price=150.0,
            fees=0.0,
            transaction_date=date(2024, 3, 1),
        )
        second_sell = TransactionCreate(
            ticker="AAPL",
            transaction_type="sell",
            quantity=0.1,
            price=150.0,
            fees=0.0,
            transaction_date=date(2024, 3, 2),
        )

        TransactionService.create_transaction(db_session, first_sell)
        TransactionService.create_transaction(db_session, second_sell)

        remaining = db_session.query(Holding).filter(Holding.id == holding_id).first()
        assert remaining is None

    def test_sell_rejects_if_no_holding_exists(self, db_session: Session) -> None:
        from fastapi import HTTPException

        data = TransactionCreate(
            ticker="AAPL",
            transaction_type="sell",
            quantity=5.0,
            price=150.0,
            fees=0.0,
            transaction_date=date(2024, 3, 1),
        )

        with pytest.raises(HTTPException) as exc_info:
            TransactionService.create_transaction(db_session, data)
        assert exc_info.value.status_code == 422


class TestDeleteTransaction:
    """Tests for TransactionService.delete_transaction."""

    def test_delete_recalculates_holding(self, db_session: Session) -> None:
        cash = CashBalance(balance=10000.0)
        db_session.add(cash)

        holding = Holding(
            ticker="AAPL",
            quantity=20.0,
            average_buy_price=150.0,
            current_price=160.0,
        )
        db_session.add(holding)
        db_session.commit()

        # Add two buy transactions
        txn1 = Transaction(
            holding_id=holding.id,
            ticker="AAPL",
            transaction_type="buy",
            quantity=10.0,
            price=100.0,
            fees=0.0,
            transaction_date=date(2024, 1, 1),
        )
        txn2 = Transaction(
            holding_id=holding.id,
            ticker="AAPL",
            transaction_type="buy",
            quantity=10.0,
            price=200.0,
            fees=0.0,
            transaction_date=date(2024, 2, 1),
        )
        db_session.add_all([txn1, txn2])
        db_session.commit()

        # Delete the second transaction (price=200)
        TransactionService.delete_transaction(db_session, txn2.id)

        db_session.refresh(holding)
        # Only txn1 remains: quantity=10, avg=100
        assert holding.quantity == 10.0
        assert holding.average_buy_price == 100.0

    def test_delete_last_transaction_removes_holding(self, db_session: Session) -> None:
        cash = CashBalance(balance=10000.0)
        db_session.add(cash)

        holding = Holding(
            ticker="AAPL",
            quantity=10.0,
            average_buy_price=100.0,
            current_price=110.0,
        )
        db_session.add(holding)
        db_session.commit()
        holding_id = holding.id

        txn = Transaction(
            holding_id=holding.id,
            ticker="AAPL",
            transaction_type="buy",
            quantity=10.0,
            price=100.0,
            fees=5.0,
            transaction_date=date(2024, 1, 1),
        )
        db_session.add(txn)
        db_session.commit()

        TransactionService.delete_transaction(db_session, txn.id)

        # Holding should be removed
        remaining = db_session.query(Holding).filter(Holding.id == holding_id).first()
        assert remaining is None

    def test_delete_reverses_cash_balance_for_buy(self, db_session: Session) -> None:
        cash = CashBalance(balance=5000.0)
        db_session.add(cash)

        holding = Holding(
            ticker="AAPL",
            quantity=10.0,
            average_buy_price=100.0,
            current_price=110.0,
        )
        db_session.add(holding)
        db_session.commit()

        txn = Transaction(
            holding_id=holding.id,
            ticker="AAPL",
            transaction_type="buy",
            quantity=10.0,
            price=100.0,
            fees=10.0,
            transaction_date=date(2024, 1, 1),
        )
        db_session.add(txn)
        db_session.commit()

        TransactionService.delete_transaction(db_session, txn.id)

        updated_cash = db_session.query(CashBalance).first()
        assert updated_cash is not None
        # 5000 + (100 * 10 + 10) = 5000 + 1010 = 6010
        assert updated_cash.balance == 6010.0

    def test_delete_reverses_cash_balance_for_sell(self, db_session: Session) -> None:
        cash = CashBalance(balance=5000.0)
        db_session.add(cash)

        holding = Holding(
            ticker="AAPL",
            quantity=10.0,
            average_buy_price=100.0,
            current_price=110.0,
        )
        db_session.add(holding)
        db_session.commit()

        # Add a buy transaction so holding isn't deleted after sell removal
        buy_txn = Transaction(
            holding_id=holding.id,
            ticker="AAPL",
            transaction_type="buy",
            quantity=20.0,
            price=100.0,
            fees=0.0,
            transaction_date=date(2024, 1, 1),
        )
        sell_txn = Transaction(
            holding_id=holding.id,
            ticker="AAPL",
            transaction_type="sell",
            quantity=10.0,
            price=150.0,
            fees=5.0,
            transaction_date=date(2024, 2, 1),
        )
        db_session.add_all([buy_txn, sell_txn])
        db_session.commit()

        TransactionService.delete_transaction(db_session, sell_txn.id)

        updated_cash = db_session.query(CashBalance).first()
        assert updated_cash is not None
        # 5000 - (150 * 10 - 5) = 5000 - 1495 = 3505
        assert updated_cash.balance == 3505.0

    def test_delete_raises_404_for_nonexistent_transaction(
        self, db_session: Session
    ) -> None:
        from fastapi import HTTPException

        with pytest.raises(HTTPException) as exc_info:
            TransactionService.delete_transaction(db_session, 999)
        assert exc_info.value.status_code == 404
