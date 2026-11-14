"""Property-based tests for transaction logic.

Tests Property 7 (Buy transaction weighted average), Property 8 (Sell transaction
realized gain),
Property 10 (Transaction deletion recalculates holding), and Property 11 (Reject sell
exceeding quantity)
using Hypothesis to generate random transaction data and verify against the actual
TransactionService.

**Validates: Requirements 4.1, 4.2, 4.4, 4.5**
"""

from datetime import date, timedelta

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
from app.schemas.transaction import TransactionCreate
from app.services.transaction_service import TransactionService

# --- Strategies ---

# Prices and quantities constrained to reasonable ranges to avoid floating point issues
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


# --- Property 7: Buy transaction weighted average ---


class TestProperty7BuyTransactionWeightedAverage:
    """Property 7: Buy transaction weighted average.

    For any existing holding with average_buy_price and quantity, and any buy
    transaction
    with price > 0 and transaction_quantity > 0, after processing the buy transaction
    the
    holding's new average_buy_price SHALL equal
    ((old_avg × old_qty) + (price × transaction_quantity)) / (old_qty +
    transaction_quantity)
    and the new quantity SHALL equal old_qty + transaction_quantity.

    **Validates: Requirements 4.1**
    """

    @settings(
        max_examples=100, suppress_health_check=[HealthCheck.function_scoped_fixture]
    )
    @given(
        old_avg=price_st,
        old_qty=quantity_st,
        buy_price=price_st,
        buy_qty=quantity_st,
        ticker=ticker_st,
        fees=fees_st,
        txn_date=date_st,
    )
    def test_weighted_average_after_buy(
        self,
        old_avg: float,
        old_qty: float,
        buy_price: float,
        buy_qty: float,
        ticker: str,
        fees: float,
        txn_date: date,
    ) -> None:
        """After a buy, holding avg price follows weighted average formula."""
        db = _create_session()
        try:
            # Setup: create an existing holding and cash balance
            _setup_cash_balance(db)
            holding = Holding(
                ticker=ticker,
                quantity=old_qty,
                average_buy_price=old_avg,
                current_price=old_avg,
            )
            holding = HoldingsRepository.create(db, holding)

            # Act: process a buy transaction
            data = TransactionCreate(
                ticker=ticker,
                transaction_type="buy",
                quantity=buy_qty,
                price=buy_price,
                fees=fees,
                transaction_date=txn_date,
            )
            TransactionService.create_transaction(db, data)

            # Assert: verify weighted average formula
            updated_holding = HoldingsRepository.get_by_ticker(db, ticker)
            assert updated_holding is not None

            expected_avg = ((old_avg * old_qty) + (buy_price * buy_qty)) / (
                old_qty + buy_qty
            )
            expected_qty = old_qty + buy_qty

            assert (
                abs(updated_holding.average_buy_price - expected_avg) < 1e-6
            ), f"Expected avg {expected_avg}, got {updated_holding.average_buy_price}"
            assert (
                abs(updated_holding.quantity - expected_qty) < 1e-6
            ), f"Expected qty {expected_qty}, got {updated_holding.quantity}"
        finally:
            db.close()


# --- Property 8: Sell transaction realized gain ---


class TestProperty8SellTransactionRealizedGain:
    """Property 8: Sell transaction realized gain.

    For any existing holding and any valid sell transaction (quantity <= holding
    quantity),
    the realized_gain SHALL equal (sell_price - average_buy_price) × quantity_sold,
    and the holding quantity SHALL decrease by quantity_sold.

    **Validates: Requirements 4.2**
    """

    @settings(
        max_examples=100, suppress_health_check=[HealthCheck.function_scoped_fixture]
    )
    @given(
        avg_price=price_st,
        holding_qty=st.floats(
            min_value=10.0, max_value=10000.0, allow_nan=False, allow_infinity=False
        ),
        sell_price=price_st,
        sell_fraction=st.floats(
            min_value=0.01, max_value=0.99, allow_nan=False, allow_infinity=False
        ),
        ticker=ticker_st,
        fees=fees_st,
        txn_date=date_st,
    )
    def test_realized_gain_and_quantity_decrease(
        self,
        avg_price: float,
        holding_qty: float,
        sell_price: float,
        sell_fraction: float,
        ticker: str,
        fees: float,
        txn_date: date,
    ) -> None:
        """After a sell, realized gain = (price - avg) × qty sold; quantity drops."""
        db = _create_session()
        try:
            # Compute sell quantity as a fraction of holding to ensure it's valid
            sell_qty = round(holding_qty * sell_fraction, 2)
            if sell_qty <= 0 or sell_qty >= holding_qty:
                return  # Skip edge cases where rounding makes it invalid

            # Setup: create an existing holding
            _setup_cash_balance(db)
            holding = Holding(
                ticker=ticker,
                quantity=holding_qty,
                average_buy_price=avg_price,
                current_price=avg_price,
            )
            holding = HoldingsRepository.create(db, holding)

            # Record cash balance before sell
            cash_before = CashBalanceRepository.get_balance(db).balance

            # Act: process a sell transaction
            data = TransactionCreate(
                ticker=ticker,
                transaction_type="sell",
                quantity=sell_qty,
                price=sell_price,
                fees=fees,
                transaction_date=txn_date,
            )
            TransactionService.create_transaction(db, data)

            # Assert: verify quantity decreased
            updated_holding = HoldingsRepository.get_by_ticker(db, ticker)
            assert updated_holding is not None

            expected_qty = holding_qty - sell_qty
            assert (
                abs(updated_holding.quantity - expected_qty) < 1e-6
            ), f"Expected qty {expected_qty}, got {updated_holding.quantity}"

            # Verify realized gain via cash balance change
            # Cash increases by (sell_price × sell_qty - fees)
            cash_after = CashBalanceRepository.get_balance(db).balance
            expected_cash_increase = sell_price * sell_qty - fees
            actual_cash_increase = cash_after - cash_before
            assert abs(actual_cash_increase - expected_cash_increase) < 1e-4, (
                f"Expected cash increase {expected_cash_increase}, "
                f"got {actual_cash_increase}"
            )

            # The sell history reports (sell_price - avg_price) × sell_qty. The
            # holding has no buy lots, so its average is the cost basis.
            [sell] = TransactionService.get_sell_history(db)
            expected_realized_gain = round((sell_price - avg_price) * sell_qty, 2)
            assert sell.realized_gain == expected_realized_gain

            # The average cost of the shares kept doesn't change on a sell
            assert abs(updated_holding.average_buy_price - avg_price) < 1e-6, (
                f"Average buy price should not change on sell: expected {avg_price}, "
                f"got {updated_holding.average_buy_price}"
            )
        finally:
            db.close()


# --- Property 10: Transaction deletion recalculates holding ---


class TestProperty10TransactionDeletionRecalculates:
    """Property 10: Transaction deletion recalculates holding.

    For any holding with multiple buy transactions, deleting any single transaction
    SHALL
    result in a holding whose average_buy_price and quantity are equivalent to replaying
    all remaining buy transactions in chronological order from an empty state.

    **Validates: Requirements 4.4**
    """

    @settings(
        max_examples=100, suppress_health_check=[HealthCheck.function_scoped_fixture]
    )
    @given(
        prices=st.lists(
            price_st,
            min_size=2,
            max_size=5,
        ),
        quantities=st.lists(
            quantity_st,
            min_size=2,
            max_size=5,
        ),
        ticker=ticker_st,
        delete_index=st.integers(min_value=0, max_value=100),
    )
    def test_deletion_replays_remaining_transactions(
        self,
        prices: list[float],
        quantities: list[float],
        ticker: str,
        delete_index: int,
    ) -> None:
        """After deleting a transaction, holding matches replay of remaining buys."""
        db = _create_session()
        try:
            # Ensure lists are same length
            n = min(len(prices), len(quantities))
            prices = prices[:n]
            quantities = quantities[:n]
            if n < 2:
                return

            # Normalize delete_index to valid range
            delete_index = delete_index % n

            # Setup: create holding with buys via TransactionService
            _setup_cash_balance(db)

            base_date = date(2023, 1, 1)
            transaction_ids: list[int] = []

            for i in range(n):
                txn_date = base_date + timedelta(days=i)
                data = TransactionCreate(
                    ticker=ticker,
                    transaction_type="buy",
                    quantity=quantities[i],
                    price=prices[i],
                    fees=0.0,
                    transaction_date=txn_date,
                )
                result = TransactionService.create_transaction(db, data)
                transaction_ids.append(result.id)

            # Act: delete one transaction
            txn_to_delete = transaction_ids[delete_index]
            TransactionService.delete_transaction(db, txn_to_delete)

            # Compute expected state by replaying remaining buys
            remaining_prices = [p for i, p in enumerate(prices) if i != delete_index]
            remaining_quantities = [
                q for i, q in enumerate(quantities) if i != delete_index
            ]

            expected_qty = sum(remaining_quantities)
            expected_cost = sum(
                p * q
                for p, q in zip(remaining_prices, remaining_quantities, strict=True)
            )
            expected_avg = expected_cost / expected_qty if expected_qty > 0 else 0.0

            # Assert
            updated_holding = HoldingsRepository.get_by_ticker(db, ticker)
            assert (
                updated_holding is not None
            ), "Holding should still exist after deleting one of multiple transactions"

            assert (
                abs(updated_holding.quantity - expected_qty) < 1e-4
            ), f"Expected qty {expected_qty}, got {updated_holding.quantity}"
            assert (
                abs(updated_holding.average_buy_price - expected_avg) < 1e-4
            ), f"Expected avg {expected_avg}, got {updated_holding.average_buy_price}"
        finally:
            db.close()


# --- Property 11: Reject sell exceeding quantity ---


class TestProperty11RejectSellExceedingQuantity:
    """Property 11: Reject sell exceeding quantity.

    Any sell with quantity > holding.quantity should be rejected with 422 status.
    The holding's quantity and average_buy_price should remain unchanged after
    rejection.

    **Validates: Requirements 4.5**
    """

    @settings(
        max_examples=100, suppress_health_check=[HealthCheck.function_scoped_fixture]
    )
    @given(
        avg_price=price_st,
        holding_qty=quantity_st,
        excess_factor=st.floats(
            min_value=1.01, max_value=10.0, allow_nan=False, allow_infinity=False
        ),
        sell_price=price_st,
        ticker=ticker_st,
        fees=fees_st,
        txn_date=date_st,
    )
    def test_sell_exceeding_quantity_rejected_422(
        self,
        avg_price: float,
        holding_qty: float,
        excess_factor: float,
        sell_price: float,
        ticker: str,
        fees: float,
        txn_date: date,
    ) -> None:
        """Sell quantity > holding quantity is rejected with 422, holding unchanged."""
        db = _create_session()
        try:
            # Setup: create an existing holding
            _setup_cash_balance(db)
            holding = Holding(
                ticker=ticker,
                quantity=holding_qty,
                average_buy_price=avg_price,
                current_price=avg_price,
            )
            holding = HoldingsRepository.create(db, holding)

            # Compute sell quantity that exceeds holding
            sell_qty = holding_qty * excess_factor
            # Ensure it actually exceeds (handle floating point)
            if sell_qty <= holding_qty:
                sell_qty = holding_qty + 1.0

            # Act & Assert: sell should be rejected with 422
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

            # Verify holding is unchanged
            unchanged_holding = HoldingsRepository.get_by_ticker(db, ticker)
            assert unchanged_holding is not None
            assert abs(unchanged_holding.quantity - holding_qty) < 1e-6, (
                f"Holding quantity should be unchanged: expected {holding_qty}, "
                f"got {unchanged_holding.quantity}"
            )
            assert abs(unchanged_holding.average_buy_price - avg_price) < 1e-6, (
                f"Holding avg price should be unchanged: expected {avg_price}, "
                f"got {unchanged_holding.average_buy_price}"
            )
        finally:
            db.close()
