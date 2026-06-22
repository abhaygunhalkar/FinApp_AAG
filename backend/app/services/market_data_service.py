"""Market data service for fetching stock prices via yfinance."""

import logging
import math
import time
from dataclasses import dataclass
from datetime import date
from typing import Any

import yfinance as yf
from sqlalchemy.orm import Session

from app.models.price_history import PriceHistory
from app.repositories.holdings_repository import HoldingsRepository
from app.repositories.price_history_repository import PriceHistoryRepository
from app.repositories.watchlist_repository import WatchlistRepository
from app.schemas.market import MarketQuote, PricePoint

logger = logging.getLogger(__name__)

MAX_RETRIES = 3
RETRY_DELAY_SECONDS = 5
RSI_PERIOD = 14


def _safe_positive_float(value: Any) -> float | None:
    """Coerce a yfinance cell to a float, treating NaN/None/<=0 as missing."""
    try:
        result = float(value)
    except (TypeError, ValueError):
        return None
    if math.isnan(result) or result <= 0:
        return None
    return result


def calculate_rsi(closes: list[float], period: int = RSI_PERIOD) -> float | None:
    """Calculate RSI (Relative Strength Index) using the standard Wilder smoothing method.

    Args:
        closes: List of closing prices (oldest first).
        period: RSI period (default 14).

    Returns:
        RSI value (0-100) or None if insufficient data.
    """
    if len(closes) < period + 1:
        return None

    # Calculate price changes
    deltas = [closes[i] - closes[i - 1] for i in range(1, len(closes))]

    # Initial average gain/loss (simple average of first `period` changes)
    gains = [d if d > 0 else 0.0 for d in deltas[:period]]
    losses = [-d if d < 0 else 0.0 for d in deltas[:period]]

    avg_gain = sum(gains) / period
    avg_loss = sum(losses) / period

    # Wilder smoothing for remaining periods
    for i in range(period, len(deltas)):
        change = deltas[i]
        gain = change if change > 0 else 0.0
        loss = -change if change < 0 else 0.0

        avg_gain = (avg_gain * (period - 1) + gain) / period
        avg_loss = (avg_loss * (period - 1) + loss) / period

    if avg_loss == 0:
        return 100.0

    rs = avg_gain / avg_loss
    rsi = 100.0 - (100.0 / (1.0 + rs))
    return round(rsi, 2)

HISTORY_RETENTION_DAYS = 365


@dataclass
class RefreshResult:
    """Result of a bulk price refresh operation."""

    success_count: int
    failure_count: int
    tickers_updated: list[str]
    tickers_failed: list[str]


class MarketDataService:
    """Service for fetching and managing market data via yfinance."""

    @staticmethod
    def fetch_quote(ticker: str) -> MarketQuote | None:
        """Fetch current quote data for a ticker from yfinance.

        Retries up to 3 times with a 5-second delay on failure.
        Validates that currentPrice is present and numeric.
        Returns None if data is invalid after all retries.
        """
        last_exception: Exception | None = None

        for attempt in range(1, MAX_RETRIES + 1):
            try:
                stock = yf.Ticker(ticker)
                info = stock.info

                # Validate currentPrice is present and numeric
                current_price = info.get("currentPrice")
                if current_price is None:
                    # Try regularMarketPrice as fallback
                    current_price = info.get("regularMarketPrice")

                if current_price is None or not isinstance(
                    current_price, (int, float)
                ):
                    logger.warning(
                        "Invalid or missing currentPrice for ticker '%s': %s",
                        ticker,
                        current_price,
                    )
                    return None

                previous_close = info.get("previousClose", 0.0)
                if not isinstance(previous_close, (int, float)):
                    previous_close = 0.0

                daily_change = float(current_price) - float(previous_close)
                daily_change_pct = (
                    (daily_change / float(previous_close) * 100)
                    if previous_close
                    else 0.0
                )

                week_52_high = info.get("fiftyTwoWeekHigh", 0.0)
                if not isinstance(week_52_high, (int, float)):
                    week_52_high = 0.0

                week_52_low = info.get("fiftyTwoWeekLow", 0.0)
                if not isinstance(week_52_low, (int, float)):
                    week_52_low = 0.0

                market_cap = info.get("marketCap")
                if market_cap is not None and not isinstance(
                    market_cap, (int, float)
                ):
                    market_cap = None

                pe_ratio = info.get("trailingPE")
                if pe_ratio is not None and not isinstance(pe_ratio, (int, float)):
                    pe_ratio = None

                dividend_yield_raw = info.get("dividendYield", 0.0)
                if not isinstance(dividend_yield_raw, (int, float)):
                    dividend_yield_raw = 0.0
                dividend_yield = float(dividend_yield_raw)

                analyst_rating = info.get("recommendationKey")
                if analyst_rating is not None and not isinstance(
                    analyst_rating, str
                ):
                    analyst_rating = None

                return MarketQuote(
                    ticker=ticker,
                    current_price=float(current_price),
                    previous_close=float(previous_close),
                    daily_change=round(daily_change, 4),
                    daily_change_pct=round(daily_change_pct, 4),
                    week_52_high=float(week_52_high),
                    week_52_low=float(week_52_low),
                    market_cap=float(market_cap) if market_cap is not None else None,
                    pe_ratio=float(pe_ratio) if pe_ratio is not None else None,
                    dividend_yield=dividend_yield,
                    analyst_rating=analyst_rating,
                )

            except Exception as exc:
                last_exception = exc
                logger.warning(
                    "Attempt %d/%d failed for ticker '%s': %s",
                    attempt,
                    MAX_RETRIES,
                    ticker,
                    exc,
                )
                if attempt < MAX_RETRIES:
                    time.sleep(RETRY_DELAY_SECONDS)

        logger.error(
            "All %d attempts failed for ticker '%s'. Last error: %s",
            MAX_RETRIES,
            ticker,
            last_exception,
        )
        return None

    @staticmethod
    def fetch_history(ticker: str, period: str) -> list[PricePoint]:
        """Fetch historical price data for a ticker from yfinance.

        Args:
            ticker: Stock ticker symbol.
            period: Time period - one of "7d", "30d", "90d", "1y".

        Returns:
            List of PricePoint objects ordered by date ascending.
        """
        valid_periods = {"7d", "30d", "90d", "1y"}
        if period not in valid_periods:
            logger.warning(
                "Invalid period '%s' for ticker '%s'. Must be one of %s",
                period,
                ticker,
                valid_periods,
            )
            return []

        # Map our periods to yfinance periods
        yf_period_map = {
            "7d": "7d",
            "30d": "1mo",
            "90d": "3mo",
            "1y": "1y",
        }

        try:
            stock = yf.Ticker(ticker)
            hist = stock.history(period=yf_period_map[period])

            price_points: list[PricePoint] = []
            for idx, row in hist.iterrows():
                price_points.append(
                    PricePoint(
                        date=idx.date(),  # type: ignore[union-attr]
                        open=float(row["Open"]),
                        close=float(row["Close"]),
                        high=float(row["High"]),
                        low=float(row["Low"]),
                        volume=float(row["Volume"]),
                    )
                )

            return price_points

        except Exception as exc:
            logger.error(
                "Failed to fetch history for ticker '%s' with period '%s': %s",
                ticker,
                period,
                exc,
            )
            return []

    @staticmethod
    def fetch_rsi(ticker: str) -> tuple[float | None, float | None]:
        """Fetch RSI (14-period) for daily and weekly timeframes.

        Returns:
            Tuple of (rsi_daily, rsi_weekly). Either can be None if data is insufficient.
        """
        rsi_daily: float | None = None
        rsi_weekly: float | None = None

        try:
            stock = yf.Ticker(ticker)

            # Daily RSI: use 15 days of daily closes to calculate a 14-period RSI
            daily_hist = stock.history(period="15d", interval="1d")
            if daily_hist is not None and len(daily_hist) >= RSI_PERIOD + 1:
                daily_closes = daily_hist["Close"].tolist()
                rsi_daily = calculate_rsi(daily_closes, RSI_PERIOD)

            # Weekly RSI: need ~6 months of weekly data for 14-period RSI
            weekly_hist = stock.history(period="6mo", interval="1wk")
            if weekly_hist is not None and len(weekly_hist) >= RSI_PERIOD + 1:
                weekly_closes = weekly_hist["Close"].tolist()
                rsi_weekly = calculate_rsi(weekly_closes, RSI_PERIOD)

        except Exception as exc:
            logger.warning(
                "Failed to calculate RSI for ticker '%s': %s", ticker, exc
            )

        return rsi_daily, rsi_weekly

    @staticmethod
    def refresh_all_prices(db: Session) -> RefreshResult:
        """Refresh prices for all tickers in holdings and watchlist.

        For each ticker:
        - Fetch current quote
        - Update current_price on holdings and watchlist items
        - Store price in price_history table

        After processing all tickers:
        - Delete price_history records older than 365 days

        Returns a RefreshResult with success/failure counts.
        """
        # Collect all unique tickers from holdings and watchlist
        holdings = HoldingsRepository.get_all(db)
        watchlist_items = WatchlistRepository.get_all(db)

        tickers: set[str] = set()
        for holding in holdings:
            tickers.add(holding.ticker)
        for item in watchlist_items:
            tickers.add(item.ticker)

        success_count = 0
        failure_count = 0
        tickers_updated: list[str] = []
        tickers_failed: list[str] = []

        for ticker in tickers:
            try:
                quote = MarketDataService.fetch_quote(ticker)
                if quote is None:
                    failure_count += 1
                    tickers_failed.append(ticker)
                    logger.warning(
                        "Skipping price update for ticker '%s': invalid data",
                        ticker,
                    )
                    continue

                # Update current_price on holdings
                holding = HoldingsRepository.get_by_ticker(db, ticker)
                if holding is not None:
                    holding.current_price = quote.current_price
                    holding.dividend_yield = quote.dividend_yield
                    db.add(holding)

                # Update current_price on watchlist items
                watchlist_item = WatchlistRepository.get_by_ticker(db, ticker)
                if watchlist_item is not None:
                    watchlist_item.current_price = quote.current_price
                    db.add(watchlist_item)

                # Commit holding/watchlist price updates first
                db.commit()

                # Store price in price_history (separate try to not block price updates)
                try:
                    existing_record = (
                        db.query(PriceHistory)
                        .filter(
                            PriceHistory.ticker == ticker,
                            PriceHistory.date == date.today(),
                        )
                        .first()
                    )
                    if existing_record:
                        existing_record.close_price = quote.current_price
                        existing_record.open_price = quote.previous_close
                        existing_record.high_price = quote.week_52_high
                        existing_record.low_price = quote.week_52_low
                    else:
                        price_record = PriceHistory(
                            ticker=ticker,
                            close_price=quote.current_price,
                            open_price=quote.previous_close,
                            high_price=quote.week_52_high,
                            low_price=quote.week_52_low,
                            volume=0.0,
                            date=date.today(),
                        )
                        db.add(price_record)
                    db.commit()
                except Exception:
                    db.rollback()  # Non-critical, price update already committed

                success_count += 1
                tickers_updated.append(ticker)

            except Exception as exc:
                db.rollback()
                failure_count += 1
                tickers_failed.append(ticker)
                logger.error(
                    "Failed to refresh price for ticker '%s': %s",
                    ticker,
                    exc,
                )

        # Delete price_history records older than 365 days
        try:
            deleted_count = PriceHistoryRepository.delete_older_than(
                db, HISTORY_RETENTION_DAYS
            )
            if deleted_count > 0:
                logger.info(
                    "Deleted %d price history records older than %d days",
                    deleted_count,
                    HISTORY_RETENTION_DAYS,
                )
        except Exception as exc:
            logger.error("Failed to clean up old price history records: %s", exc)

        return RefreshResult(
            success_count=success_count,
            failure_count=failure_count,
            tickers_updated=tickers_updated,
            tickers_failed=tickers_failed,
        )

    @staticmethod
    def fetch_option_chain(ticker: str, expiry: date) -> tuple[Any, Any] | None:
        """Fetch the full option chain (calls, puts) for a ticker/expiry from yfinance.

        Returns None if the expiry isn't a real listed expiration for this
        ticker or the request otherwise fails.
        """
        try:
            stock = yf.Ticker(ticker)
            chain = stock.option_chain(expiry.isoformat())
            return chain.calls, chain.puts
        except Exception as exc:
            logger.warning(
                "Failed to fetch option chain for '%s' expiring %s: %s",
                ticker,
                expiry,
                exc,
            )
            return None

    @staticmethod
    def extract_option_quote(chain_side: Any, strike: float) -> dict[str, float | None] | None:
        """Find the row matching `strike` in a calls/puts DataFrame and extract
        bid/ask/lastPrice, plus a current_price (bid/ask midpoint, falling back
        to lastPrice when there's no two-sided market).

        Returns None if no contract at that strike is found.
        """
        matches = chain_side[(chain_side["strike"] - strike).abs() < 0.01]
        if matches.empty:
            return None
        row = matches.iloc[0]

        bid = _safe_positive_float(row.get("bid"))
        ask = _safe_positive_float(row.get("ask"))
        last_price = _safe_positive_float(row.get("lastPrice"))
        current_price = round((bid + ask) / 2, 4) if bid is not None and ask is not None else last_price

        return {
            "bid": bid,
            "ask": ask,
            "last_price": last_price,
            "current_price": current_price,
        }

    @staticmethod
    def get_cached_price(db: Session, ticker: str) -> float | None:
        """Get the most recently cached price for a ticker.

        Returns the close_price from the most recent price_history record,
        or None if no history exists.
        """
        history = PriceHistoryRepository.get_history(db, ticker, days=1)
        if history:
            return history[-1].close_price
        # Try broader range if no recent data
        history = PriceHistoryRepository.get_history(db, ticker, days=365)
        if history:
            return history[-1].close_price
        return None
