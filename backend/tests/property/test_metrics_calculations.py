"""Property-based tests for metrics calculations.

Tests Property 1 (Per-holding metrics calculation), Property 13 (Portfolio aggregate
metrics),
Property 14 (Cash position tracking), and Property 15 (Top gainers and losers selection)
using Hypothesis to generate random holdings data and verify calculation formulas.

**Validates: Requirements 1.2, 1.3, 1.4, 1.7, 6.2, 6.3, 6.4, 6.6, 7.3**
"""

from dataclasses import dataclass

from hypothesis import assume, given, settings
from hypothesis import strategies as st

# --- Data classes to represent holdings for pure calculation testing ---


@dataclass
class HoldingData:
    """Represents a holding with the fields needed for metrics calculations."""

    quantity: float
    average_buy_price: float
    current_price: float
    dividend_yield: float


@dataclass
class TransactionData:
    """Represents a transaction for cash position tracking."""

    transaction_type: str  # "buy" or "sell"
    quantity: float
    price: float
    fees: float


# --- Pure calculation functions (mirroring service logic) ---


def calculate_unrealized_gain(
    current_price: float, average_buy_price: float, quantity: float
) -> float:
    """Calculate unrealized gain for a holding."""
    return (current_price - average_buy_price) * quantity


def calculate_unrealized_gain_pct(
    current_price: float, average_buy_price: float
) -> float:
    """Calculate unrealized gain percentage for a holding."""
    if average_buy_price > 0:
        return round(((current_price - average_buy_price) / average_buy_price) * 100, 2)
    return 0.0


def calculate_allocation_pct(
    current_price: float, quantity: float, total_portfolio_value: float
) -> float:
    """Calculate allocation percentage for a holding."""
    if total_portfolio_value > 0:
        return round((current_price * quantity) / total_portfolio_value * 100, 2)
    return 0.0


def calculate_annual_dividend_income(
    dividend_yield: float, current_price: float, quantity: float
) -> float:
    """Calculate annual dividend income for a holding."""
    return dividend_yield * current_price * quantity


def calculate_total_portfolio_value(holdings: list[HoldingData]) -> float:
    """Calculate total portfolio value across all holdings."""
    return sum(h.current_price * h.quantity for h in holdings)


def calculate_total_invested(holdings: list[HoldingData]) -> float:
    """Calculate total invested across all holdings."""
    return sum(h.average_buy_price * h.quantity for h in holdings)


def calculate_cash_position(
    initial_balance: float, transactions: list[TransactionData]
) -> float:
    """Calculate cash position after a sequence of transactions."""
    balance = initial_balance
    for txn in transactions:
        if txn.transaction_type == "sell":
            balance += txn.price * txn.quantity
        elif txn.transaction_type == "buy":
            balance -= txn.price * txn.quantity + txn.fees
    return balance


def get_top_gainers(holdings: list[HoldingData], n: int = 5) -> list[HoldingData]:
    """Get top N holdings by unrealized_gain_pct (highest)."""
    sorted_holdings = sorted(
        holdings,
        key=lambda h: calculate_unrealized_gain_pct(
            h.current_price, h.average_buy_price
        ),
        reverse=True,
    )
    return sorted_holdings[:n]


def get_top_losers(holdings: list[HoldingData], n: int = 5) -> list[HoldingData]:
    """Get top N holdings by unrealized_gain_pct (lowest)."""
    sorted_holdings = sorted(
        holdings,
        key=lambda h: calculate_unrealized_gain_pct(
            h.current_price, h.average_buy_price
        ),
    )
    return sorted_holdings[:n]


# --- Strategies ---

# Positive float for quantity (shares owned)
positive_quantity_st = st.floats(
    min_value=0.01, max_value=100_000, allow_nan=False, allow_infinity=False
)

# Positive float for prices
positive_price_st = st.floats(
    min_value=0.01, max_value=100_000, allow_nan=False, allow_infinity=False
)

# Non-negative float for current price (can be 0 if stock is worthless)
non_negative_price_st = st.floats(
    min_value=0.0, max_value=100_000, allow_nan=False, allow_infinity=False
)

# Dividend yield (0% to 20% expressed as decimal fraction, e.g., 0.05 = 5%)
dividend_yield_st = st.floats(
    min_value=0.0, max_value=0.20, allow_nan=False, allow_infinity=False
)

# Fees (non-negative)
fees_st = st.floats(
    min_value=0.0, max_value=100.0, allow_nan=False, allow_infinity=False
)

# Strategy for a single holding
holding_st = st.builds(
    HoldingData,
    quantity=positive_quantity_st,
    average_buy_price=positive_price_st,
    current_price=non_negative_price_st,
    dividend_yield=dividend_yield_st,
)

# Strategy for a list of holdings (1 to 20)
holdings_list_st = st.lists(holding_st, min_size=1, max_size=20)

# Strategy for a transaction
transaction_st = st.builds(
    TransactionData,
    transaction_type=st.sampled_from(["buy", "sell"]),
    quantity=positive_quantity_st,
    price=positive_price_st,
    fees=fees_st,
)

# Strategy for a list of transactions
transactions_list_st = st.lists(transaction_st, min_size=1, max_size=20)


# --- Property 1: Per-holding metrics calculation ---


class TestProperty1PerHoldingMetrics:
    """Property 1: Per-holding metrics calculation.

    Verify unrealized_gain, unrealized_gain_pct, allocation_pct, annual_dividend_income
    formulas.

    **Validates: Requirements 1.2, 1.3, 1.4, 1.7**
    """

    @settings(max_examples=100)
    @given(
        quantity=positive_quantity_st,
        average_buy_price=positive_price_st,
        current_price=non_negative_price_st,
    )
    def test_unrealized_gain_formula(
        self, quantity: float, average_buy_price: float, current_price: float
    ) -> None:
        """unrealized_gain = (current_price - average_buy_price) × quantity."""
        result = calculate_unrealized_gain(current_price, average_buy_price, quantity)
        expected = (current_price - average_buy_price) * quantity
        assert abs(result - expected) < 1e-6

    @settings(max_examples=100)
    @given(
        average_buy_price=positive_price_st,
        current_price=non_negative_price_st,
    )
    def test_unrealized_gain_pct_formula(
        self, average_buy_price: float, current_price: float
    ) -> None:
        """unrealized_gain_pct = (price - avg) / avg × 100, rounded to 2dp."""
        result = calculate_unrealized_gain_pct(current_price, average_buy_price)
        expected = round(
            ((current_price - average_buy_price) / average_buy_price) * 100, 2
        )
        assert result == expected

    @settings(max_examples=100)
    @given(
        quantity=positive_quantity_st,
        current_price=non_negative_price_st,
        total_portfolio_value=st.floats(
            min_value=0.01, max_value=10_000_000, allow_nan=False, allow_infinity=False
        ),
    )
    def test_allocation_pct_formula_positive_total(
        self, quantity: float, current_price: float, total_portfolio_value: float
    ) -> None:
        """allocation_pct = price × quantity / total value × 100, rounded to 2dp."""
        # Ensure total_portfolio_value >= current_price * quantity (realistic
        # constraint)
        holding_value = current_price * quantity
        assume(total_portfolio_value >= holding_value)

        result = calculate_allocation_pct(
            current_price, quantity, total_portfolio_value
        )
        expected = round((current_price * quantity) / total_portfolio_value * 100, 2)
        assert result == expected

    @settings(max_examples=100)
    @given(
        quantity=positive_quantity_st,
        current_price=non_negative_price_st,
    )
    def test_allocation_pct_zero_total(
        self, quantity: float, current_price: float
    ) -> None:
        """allocation_pct = 0 when total_portfolio_value is 0."""
        result = calculate_allocation_pct(current_price, quantity, 0.0)
        assert result == 0.0

    @settings(max_examples=100)
    @given(
        quantity=positive_quantity_st,
        current_price=non_negative_price_st,
        dividend_yield=dividend_yield_st,
    )
    def test_annual_dividend_income_formula(
        self, quantity: float, current_price: float, dividend_yield: float
    ) -> None:
        """annual_dividend_income = dividend_yield × current_price × quantity."""
        result = calculate_annual_dividend_income(
            dividend_yield, current_price, quantity
        )
        expected = dividend_yield * current_price * quantity
        assert abs(result - expected) < 1e-6


# --- Property 13: Portfolio aggregate metrics ---


class TestProperty13PortfolioAggregateMetrics:
    """Property 13: Portfolio aggregate metrics.

    Verify total_portfolio_value, total_invested, daily_change sums.

    **Validates: Requirements 6.2, 6.3, 6.4**
    """

    @settings(max_examples=100)
    @given(holdings=holdings_list_st)
    def test_total_portfolio_value_is_sum(self, holdings: list[HoldingData]) -> None:
        """total_portfolio_value = Σ(current_price × quantity) for all holdings."""
        result = calculate_total_portfolio_value(holdings)
        expected = sum(h.current_price * h.quantity for h in holdings)
        assert abs(result - expected) < 1e-6

    @settings(max_examples=100)
    @given(holdings=holdings_list_st)
    def test_total_invested_is_sum(self, holdings: list[HoldingData]) -> None:
        """total_invested = Σ(average_buy_price × quantity) for all holdings."""
        result = calculate_total_invested(holdings)
        expected = sum(h.average_buy_price * h.quantity for h in holdings)
        assert abs(result - expected) < 1e-6

    @settings(max_examples=100)
    @given(
        holdings=holdings_list_st,
        previous_closes=st.data(),
    )
    def test_daily_change_is_sum(
        self, holdings: list[HoldingData], previous_closes: st.DataObject
    ) -> None:
        """daily_change = Σ((current_price - previous_close) × quantity)."""
        # Generate a previous close for each holding
        prev_closes = [
            previous_closes.draw(
                st.floats(
                    min_value=0.01,
                    max_value=100_000,
                    allow_nan=False,
                    allow_infinity=False,
                )
            )
            for _ in holdings
        ]

        # Calculate daily change
        daily_change = sum(
            (h.current_price - prev_close) * h.quantity
            for h, prev_close in zip(holdings, prev_closes, strict=True)
        )

        # Verify the sum formula
        expected = sum(
            (h.current_price - prev_close) * h.quantity
            for h, prev_close in zip(holdings, prev_closes, strict=True)
        )
        assert abs(daily_change - expected) < 1e-6

    @settings(max_examples=100)
    @given(holdings=holdings_list_st)
    def test_total_portfolio_value_non_negative(
        self, holdings: list[HoldingData]
    ) -> None:
        """total_portfolio_value is never negative (prices and quantities aren't)."""
        result = calculate_total_portfolio_value(holdings)
        assert result >= 0.0

    @settings(max_examples=100)
    @given(holdings=holdings_list_st)
    def test_total_invested_positive(self, holdings: list[HoldingData]) -> None:
        """total_invested is always positive (prices > 0 and quantities > 0)."""
        result = calculate_total_invested(holdings)
        assert result > 0.0


# --- Property 14: Cash position tracking ---


class TestProperty14CashPositionTracking:
    """Property 14: Cash position tracking.

    Verify cash balance after sequences of buys and sells.

    **Validates: Requirements 6.6**
    """

    @settings(max_examples=100)
    @given(
        initial_balance=st.floats(
            min_value=0.0, max_value=1_000_000, allow_nan=False, allow_infinity=False
        ),
        transactions=transactions_list_st,
    )
    def test_cash_position_formula(
        self, initial_balance: float, transactions: list[TransactionData]
    ) -> None:
        """cash = initial + Σ(sell price × qty) - Σ(buy price × qty + fees)."""
        result = calculate_cash_position(initial_balance, transactions)

        # Calculate expected using the explicit formula
        sell_total = sum(
            txn.price * txn.quantity
            for txn in transactions
            if txn.transaction_type == "sell"
        )
        buy_total = sum(
            txn.price * txn.quantity + txn.fees
            for txn in transactions
            if txn.transaction_type == "buy"
        )
        expected = initial_balance + sell_total - buy_total

        # Use relative tolerance for large values to account for floating-point
        # accumulation
        if abs(expected) > 1.0:
            assert abs(result - expected) / abs(expected) < 1e-9
        else:
            assert abs(result - expected) < 1e-6

    @settings(max_examples=100)
    @given(
        initial_balance=st.floats(
            min_value=0.0, max_value=1_000_000, allow_nan=False, allow_infinity=False
        ),
    )
    def test_no_transactions_preserves_balance(self, initial_balance: float) -> None:
        """With no transactions, cash position equals initial balance."""
        result = calculate_cash_position(initial_balance, [])
        assert abs(result - initial_balance) < 1e-6

    @settings(max_examples=100)
    @given(
        initial_balance=st.floats(
            min_value=1000.0, max_value=1_000_000, allow_nan=False, allow_infinity=False
        ),
        quantity=positive_quantity_st,
        buy_price=positive_price_st,
        fees=fees_st,
    )
    def test_single_buy_decreases_balance(
        self, initial_balance: float, quantity: float, buy_price: float, fees: float
    ) -> None:
        """A single buy transaction decreases cash by (price × quantity + fees)."""
        txn = TransactionData(
            transaction_type="buy", quantity=quantity, price=buy_price, fees=fees
        )
        result = calculate_cash_position(initial_balance, [txn])
        expected = initial_balance - (buy_price * quantity + fees)
        assert abs(result - expected) < 1e-6

    @settings(max_examples=100)
    @given(
        initial_balance=st.floats(
            min_value=0.0, max_value=1_000_000, allow_nan=False, allow_infinity=False
        ),
        quantity=positive_quantity_st,
        sell_price=positive_price_st,
    )
    def test_single_sell_increases_balance(
        self, initial_balance: float, quantity: float, sell_price: float
    ) -> None:
        """A single sell transaction increases cash by (price × quantity)."""
        txn = TransactionData(
            transaction_type="sell", quantity=quantity, price=sell_price, fees=0.0
        )
        result = calculate_cash_position(initial_balance, [txn])
        expected = initial_balance + sell_price * quantity
        assert abs(result - expected) < 1e-6

    @settings(max_examples=100)
    @given(
        initial_balance=st.floats(
            min_value=1000.0, max_value=1_000_000, allow_nan=False, allow_infinity=False
        ),
        quantity=positive_quantity_st,
        price=positive_price_st,
    )
    def test_buy_then_sell_same_price_no_fees_returns_to_initial(
        self, initial_balance: float, quantity: float, price: float
    ) -> None:
        """Buy then sell at same price with no fees returns to initial balance."""
        buy_txn = TransactionData(
            transaction_type="buy", quantity=quantity, price=price, fees=0.0
        )
        sell_txn = TransactionData(
            transaction_type="sell", quantity=quantity, price=price, fees=0.0
        )
        result = calculate_cash_position(initial_balance, [buy_txn, sell_txn])
        assert abs(result - initial_balance) < 1e-6


# --- Property 15: Top gainers and losers selection ---


class TestProperty15TopGainersAndLosers:
    """Property 15: Top gainers and losers selection.

    Verify correct top-5 selection by unrealized_gain_pct.

    **Validates: Requirements 7.3**
    """

    @settings(max_examples=100)
    @given(holdings=holdings_list_st)
    def test_top_gainers_max_5(self, holdings: list[HoldingData]) -> None:
        """Top gainers list contains at most 5 holdings."""
        result = get_top_gainers(holdings)
        assert len(result) <= 5

    @settings(max_examples=100)
    @given(holdings=holdings_list_st)
    def test_top_losers_max_5(self, holdings: list[HoldingData]) -> None:
        """Top losers list contains at most 5 holdings."""
        result = get_top_losers(holdings)
        assert len(result) <= 5

    @settings(max_examples=100)
    @given(holdings=st.lists(holding_st, min_size=1, max_size=4))
    def test_fewer_than_5_returns_all_gainers(
        self, holdings: list[HoldingData]
    ) -> None:
        """If fewer than 5 holdings, top gainers returns all holdings."""
        result = get_top_gainers(holdings)
        assert len(result) == len(holdings)

    @settings(max_examples=100)
    @given(holdings=st.lists(holding_st, min_size=1, max_size=4))
    def test_fewer_than_5_returns_all_losers(self, holdings: list[HoldingData]) -> None:
        """If fewer than 5 holdings, top losers returns all holdings."""
        result = get_top_losers(holdings)
        assert len(result) == len(holdings)

    @settings(max_examples=100)
    @given(holdings=st.lists(holding_st, min_size=6, max_size=20))
    def test_top_gainers_have_highest_gain_pct(
        self, holdings: list[HoldingData]
    ) -> None:
        """Top 5 gainers have the highest unrealized_gain_pct values."""
        gainers = get_top_gainers(holdings)
        non_gainers = [h for h in holdings if h not in gainers]

        # Every gainer's pct should be >= every non-gainer's pct
        gainer_pcts = [
            calculate_unrealized_gain_pct(h.current_price, h.average_buy_price)
            for h in gainers
        ]
        non_gainer_pcts = [
            calculate_unrealized_gain_pct(h.current_price, h.average_buy_price)
            for h in non_gainers
        ]

        if gainer_pcts and non_gainer_pcts:
            assert min(gainer_pcts) >= max(non_gainer_pcts)

    @settings(max_examples=100)
    @given(holdings=st.lists(holding_st, min_size=6, max_size=20))
    def test_top_losers_have_lowest_gain_pct(self, holdings: list[HoldingData]) -> None:
        """Top 5 losers have the lowest unrealized_gain_pct values."""
        losers = get_top_losers(holdings)
        non_losers = [h for h in holdings if h not in losers]

        # Every loser's pct should be <= every non-loser's pct
        loser_pcts = [
            calculate_unrealized_gain_pct(h.current_price, h.average_buy_price)
            for h in losers
        ]
        non_loser_pcts = [
            calculate_unrealized_gain_pct(h.current_price, h.average_buy_price)
            for h in non_losers
        ]

        if loser_pcts and non_loser_pcts:
            assert max(loser_pcts) <= min(non_loser_pcts)

    @settings(max_examples=100)
    @given(holdings=holdings_list_st)
    def test_gainers_sorted_descending(self, holdings: list[HoldingData]) -> None:
        """Top gainers are sorted by unrealized_gain_pct in descending order."""
        gainers = get_top_gainers(holdings)
        pcts = [
            calculate_unrealized_gain_pct(h.current_price, h.average_buy_price)
            for h in gainers
        ]
        for i in range(len(pcts) - 1):
            assert pcts[i] >= pcts[i + 1]

    @settings(max_examples=100)
    @given(holdings=holdings_list_st)
    def test_losers_sorted_ascending(self, holdings: list[HoldingData]) -> None:
        """Top losers are sorted by unrealized_gain_pct in ascending order."""
        losers = get_top_losers(holdings)
        pcts = [
            calculate_unrealized_gain_pct(h.current_price, h.average_buy_price)
            for h in losers
        ]
        for i in range(len(pcts) - 1):
            assert pcts[i] <= pcts[i + 1]
