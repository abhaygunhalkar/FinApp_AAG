"""Property-based tests for data integrity.

Tests Property 18 (Database transaction rollback) using Hypothesis to generate
random holding/transaction data and verify that failed write operations leave
the database state unchanged.

**Validates: Requirements 10.7, 14.5**
"""

from datetime import date
from typing import Any

import pytest
from fastapi import HTTPException
from hypothesis import HealthCheck, given, settings
from hypothesis import strategies as st
from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import StaticPool

from app.database import Base
from app.models.holding import Holding
from app.repositories.cash_balance_repository import CashBalanceRepository
from app.repositories.holdings_repository import HoldingsRepository
from app.schemas.holding import HoldingCreate
from app.schemas.transaction import TransactionCreate
from app.services.holdings_service import HoldingsService
from app.services.transaction_service import TransactionService

# --- Strategies ---

price_st = st.floats(
    min_value=1.0, max_value=10000.0, allow_nan=False, allow_infinity=False
)
quantity_st = st.floats(
    min_value=1.0, max_value=10000.0, allow_nan=False, allow_infinity=False
)
fees_st = st.floats(
    min_value=0.0, max_value=100.0, allow_nan=False, allow_infinity=False
)
ticker_st = st.from_regex(r"^[A-Z]{1,5}$", fullmatch=True)
date_st = st.dates(min_value=date(2020, 1, 1), max_value=date(2024, 12, 31))


def _create_session() -> Session:
    """Create a fresh in-memory database session for each test iteration."""
    engine = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    Base.metadata.create_all(bind=engine)
    session_factory = sessionmaker(autocommit=False, autoflush=False, bind=engine)
    return session_factory()


def _setup_cash_balance(db: Session, amount: float = 1_000_000.0) -> None:
    """Ensure a cash balance record exists with sufficient funds."""
    CashBalanceRepository.update_balance(db, amount)


def _snapshot_db_state(db: Session) -> dict[str, Any]:
    """Capture the current database state for comparison.

    Returns a dictionary with:
    - holdings_count: number of holdings
    - holdings: list of (ticker, quantity, average_buy_price) tuples
    - cash_balance: current cash balance value
    """
    holdings = HoldingsRepository.get_all(db)
    cash = CashBalanceRepository.get_balance(db)

    return {
        "holdings_count": len(holdings),
        "holdings": sorted(
            [(h.ticker, h.quantity, h.average_buy_price) for h in holdings]
        ),
        "cash_balance": cash.balance,
    }


def _assert_state_unchanged(before: dict[str, Any], after: dict[str, Any]) -> None:
    """Assert that the database state has not changed."""
    assert before["holdings_count"] == after["holdings_count"], (
        f"Holdings count changed: {before['holdings_count']} -> "
        f"{after['holdings_count']}"
    )
    assert (
        before["holdings"] == after["holdings"]
    ), f"Holdings changed: {before['holdings']} -> {after['holdings']}"
    assert (
        abs(before["cash_balance"] - after["cash_balance"]) < 1e-6
    ), f"Cash balance changed: {before['cash_balance']} -> {after['cash_balance']}"


# --- Property 18: Database transaction rollback ---


class TestProperty18DatabaseTransactionRollback:
    """Property 18: Database transaction rollback.

    For any write operation (create, update, delete) that fails mid-execution,
    the database state after the failure SHALL be identical to the database state
    before the operation was attempted.

    **Validates: Requirements 10.7, 14.5**
    """

    @settings(
        max_examples=100, suppress_health_check=[HealthCheck.function_scoped_fixture]
    )
    @given(
        ticker=ticker_st,
        holding_qty=quantity_st,
        avg_price=price_st,
        sell_qty_factor=st.floats(
            min_value=1.01, max_value=10.0, allow_nan=False, allow_infinity=False
        ),
        sell_price=price_st,
        fees=fees_st,
        txn_date=date_st,
    )
    def test_failed_sell_exceeding_quantity_leaves_db_unchanged(
        self,
        ticker: str,
        holding_qty: float,
        avg_price: float,
        sell_qty_factor: float,
        sell_price: float,
        fees: float,
        txn_date: date,
    ) -> None:
        """Selling more shares than owned fails and leaves DB state unchanged."""
        db = _create_session()
        try:
            # Setup: create a holding with known state
            _setup_cash_balance(db)
            holding = Holding(
                ticker=ticker,
                quantity=holding_qty,
                average_buy_price=avg_price,
                current_price=avg_price,
            )
            HoldingsRepository.create(db, holding)

            # Snapshot state before the failed operation
            state_before = _snapshot_db_state(db)

            # Attempt to sell more than owned (should fail with 422)
            sell_qty = holding_qty * sell_qty_factor
            if sell_qty <= holding_qty:
                sell_qty = holding_qty + 1.0

            data = TransactionCreate(
                ticker=ticker,
                transaction_type="sell",
                quantity=sell_qty,
                price=sell_price,
                fees=fees,
                transaction_date=txn_date,
            )

            with pytest.raises(HTTPException) as exc_info:
                TransactionService.create_transaction(db, data)

            assert exc_info.value.status_code == 422

            # Snapshot state after the failed operation
            state_after = _snapshot_db_state(db)

            # Assert: DB state is unchanged
            _assert_state_unchanged(state_before, state_after)
        finally:
            db.close()

    @settings(
        max_examples=100, suppress_health_check=[HealthCheck.function_scoped_fixture]
    )
    @given(
        ticker=ticker_st,
        holding_qty=quantity_st,
        avg_price=price_st,
        current_price=price_st,
    )
    def test_failed_create_duplicate_ticker_leaves_db_unchanged(
        self,
        ticker: str,
        holding_qty: float,
        avg_price: float,
        current_price: float,
    ) -> None:
        """Creating a holding with a duplicate ticker fails and leaves DB unchanged."""
        db = _create_session()
        try:
            # Setup: create an existing holding
            _setup_cash_balance(db)
            holding = Holding(
                ticker=ticker,
                quantity=holding_qty,
                average_buy_price=avg_price,
                current_price=current_price,
            )
            HoldingsRepository.create(db, holding)

            # Snapshot state before the failed operation
            state_before = _snapshot_db_state(db)

            # Attempt to create a holding with the same ticker (should fail)
            data = HoldingCreate(
                ticker=ticker,
                quantity=5.0,
                buy_price=100.0,
            )

            with pytest.raises(HTTPException) as exc_info:
                HoldingsService.create_holding(db, data)

            assert exc_info.value.status_code == 400

            # Snapshot state after the failed operation
            state_after = _snapshot_db_state(db)

            # Assert: DB state is unchanged
            _assert_state_unchanged(state_before, state_after)
        finally:
            db.close()

    @settings(
        max_examples=100, suppress_health_check=[HealthCheck.function_scoped_fixture]
    )
    @given(
        ticker=ticker_st,
        sell_price=price_st,
        sell_qty=quantity_st,
        fees=fees_st,
        txn_date=date_st,
    )
    def test_failed_sell_nonexistent_holding_leaves_db_unchanged(
        self,
        ticker: str,
        sell_price: float,
        sell_qty: float,
        fees: float,
        txn_date: date,
    ) -> None:
        """Selling a ticker with no holding fails and leaves DB unchanged."""
        db = _create_session()
        try:
            # Setup: only cash balance, no holdings
            _setup_cash_balance(db)

            # Snapshot state before the failed operation
            state_before = _snapshot_db_state(db)

            # Attempt to sell a ticker that doesn't exist (should fail with 422)
            data = TransactionCreate(
                ticker=ticker,
                transaction_type="sell",
                quantity=sell_qty,
                price=sell_price,
                fees=fees,
                transaction_date=txn_date,
            )

            with pytest.raises(HTTPException) as exc_info:
                TransactionService.create_transaction(db, data)

            assert exc_info.value.status_code == 422

            # Snapshot state after the failed operation
            state_after = _snapshot_db_state(db)

            # Assert: DB state is unchanged
            _assert_state_unchanged(state_before, state_after)
        finally:
            db.close()

    @settings(
        max_examples=100, suppress_health_check=[HealthCheck.function_scoped_fixture]
    )
    @given(
        ticker=ticker_st,
        holding_qty=quantity_st,
        avg_price=price_st,
    )
    def test_failed_delete_nonexistent_transaction_leaves_db_unchanged(
        self,
        ticker: str,
        holding_qty: float,
        avg_price: float,
    ) -> None:
        """Deleting a non-existent transaction fails and leaves DB unchanged."""
        db = _create_session()
        try:
            # Setup: create a holding with known state
            _setup_cash_balance(db)
            holding = Holding(
                ticker=ticker,
                quantity=holding_qty,
                average_buy_price=avg_price,
                current_price=avg_price,
            )
            HoldingsRepository.create(db, holding)

            # Snapshot state before the failed operation
            state_before = _snapshot_db_state(db)

            # Attempt to delete a transaction that doesn't exist (should fail with 404)
            nonexistent_id = 99999

            with pytest.raises(HTTPException) as exc_info:
                TransactionService.delete_transaction(db, nonexistent_id)

            assert exc_info.value.status_code == 404

            # Snapshot state after the failed operation
            state_after = _snapshot_db_state(db)

            # Assert: DB state is unchanged
            _assert_state_unchanged(state_before, state_after)
        finally:
            db.close()
