"""Property-based tests for filter/sort and activity feed (backend).

Tests Property 9 (Transaction history ordering) and Property 5 (Create holding produces
consistent records) using Hypothesis to generate random data and verify against the actual
service layer.

**Validates: Requirements 4.3, 3.1, 3.5**
"""

from datetime import date, timedelta

import pytest
from hypothesis import HealthCheck, given, settings
from hypothesis import strategies as st
from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import StaticPool

from app.database import Base
from app.models.cash_balance import CashBalance
from app.repositories.cash_balance_repository import CashBalanceRepository
from app.repositories.holdings_repository import HoldingsRepository
from app.repositories.transaction_repository import TransactionRepository
from app.schemas.holding import HoldingCreate
from app.schemas.transaction import TransactionCreate
from app.services.holdings_service import HoldingsService
from app.services.transaction_service import TransactionService


# --- Strategies ---

ticker_st = st.from_regex(r"^[A-Z]{1,5}$", fullmatch=True)
price_st = st.floats(min_value=0.01, max_value=10000.0, allow_nan=False, allow_infinity=False)
quantity_st = st.floats(min_value=1.0, max_value=10000.0, allow_nan=False, allow_infinity=False)
fees_st = st.floats(min_value=0.0, max_value=100.0, allow_nan=False, allow_infinity=False)
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


# --- Property 9: Transaction history ordering ---


class TestProperty9TransactionHistoryOrdering:
    """Property 9: Transaction history ordering.

    For any holding with multiple transactions, the transaction history returned by
    TransactionService.get_transactions SHALL be in descending order by transaction_date,
    such that each transaction's date is greater than or equal to the next transaction's
    date in the list.

    **Validates: Requirements 4.3**
    """

    @settings(max_examples=100, suppress_health_check=[HealthCheck.function_scoped_fixture])
    @given(
        ticker=ticker_st,
        num_transactions=st.integers(min_value=2, max_value=8),
        data=st.data(),
    )
    def test_transactions_returned_in_descending_date_order(
        self,
        ticker: str,
        num_transactions: int,
        data: st.DataObject,
    ) -> None:
        """Transaction history is always returned in descending date order."""
        db = _create_session()
        try:
            _setup_cash_balance(db)

            # Generate random dates and prices for each transaction
            dates = data.draw(
                st.lists(
                    date_st,
                    min_size=num_transactions,
                    max_size=num_transactions,
                )
            )
            prices = data.draw(
                st.lists(
                    price_st,
                    min_size=num_transactions,
                    max_size=num_transactions,
                )
            )
            quantities = data.draw(
                st.lists(
                    quantity_st,
                    min_size=num_transactions,
                    max_size=num_transactions,
                )
            )

            # Create transactions via TransactionService (first one creates the holding)
            for i in range(num_transactions):
                txn_data = TransactionCreate(
                    ticker=ticker,
                    transaction_type="buy",
                    quantity=quantities[i],
                    price=prices[i],
                    fees=0.0,
                    transaction_date=dates[i],
                )
                TransactionService.create_transaction(db, txn_data)

            # Get the holding to retrieve its ID
            holding = HoldingsRepository.get_by_ticker(db, ticker)
            assert holding is not None

            # Act: retrieve transaction history via TransactionService
            transactions = TransactionService.get_transactions(db, holding.id)

            # Assert: transactions are in descending date order
            assert len(transactions) == num_transactions, (
                f"Expected {num_transactions} transactions, got {len(transactions)}"
            )

            for i in range(len(transactions) - 1):
                current_date = transactions[i].transaction_date
                next_date = transactions[i + 1].transaction_date
                assert current_date >= next_date, (
                    f"Transaction at index {i} (date={current_date}) should be >= "
                    f"transaction at index {i+1} (date={next_date}). "
                    f"Transactions are not in descending date order."
                )
        finally:
            db.close()


# --- Property 5: Create holding produces consistent records ---


class TestProperty5CreateHoldingProducesConsistentRecords:
    """Property 5: Create holding produces consistent records.

    For any valid holding input (ticker 1-5 uppercase chars, quantity > 0, buy_price >= 0.01),
    creating a holding SHALL produce both a Holding record and a Transaction record where the
    transaction's ticker, quantity, and price match the input, and the returned HoldingResponse
    includes all calculated fields with values consistent with the input data.

    **Validates: Requirements 3.1, 3.5**
    """

    # Offline: with no quote, the buy price stands in as the current price.
    @pytest.mark.usefixtures("offline_market")
    @settings(max_examples=100, suppress_health_check=[HealthCheck.function_scoped_fixture])
    @given(
        ticker=ticker_st,
        quantity=quantity_st,
        buy_price=price_st,
    )
    def test_create_holding_produces_matching_holding_and_transaction(
        self,
        ticker: str,
        quantity: float,
        buy_price: float,
    ) -> None:
        """Creating a holding produces a Holding and Transaction with matching data."""
        db = _create_session()
        try:
            _setup_cash_balance(db)

            # Act: create a holding via HoldingsService
            data = HoldingCreate(
                ticker=ticker,
                quantity=quantity,
                buy_price=buy_price,
            )
            response = HoldingsService.create_holding(db, data)

            # Assert: HoldingResponse has correct values
            assert response.ticker == ticker
            assert abs(response.quantity - quantity) < 1e-6, (
                f"Expected quantity {quantity}, got {response.quantity}"
            )
            assert abs(response.average_buy_price - buy_price) < 1e-6, (
                f"Expected avg buy price {buy_price}, got {response.average_buy_price}"
            )
            assert abs(response.current_price - buy_price) < 1e-6, (
                f"Expected current price {buy_price}, got {response.current_price}"
            )

            # Verify calculated fields are consistent with input
            expected_total_invested = buy_price * quantity
            expected_current_value = buy_price * quantity  # current_price == buy_price initially
            expected_unrealized_gain = 0.0  # current_price == avg_buy_price initially

            assert abs(response.total_invested - expected_total_invested) < 1e-4, (
                f"Expected total_invested {expected_total_invested}, got {response.total_invested}"
            )
            assert abs(response.current_value - expected_current_value) < 1e-4, (
                f"Expected current_value {expected_current_value}, got {response.current_value}"
            )
            assert abs(response.unrealized_gain - expected_unrealized_gain) < 1e-4, (
                f"Expected unrealized_gain {expected_unrealized_gain}, got {response.unrealized_gain}"
            )

            # Assert: a Transaction record was created with matching data
            holding = HoldingsRepository.get_by_ticker(db, ticker)
            assert holding is not None

            transactions = TransactionRepository.get_by_holding(db, holding.id)
            assert len(transactions) == 1, (
                f"Expected exactly 1 transaction, got {len(transactions)}"
            )

            txn = transactions[0]
            assert txn.ticker == ticker, (
                f"Transaction ticker should be '{ticker}', got '{txn.ticker}'"
            )
            assert abs(txn.quantity - quantity) < 1e-6, (
                f"Transaction quantity should be {quantity}, got {txn.quantity}"
            )
            assert abs(txn.price - buy_price) < 1e-6, (
                f"Transaction price should be {buy_price}, got {txn.price}"
            )
            assert txn.transaction_type == "buy", (
                f"Transaction type should be 'buy', got '{txn.transaction_type}'"
            )
            assert txn.transaction_date == date.today(), (
                f"Transaction date should be today ({date.today()}), got {txn.transaction_date}"
            )
        finally:
            db.close()
