"""Property-based tests for data validation schemas.

Tests Property 6 (Reject invalid holding inputs) and Property 12 (Watchlist input
validation)
using Hypothesis to generate random inputs and verify schema validation behavior.

**Validates: Requirements 3.6, 5.2**
"""

import pytest
from hypothesis import given, settings
from hypothesis import strategies as st
from pydantic import ValidationError

from app.schemas.holding import HoldingCreate
from app.schemas.watchlist import WatchlistCreate

# --- Strategies ---

# Valid ticker: 1-5 uppercase ASCII letters
valid_ticker_st = st.from_regex(r"^[A-Z]{1,5}$", fullmatch=True)

# Invalid tickers: lowercase, digits, too long, empty, special chars
invalid_ticker_st = st.one_of(
    st.from_regex(r"^[a-z]{1,5}$", fullmatch=True),  # lowercase
    st.from_regex(r"^[A-Z]{6,10}$", fullmatch=True),  # too long
    st.just(""),  # empty
    st.from_regex(r"^[A-Z0-9]{1,5}$", fullmatch=True).filter(
        lambda s: any(c.isdigit() for c in s)
    ),  # contains digits
    st.from_regex(r"^[A-Z!@#]{1,5}$", fullmatch=True).filter(
        lambda s: any(c in "!@#" for c in s)
    ),  # special chars
)


# --- Property 6: Reject invalid holding inputs ---


class TestProperty6RejectInvalidHoldingInputs:
    """Property 6: Reject invalid holding inputs.

    Verify quantity <= 0 or buy_price < 0.01 always rejected.

    **Validates: Requirements 3.6**
    """

    @settings(max_examples=100)
    @given(
        quantity=st.floats(max_value=0, allow_nan=False, allow_infinity=False),
        buy_price=st.floats(
            min_value=0.01, max_value=1_000_000, allow_nan=False, allow_infinity=False
        ),
        ticker=valid_ticker_st,
    )
    def test_quantity_lte_zero_rejected(
        self, quantity: float, buy_price: float, ticker: str
    ) -> None:
        """Any quantity <= 0 causes HoldingCreate validation to fail."""
        with pytest.raises(ValidationError):
            HoldingCreate(ticker=ticker, quantity=quantity, buy_price=buy_price)

    @settings(max_examples=100)
    @given(
        quantity=st.floats(
            min_value=0.01, max_value=1_000_000, allow_nan=False, allow_infinity=False
        ),
        buy_price=st.floats(max_value=0.0099, allow_nan=False, allow_infinity=False),
        ticker=valid_ticker_st,
    )
    def test_buy_price_lt_001_rejected(
        self, quantity: float, buy_price: float, ticker: str
    ) -> None:
        """Any buy_price < 0.01 causes HoldingCreate validation to fail."""
        with pytest.raises(ValidationError):
            HoldingCreate(ticker=ticker, quantity=quantity, buy_price=buy_price)

    @settings(max_examples=100)
    @given(
        quantity=st.floats(
            min_value=0.01, max_value=1_000_000, allow_nan=False, allow_infinity=False
        ),
        buy_price=st.floats(
            min_value=0.01, max_value=1_000_000, allow_nan=False, allow_infinity=False
        ),
        ticker=valid_ticker_st,
    )
    def test_valid_inputs_accepted(
        self, quantity: float, buy_price: float, ticker: str
    ) -> None:
        """Valid inputs (quantity > 0, buy_price >= 0.01, valid ticker) are accepted."""
        holding = HoldingCreate(ticker=ticker, quantity=quantity, buy_price=buy_price)
        assert holding.quantity == quantity
        assert holding.buy_price == buy_price
        assert holding.ticker == ticker


# --- Property 12: Watchlist input validation ---


class TestProperty12WatchlistInputValidation:
    """Property 12: Watchlist input validation.

    Verify ticker pattern, target_buy_price range, priority range, notes length.

    **Validates: Requirements 5.2**
    """

    @settings(max_examples=100)
    @given(ticker=invalid_ticker_st)
    def test_invalid_ticker_rejected(self, ticker: str) -> None:
        """Ticker must match ^[A-Z]{1,5}$ pattern — invalid tickers are rejected."""
        with pytest.raises(ValidationError):
            WatchlistCreate(ticker=ticker)

    @settings(max_examples=100)
    @given(ticker=valid_ticker_st)
    def test_valid_ticker_accepted(self, ticker: str) -> None:
        """Valid tickers matching ^[A-Z]{1,5}$ are accepted."""
        item = WatchlistCreate(ticker=ticker)
        assert item.ticker == ticker

    @settings(max_examples=100)
    @given(
        ticker=valid_ticker_st,
        target_buy_price=st.one_of(
            st.floats(max_value=0.0099, allow_nan=False, allow_infinity=False),
            st.floats(
                min_value=1_000_000.0, allow_nan=False, allow_infinity=False
            ).filter(lambda x: x > 999_999.99),
        ),
    )
    def test_invalid_target_buy_price_rejected(
        self, ticker: str, target_buy_price: float
    ) -> None:
        """target_buy_price (if provided) must be between 0.01 and 999999.99."""
        with pytest.raises(ValidationError):
            WatchlistCreate(ticker=ticker, target_buy_price=target_buy_price)

    @settings(max_examples=100)
    @given(
        ticker=valid_ticker_st,
        target_buy_price=st.floats(
            min_value=0.01, max_value=999_999.99, allow_nan=False, allow_infinity=False
        ),
    )
    def test_valid_target_buy_price_accepted(
        self, ticker: str, target_buy_price: float
    ) -> None:
        """Valid target_buy_price between 0.01 and 999999.99 is accepted."""
        item = WatchlistCreate(ticker=ticker, target_buy_price=target_buy_price)
        assert item.target_buy_price == target_buy_price

    @settings(max_examples=100)
    @given(
        ticker=valid_ticker_st,
        priority=st.integers().filter(lambda x: x < 1 or x > 5),
    )
    def test_invalid_priority_rejected(self, ticker: str, priority: int) -> None:
        """Priority must be between 1 and 5 — values outside this range are rejected."""
        with pytest.raises(ValidationError):
            WatchlistCreate(ticker=ticker, priority=priority)

    @settings(max_examples=100)
    @given(
        ticker=valid_ticker_st,
        priority=st.integers(min_value=1, max_value=5),
    )
    def test_valid_priority_accepted(self, ticker: str, priority: int) -> None:
        """Priority between 1 and 5 is accepted."""
        item = WatchlistCreate(ticker=ticker, priority=priority)
        assert item.priority == priority

    @settings(max_examples=100)
    @given(
        ticker=valid_ticker_st,
        notes=st.text(min_size=501, max_size=600),
    )
    def test_notes_exceeding_500_chars_rejected(self, ticker: str, notes: str) -> None:
        """Notes, if given, may be at most 500 characters; longer ones are rejected."""
        with pytest.raises(ValidationError):
            WatchlistCreate(ticker=ticker, notes=notes)

    @settings(max_examples=100)
    @given(
        ticker=valid_ticker_st,
        notes=st.text(min_size=0, max_size=500),
    )
    def test_valid_notes_accepted(self, ticker: str, notes: str) -> None:
        """Notes at most 500 characters are accepted."""
        item = WatchlistCreate(ticker=ticker, notes=notes)
        assert item.notes == notes

    @settings(max_examples=100)
    @given(
        ticker=valid_ticker_st,
        target_buy_price=st.one_of(
            st.none(),
            st.floats(
                min_value=0.01,
                max_value=999_999.99,
                allow_nan=False,
                allow_infinity=False,
            ),
        ),
        priority=st.integers(min_value=1, max_value=5),
        notes=st.one_of(st.none(), st.text(min_size=0, max_size=500)),
    )
    def test_valid_complete_inputs_accepted(
        self,
        ticker: str,
        target_buy_price: float | None,
        priority: int,
        notes: str | None,
    ) -> None:
        """Valid inputs matching all constraints are accepted."""
        item = WatchlistCreate(
            ticker=ticker,
            target_buy_price=target_buy_price,
            priority=priority,
            notes=notes,
        )
        assert item.ticker == ticker
        assert item.target_buy_price == target_buy_price
        assert item.priority == priority
        assert item.notes == notes
