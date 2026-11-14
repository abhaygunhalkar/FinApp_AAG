"""Service layer for dashboard summary, activity feed, and portfolio history."""

from collections import defaultdict
from concurrent.futures import ThreadPoolExecutor
from datetime import date, datetime, timedelta

from sqlalchemy.orm import Session

from app.models.holding import Holding
from app.models.price_history import PriceHistory
from app.repositories.cash_balance_repository import CashBalanceRepository
from app.repositories.holdings_repository import HoldingsRepository
from app.repositories.price_history_repository import PriceHistoryRepository
from app.repositories.transaction_repository import TransactionRepository
from app.repositories.watchlist_repository import WatchlistRepository
from app.schemas.dashboard import (
    ActivityEvent,
    BrokerSummary,
    DashboardSummary,
    IntradayPoint,
    IntradaySeries,
    PortfolioSnapshot,
)
from app.services.lot_service import LotService
from app.services.market_data_service import MarketDataService

# Days of history before the chart's range used to price its first days.
HISTORY_LOOKBACK_DAYS = 14


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
        holdings = HoldingsRepository.get_all(db)

        # Calculate portfolio value metrics
        total_portfolio_value = sum(h.current_price * h.quantity for h in holdings)
        total_invested = sum(h.average_buy_price * h.quantity for h in holdings)
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

        etf_holdings = HoldingsRepository.get_all_by_type(db, "etf")
        etf_unrealized_gain = sum(
            (h.current_price - h.average_buy_price) * h.quantity for h in etf_holdings
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
    def get_broker_summary(db: Session) -> list[BrokerSummary]:
        """Aggregate market value by brokerage account across all holdings.

        Holdings without a broker set are grouped under "Unassigned".
        Sorted by market_value descending.
        """
        holdings = HoldingsRepository.get_all(db)

        totals: dict[str, dict[str, float]] = defaultdict(
            lambda: {"market_value": 0.0, "total_invested": 0.0, "holding_count": 0.0}
        )
        for h in holdings:
            broker = h.broker or "Unassigned"
            totals[broker]["market_value"] += h.current_price * h.quantity
            totals[broker]["total_invested"] += h.average_buy_price * h.quantity
            totals[broker]["holding_count"] += 1

        summaries = [
            BrokerSummary(
                broker=broker,
                market_value=values["market_value"],
                total_invested=values["total_invested"],
                unrealized_gain=values["market_value"] - values["total_invested"],
                holding_count=int(values["holding_count"]),
            )
            for broker, values in totals.items()
        ]
        summaries.sort(key=lambda s: s.market_value, reverse=True)
        return summaries

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
                sold = HoldingsRepository.get_by_ticker(db, txn.ticker)
                avg_buy_price = sold.average_buy_price if sold else 0.0
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
    def get_portfolio_history(db: Session, days: int = 30) -> list[PortfolioSnapshot]:
        """Daily value of today's holdings over the last `days` days, from
        price_history closes, with today's live value as the last point.

        A ticker held at several brokers counts its total quantity. A day with
        no saved price for a ticker (the refresh job didn't run, or the quote
        failed) uses its last earlier close, so a gap doesn't look like a drop.
        Empty when there is no saved history in the range.
        """
        holdings = HoldingsRepository.get_all(db)
        if not holdings:
            return []

        quantities: defaultdict[str, float] = defaultdict(float)
        for h in holdings:
            quantities[h.ticker] += h.quantity
        current_prices = {h.ticker: h.current_price for h in holdings}

        today = date.today()
        cutoff = today - timedelta(days=days)
        # Earlier closes seed each ticker's price on the first days of the range.
        closes: dict[str, list[tuple[date, float]]] = {
            ticker: [
                (r.date, r.close_price)
                for r in PriceHistoryRepository.get_history(
                    db, ticker, days + HISTORY_LOOKBACK_DAYS
                )
            ]
            for ticker in quantities
        }
        dates = sorted(
            {d for series in closes.values() for d, _ in series if cutoff <= d < today}
        )
        if not dates:
            return []

        totals = [0.0] * len(dates)
        for ticker, quantity in quantities.items():
            series = closes[ticker]
            # Before its first saved close, a ticker is valued at that close
            # (or today's price if it has none), not left out.
            price = series[0][1] if series else current_prices[ticker]
            i = 0
            for n, d in enumerate(dates):
                while i < len(series) and series[i][0] <= d:
                    price = series[i][1]
                    i += 1
                totals[n] += price * quantity

        snapshots = [
            PortfolioSnapshot(date=d, total_value=total)
            for d, total in zip(dates, totals, strict=True)
        ]
        live = sum(h.current_price * h.quantity for h in holdings)
        snapshots.append(PortfolioSnapshot(date=today, total_value=live))
        return snapshots

    @staticmethod
    def get_intraday(db: Session, today: date | None = None) -> IntradaySeries:
        """Portfolio value at each 5-minute bar of the latest trading session.

        The session is today's when the market has traded today, else the last
        trading day. A ticker is valued at its previous close until its first bar
        of the session, and at its current price if yfinance has no bars for it.
        """
        holdings = HoldingsRepository.get_all(db)
        quantities: dict[str, float] = defaultdict(float)
        fallback: dict[str, float] = {}
        for h in holdings:
            quantities[h.ticker] += h.quantity
            fallback[h.ticker] = h.current_price
        empty = IntradaySeries(session_date=None, is_today=False, points=[])
        if not quantities:
            return empty

        tickers = list(quantities)
        with ThreadPoolExecutor(max_workers=8) as pool:
            bars = dict(
                zip(
                    tickers,
                    pool.map(MarketDataService.fetch_intraday_closes, tickers),
                    strict=True,
                )
            )

        last_bars = [series[-1][0] for series in bars.values() if series]
        if not last_bars:
            return empty
        latest = max(last_bars)
        session = latest.date()
        times = sorted(
            {t for series in bars.values() for t, _ in series if t.date() == session}
        )

        values = [0.0] * len(times)
        for ticker, qty in quantities.items():
            series = bars[ticker]
            if not series:
                for i in range(len(times)):
                    values[i] += fallback[ticker] * qty
                continue
            before = [c for t, c in series if t.date() < session]
            during = [(t, c) for t, c in series if t.date() == session]
            price = (
                before[-1] if before else (during[0][1] if during else series[-1][1])
            )
            j = 0
            for i, t in enumerate(times):
                while j < len(during) and during[j][0] <= t:
                    price = during[j][1]
                    j += 1
                values[i] += price * qty

        # "Today" in the market's own time zone, which the bars carry.
        market_today = today or datetime.now(latest.tzinfo).date()
        return IntradaySeries(
            session_date=session,
            is_today=session == market_today,
            points=[
                IntradayPoint(time=t, value=v)
                for t, v in zip(times, values, strict=True)
            ],
        )

    @staticmethod
    def _calculate_realized_gain(db: Session) -> float:
        """Calculate total realized gain from all sell transactions.

        For each sell transaction, realized_gain = (sell_price - cost_basis) * qty.
        Cost basis is the average price of the buy lots the sell took its
        shares from.
        """
        all_transactions = TransactionRepository.get_all_ordered(db)
        cost_basis = LotService.cost_basis_by_sell(db)
        total_realized = 0.0

        for txn in all_transactions:
            if txn.transaction_type != "sell":
                continue
            avg_cost = cost_basis.get(txn.id)
            if avg_cost is None:
                # No recorded lots: fall back to the holding if it still exists
                holding = HoldingsRepository.get_by_ticker(db, txn.ticker)
                avg_cost = holding.average_buy_price if holding else 0.0

            realized = (txn.price - avg_cost) * txn.quantity
            total_realized += realized

        return round(total_realized, 2)

    @staticmethod
    def _calculate_daily_change(db: Session, holdings: list[Holding]) -> float:
        """Calculate daily change using previous close from price_history.

        daily_change = sum((current_price - previous_close) * quantity)
        Uses 0 if previous_close is unavailable for a holding.
        """
        daily_change = 0.0

        for holding in holdings:
            previous_close = DashboardService._get_previous_close(db, holding.ticker)
            if previous_close is not None:
                daily_change += (
                    holding.current_price - previous_close
                ) * holding.quantity

        return daily_change

    @staticmethod
    def _get_previous_close(db: Session, ticker: str) -> float | None:
        """Get the most recent previous close price for a ticker.

        Uses open_price from the latest price_history record, which stores
        the regular-market previous close — the actual prior session close. Avoids
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
        record = db.query(PriceHistory).order_by(PriceHistory.fetched_at.desc()).first()
        return record.fetched_at if record else None
