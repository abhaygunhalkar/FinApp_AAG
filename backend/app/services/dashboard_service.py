"""Service layer for dashboard summary, activity feed, and portfolio history."""

from collections import defaultdict
from datetime import date, datetime, timedelta

from sqlalchemy.orm import Session

from app.config import get_settings
from app.models.holding import Holding
from app.models.price_history import PriceHistory
from app.models.transaction import Transaction
from app.models.watchlist_item import WatchlistItem
from app.repositories.cash_balance_repository import CashBalanceRepository
from app.repositories.holdings_repository import HoldingsRepository
from app.repositories.price_history_repository import PriceHistoryRepository
from app.repositories.transaction_repository import TransactionRepository
from app.repositories.watchlist_repository import WatchlistRepository
from app.schemas.dashboard import ActivityEvent, DashboardSummary, PortfolioSnapshot


class DashboardService:
    """Business logic for dashboard metrics, activity feed, and portfolio history."""

    @staticmethod
    def get_summary(db: Session) -> DashboardSummary:
        """Calculate aggregate portfolio metrics for the dashboard.

        Computes:
        - total_portfolio_value: sum of (current_price * quantity) for all holdings
        - total_invested: sum of (average_buy_price * quantity) for all holdings
        - unrealized_gain: total_portfolio_value - total_invested
        - realized_gain: sum of realized gains from sell transactions
        - daily_change: sum of ((current_price - previous_close) * quantity)
        - annual_dividend_income: sum of (dividend_yield * current_price * quantity)
        - cash_position: current cash balance
        - number_of_holdings: count of holdings
        - stale_data: True if any holding price hasn't updated in > 2x refresh interval
        - last_successful_fetch: most recent price_history.fetched_at
        """
        settings = get_settings()
        holdings = HoldingsRepository.get_all(db)

        # Calculate portfolio value metrics
        total_portfolio_value = sum(
            h.current_price * h.quantity for h in holdings
        )
        total_invested = sum(
            h.average_buy_price * h.quantity for h in holdings
        )
        unrealized_gain = total_portfolio_value - total_invested

        # Calculate realized gain from sell transactions
        realized_gain = DashboardService._calculate_realized_gain(db)

        # Calculate daily change using previous close from price_history
        daily_change = DashboardService._calculate_daily_change(db, holdings)

        # Calculate annual dividend income (cap yield at 20% to match holdings page)
        annual_dividend_income = sum(
            min(h.dividend_yield or 0.0, 0.20) * h.current_price * h.quantity
            for h in holdings
        )

        # Get cash position
        cash_balance = CashBalanceRepository.get_balance(db)
        cash_position = cash_balance.balance

        # Determine stale data and last successful fetch
        stale_data = False
        last_successful_fetch = DashboardService._get_last_successful_fetch(db)

        if holdings and last_successful_fetch:
            # Only show stale warning if data is older than 24 hours
            stale_threshold = timedelta(hours=24)
            time_since_fetch = datetime.now() - last_successful_fetch
            if time_since_fetch > stale_threshold:
                stale_data = True

        etf_holdings = HoldingsRepository.get_all_by_type(db, 'etf')
        etf_unrealized_gain = sum(
            (h.current_price - h.average_buy_price) * h.quantity
            for h in etf_holdings
        )

        return DashboardSummary(
            total_portfolio_value=total_portfolio_value,
            total_invested=total_invested,
            unrealized_gain=unrealized_gain,
            etf_unrealized_gain=etf_unrealized_gain,
            realized_gain=realized_gain,
            daily_change=daily_change,
            annual_dividend_income=annual_dividend_income,
            cash_position=cash_position,
            number_of_holdings=len(holdings),
            stale_data=stale_data,
            last_successful_fetch=last_successful_fetch,
        )

    @staticmethod
    def get_activity_feed(db: Session, limit: int = 20) -> list[ActivityEvent]:
        """Build activity feed from holdings, transactions, and watchlist events.

        Collects events from:
        - Holdings: event_type="holding_added", timestamp=created_at
        - Transactions (sells): event_type="stock_sold", timestamp=transaction_date
        - Watchlist: event_type="watchlist_added", timestamp=created_at
        - Holdings/Watchlist notes updates: event_type="notes_updated",
          timestamp=updated_at

        Returns events sorted by timestamp descending, limited to `limit` items.
        """
        events: list[ActivityEvent] = []

        # Holding added events
        holdings = HoldingsRepository.get_all(db)
        for holding in holdings:
            events.append(
                ActivityEvent(
                    event_type="holding_added",
                    ticker=holding.ticker,
                    details={
                        "company_name": holding.company_name,
                        "quantity": holding.quantity,
                        "buy_price": holding.average_buy_price,
                    },
                    timestamp=holding.created_at,
                )
            )

        # Stock sold events from sell transactions
        all_transactions = TransactionRepository.get_all_ordered(db)
        for txn in all_transactions:
            if txn.transaction_type == "sell":
                # Calculate realized gain for this sell
                holding = HoldingsRepository.get_by_ticker(db, txn.ticker)
                avg_buy_price = holding.average_buy_price if holding else 0.0
                realized_gain = (txn.price - avg_buy_price) * txn.quantity

                events.append(
                    ActivityEvent(
                        event_type="stock_sold",
                        ticker=txn.ticker,
                        details={
                            "quantity": txn.quantity,
                            "sell_price": txn.price,
                            "realized_gain": realized_gain,
                        },
                        timestamp=datetime.combine(
                            txn.transaction_date, datetime.min.time()
                        ),
                    )
                )

        # Watchlist added events
        watchlist_items = WatchlistRepository.get_all(db)
        for item in watchlist_items:
            events.append(
                ActivityEvent(
                    event_type="watchlist_added",
                    ticker=item.ticker,
                    details={},
                    timestamp=item.created_at,
                )
            )

        # Notes updated events (holdings with notes that have been updated)
        for holding in holdings:
            if holding.notes and holding.updated_at != holding.created_at:
                events.append(
                    ActivityEvent(
                        event_type="notes_updated",
                        ticker=holding.ticker,
                        details={},
                        timestamp=holding.updated_at,
                    )
                )

        # Notes updated events (watchlist items with notes that have been updated)
        for item in watchlist_items:
            if item.notes and item.updated_at != item.created_at:
                events.append(
                    ActivityEvent(
                        event_type="notes_updated",
                        ticker=item.ticker,
                        details={},
                        timestamp=item.updated_at,
                    )
                )

        # Sort by timestamp descending and limit
        events.sort(key=lambda e: e.timestamp, reverse=True)
        return events[:limit]

    @staticmethod
    def get_portfolio_history(
        db: Session, days: int = 30
    ) -> list[PortfolioSnapshot]:
        """Build portfolio history from price_history data.

        For each date in the range, sums (close_price * quantity) across all
        holdings to produce a daily total portfolio value snapshot.
        Always includes today's live portfolio value as the latest data point.

        Args:
            db: Database session.
            days: Number of days of history to return (default 30).

        Returns:
            List of PortfolioSnapshot ordered by date ascending.
        """
        holdings = HoldingsRepository.get_all(db)
        if not holdings:
            return []

        # Build a map of ticker -> quantity for current holdings
        ticker_quantities: dict[str, float] = {
            h.ticker: h.quantity for h in holdings
        }

        # Collect price history for all tickers
        daily_values: defaultdict[date, float] = defaultdict(float)

        for ticker, quantity in ticker_quantities.items():
            history = PriceHistoryRepository.get_history(db, ticker, days)
            for record in history:
                daily_values[record.date] += record.close_price * quantity

        # Always include today's live portfolio value from current_price
        today = date.today()
        today_value = sum(h.current_price * h.quantity for h in holdings)
        daily_values[today] = today_value

        # Sort by date and return snapshots
        sorted_dates = sorted(daily_values.keys())
        return [
            PortfolioSnapshot(date=d, total_value=daily_values[d])
            for d in sorted_dates
        ]

    @staticmethod
    def _consume_fifo_cost_basis(
        buys: list[tuple[float, float]], quantity: float
    ) -> float:
        """Consume buy lots in FIFO order and return the sell cost basis."""
        remaining = quantity
        total_cost = 0.0
        consumed = 0.0

        while remaining > 0 and buys:
            lot_qty, lot_price = buys[0]
            if lot_qty <= remaining:
                total_cost += lot_qty * lot_price
                consumed += lot_qty
                remaining -= lot_qty
                buys.pop(0)
            else:
                total_cost += remaining * lot_price
                consumed += remaining
                buys[0] = (lot_qty - remaining, lot_price)
                remaining = 0.0

        return total_cost / consumed if consumed > 0 else 0.0

    @staticmethod
    def _calculate_realized_gain(db: Session) -> float:
        """Calculate total realized gain from all sell transactions.

        For each sell transaction, realized_gain = (sell_price - cost_basis) * qty.
        Cost basis is computed using FIFO matching of prior buy lots.
        """
        all_transactions = TransactionRepository.get_all_ordered(db)
        total_realized = 0.0

        # Group buy transactions by ticker to compute cost basis
        buy_history: dict[str, list[tuple[float, float]]] = {}  # ticker -> [(qty, price)]

        # Process in chronological order (oldest first)
        sorted_txns = sorted(all_transactions, key=lambda t: t.transaction_date)

        for txn in sorted_txns:
            if txn.transaction_type == "buy":
                if txn.ticker not in buy_history:
                    buy_history[txn.ticker] = []
                buy_history[txn.ticker].append((txn.quantity, txn.price))
            elif txn.transaction_type == "sell":
                buys = buy_history.get(txn.ticker, [])
                if buys:
                    avg_cost = DashboardService._consume_fifo_cost_basis(
                        buys, txn.quantity
                    )
                else:
                    # Fallback: try to get from holding if it still exists
                    holding = HoldingsRepository.get_by_ticker(db, txn.ticker)
                    avg_cost = holding.average_buy_price if holding else 0.0

                realized = (txn.price - avg_cost) * txn.quantity
                total_realized += realized

        return round(total_realized, 2)

    @staticmethod
    def _calculate_daily_change(
        db: Session, holdings: list[Holding]
    ) -> float:
        """Calculate daily change using previous close from price_history.

        daily_change = sum((current_price - previous_close) * quantity)
        Uses 0 if previous_close is unavailable for a holding.
        """
        daily_change = 0.0

        for holding in holdings:
            previous_close = DashboardService._get_previous_close(
                db, holding.ticker
            )
            if previous_close is not None:
                daily_change += (
                    holding.current_price - previous_close
                ) * holding.quantity

        return daily_change

    @staticmethod
    def _get_previous_close(db: Session, ticker: str) -> float | None:
        """Get the most recent previous close price for a ticker.

        Uses open_price from the latest price_history record, which stores
        fast_info.previous_close — the actual prior session close. Avoids
        comparing against close_price from the prior record, which can equal
        today's current_price when stock.info returns stale data.
        """
        record = (
            db.query(PriceHistory)
            .filter(PriceHistory.ticker == ticker)
            .order_by(PriceHistory.date.desc())
            .first()
        )
        if record is None:
            return None
        if record.open_price is not None and record.open_price > 0:
            return record.open_price
        return record.close_price

    @staticmethod
    def _get_last_successful_fetch(db: Session) -> datetime | None:
        """Get the most recent fetched_at timestamp from price_history."""
        record = (
            db.query(PriceHistory)
            .order_by(PriceHistory.fetched_at.desc())
            .first()
        )
        return record.fetched_at if record else None
