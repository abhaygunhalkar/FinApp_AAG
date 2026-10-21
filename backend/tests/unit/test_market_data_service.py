"""Unit tests for the MarketDataService."""

from datetime import date, timedelta
from unittest.mock import MagicMock, patch

import pytest
from sqlalchemy.orm import Session

from app.models.holding import Holding
from app.models.price_history import PriceHistory
from app.models.watchlist_item import WatchlistItem
from app.services.market_data_service import (
    HISTORY_RETENTION_DAYS,
    MAX_RETRIES,
    MarketDataService,
    RefreshResult,
)


class TestFetchQuote:
    """Tests for MarketDataService.fetch_quote."""

    @patch("app.services.market_data_service.yf.Ticker")
    def test_fetch_quote_success(self, mock_ticker_cls: MagicMock) -> None:
        """Should return a MarketQuote when yfinance returns valid data."""
        mock_ticker = MagicMock()
        mock_ticker.info = {
            "currentPrice": 150.25,
            "previousClose": 148.50,
            "fiftyTwoWeekHigh": 180.0,
            "fiftyTwoWeekLow": 120.0,
            "marketCap": 2500000000000,
            "trailingPE": 28.5,
            "dividendYield": 0.006,
            "recommendationKey": "buy",
        }
        mock_ticker_cls.return_value = mock_ticker

        result = MarketDataService.fetch_quote("AAPL")

        assert result is not None
        assert result.ticker == "AAPL"
        assert result.current_price == 150.25
        assert result.previous_close == 148.50
        assert result.week_52_high == 180.0
        assert result.week_52_low == 120.0
        assert result.market_cap == 2500000000000
        assert result.pe_ratio == 28.5
        assert result.dividend_yield == 0.006
        assert result.analyst_rating == "buy"

    @patch("app.services.market_data_service.yf.Ticker")
    def test_fetch_quote_prefers_regular_market_previous_close(
        self, mock_ticker_cls: MagicMock
    ) -> None:
        """fast_info.previous_close can be wrong; use the regular-market value."""
        mock_ticker = MagicMock()
        mock_ticker.info = {"currentPrice": 36.045, "previousClose": 37.51}
        mock_ticker.fast_info.previous_close = 37.51
        mock_ticker.fast_info.regular_market_previous_close = 32.47
        mock_ticker_cls.return_value = mock_ticker

        result = MarketDataService.fetch_quote("SMCI")

        assert result is not None
        assert result.previous_close == 32.47
        assert result.daily_change_pct == pytest.approx(11.01, abs=0.01)

    @patch("app.services.market_data_service.yf.Ticker")
    def test_fetch_quote_uses_regular_market_price_fallback(
        self, mock_ticker_cls: MagicMock
    ) -> None:
        """Should use regularMarketPrice when currentPrice is missing."""
        mock_ticker = MagicMock()
        mock_ticker.info = {
            "regularMarketPrice": 145.00,
            "previousClose": 143.00,
            "fiftyTwoWeekHigh": 170.0,
            "fiftyTwoWeekLow": 110.0,
        }
        mock_ticker_cls.return_value = mock_ticker

        result = MarketDataService.fetch_quote("MSFT")

        assert result is not None
        assert result.current_price == 145.00

    @patch("app.services.market_data_service.yf.Ticker")
    def test_fetch_quote_returns_none_when_price_missing(
        self, mock_ticker_cls: MagicMock
    ) -> None:
        """Should return None when both currentPrice and regularMarketPrice are missing."""
        mock_ticker = MagicMock()
        mock_ticker.info = {
            "previousClose": 148.50,
            "fiftyTwoWeekHigh": 180.0,
        }
        mock_ticker_cls.return_value = mock_ticker

        result = MarketDataService.fetch_quote("INVALID")

        assert result is None

    @patch("app.services.market_data_service.yf.Ticker")
    def test_fetch_quote_returns_none_when_price_non_numeric(
        self, mock_ticker_cls: MagicMock
    ) -> None:
        """Should return None when currentPrice is non-numeric."""
        mock_ticker = MagicMock()
        mock_ticker.info = {
            "currentPrice": "not_a_number",
            "regularMarketPrice": "also_not_a_number",
        }
        mock_ticker_cls.return_value = mock_ticker

        result = MarketDataService.fetch_quote("BAD")

        assert result is None

    @patch("app.services.market_data_service.time.sleep")
    @patch("app.services.market_data_service.yf.Ticker")
    def test_fetch_quote_retries_on_exception(
        self, mock_ticker_cls: MagicMock, mock_sleep: MagicMock
    ) -> None:
        """Should retry up to 3 times with 5-second delay on failure."""
        mock_ticker = MagicMock()
        mock_ticker.info.__getitem__ = MagicMock(side_effect=Exception("Network error"))
        # Make .info access raise on first two attempts, succeed on third
        call_count = 0

        def side_effect_info() -> dict:
            nonlocal call_count
            call_count += 1
            if call_count < 3:
                raise Exception("Network error")
            return {
                "currentPrice": 100.0,
                "previousClose": 99.0,
                "fiftyTwoWeekHigh": 110.0,
                "fiftyTwoWeekLow": 80.0,
            }

        type(mock_ticker).info = property(lambda self: side_effect_info())
        mock_ticker_cls.return_value = mock_ticker

        result = MarketDataService.fetch_quote("RETRY")

        assert result is not None
        assert result.current_price == 100.0
        # Should have slept twice (between attempt 1-2 and 2-3)
        assert mock_sleep.call_count == 2

    @patch("app.services.market_data_service.time.sleep")
    @patch("app.services.market_data_service.yf.Ticker")
    def test_fetch_quote_returns_none_after_all_retries_fail(
        self, mock_ticker_cls: MagicMock, mock_sleep: MagicMock
    ) -> None:
        """Should return None after all 3 retry attempts fail."""
        mock_ticker = MagicMock()
        type(mock_ticker).info = property(
            lambda self: (_ for _ in ()).throw(Exception("Persistent failure"))
        )
        mock_ticker_cls.return_value = mock_ticker

        result = MarketDataService.fetch_quote("FAIL")

        assert result is None
        assert mock_sleep.call_count == MAX_RETRIES - 1


class TestFetchHistory:
    """Tests for MarketDataService.fetch_history."""

    @patch("app.services.market_data_service.yf.Ticker")
    def test_fetch_history_success(self, mock_ticker_cls: MagicMock) -> None:
        """Should return a list of PricePoints for valid period."""
        import pandas as pd

        mock_ticker = MagicMock()
        # Create a mock DataFrame with DatetimeIndex
        dates = pd.date_range(start="2024-01-01", periods=5, freq="D")
        data = {
            "Open": [100.0, 101.0, 102.0, 103.0, 104.0],
            "Close": [101.0, 102.0, 103.0, 104.0, 105.0],
            "High": [102.0, 103.0, 104.0, 105.0, 106.0],
            "Low": [99.0, 100.0, 101.0, 102.0, 103.0],
            "Volume": [1000000, 1100000, 1200000, 1300000, 1400000],
        }
        mock_df = pd.DataFrame(data, index=dates)
        mock_ticker.history.return_value = mock_df
        mock_ticker_cls.return_value = mock_ticker

        result = MarketDataService.fetch_history("AAPL", "7d")

        assert len(result) == 5
        assert result[0].date == date(2024, 1, 1)
        assert result[0].open == 100.0
        assert result[0].close == 101.0
        assert result[0].high == 102.0
        assert result[0].low == 99.0
        assert result[0].volume == 1000000

    def test_fetch_history_invalid_period(self) -> None:
        """Should return empty list for invalid period."""
        result = MarketDataService.fetch_history("AAPL", "invalid")

        assert result == []

    @patch("app.services.market_data_service.yf.Ticker")
    def test_fetch_history_exception_returns_empty(
        self, mock_ticker_cls: MagicMock
    ) -> None:
        """Should return empty list when yfinance raises an exception."""
        mock_ticker = MagicMock()
        mock_ticker.history.side_effect = Exception("API error")
        mock_ticker_cls.return_value = mock_ticker

        result = MarketDataService.fetch_history("AAPL", "30d")

        assert result == []


class TestRefreshAllPrices:
    """Tests for MarketDataService.refresh_all_prices."""

    @patch("app.services.market_data_service.MarketDataService.fetch_quote")
    def test_refresh_updates_holdings_and_watchlist(
        self, mock_fetch_quote: MagicMock, db_session: Session
    ) -> None:
        """Should update current_price on holdings and watchlist items."""
        from app.schemas.market import MarketQuote

        # Create a holding
        holding = Holding(
            ticker="AAPL",
            company_name="Apple Inc.",
            quantity=10.0,
            average_buy_price=100.0,
            current_price=100.0,
        )
        db_session.add(holding)

        # Create a watchlist item
        watchlist_item = WatchlistItem(
            ticker="MSFT",
            company_name="Microsoft",
            current_price=200.0,
        )
        db_session.add(watchlist_item)
        db_session.commit()

        # Mock fetch_quote to return different prices
        def mock_quote(ticker: str) -> MarketQuote | None:
            if ticker == "AAPL":
                return MarketQuote(
                    ticker="AAPL",
                    current_price=155.0,
                    previous_close=150.0,
                    daily_change=5.0,
                    daily_change_pct=3.33,
                    week_52_high=180.0,
                    week_52_low=120.0,
                    market_cap=2500000000000,
                    pe_ratio=28.5,
                    dividend_yield=0.006,
                    analyst_rating="buy",
                )
            elif ticker == "MSFT":
                return MarketQuote(
                    ticker="MSFT",
                    current_price=350.0,
                    previous_close=345.0,
                    daily_change=5.0,
                    daily_change_pct=1.45,
                    week_52_high=400.0,
                    week_52_low=280.0,
                    market_cap=3000000000000,
                    pe_ratio=35.0,
                    dividend_yield=0.008,
                    analyst_rating="buy",
                )
            return None

        mock_fetch_quote.side_effect = mock_quote

        result = MarketDataService.refresh_all_prices(db_session)

        assert result.success_count == 2
        assert result.failure_count == 0

        # Verify holding was updated
        db_session.refresh(holding)
        assert holding.current_price == 155.0

        # Verify watchlist item was updated
        db_session.refresh(watchlist_item)
        assert watchlist_item.current_price == 350.0

    @patch("app.services.market_data_service.MarketDataService.fetch_quote")
    def test_refresh_stores_price_history(
        self, mock_fetch_quote: MagicMock, db_session: Session
    ) -> None:
        """Should store fetched prices in price_history table."""
        from app.schemas.market import MarketQuote

        holding = Holding(
            ticker="GOOG",
            company_name="Alphabet",
            quantity=5.0,
            average_buy_price=100.0,
            current_price=100.0,
        )
        db_session.add(holding)
        db_session.commit()

        mock_fetch_quote.return_value = MarketQuote(
            ticker="GOOG",
            current_price=175.0,
            previous_close=170.0,
            daily_change=5.0,
            daily_change_pct=2.94,
            week_52_high=190.0,
            week_52_low=130.0,
            market_cap=2000000000000,
            pe_ratio=25.0,
            dividend_yield=0.0,
            analyst_rating="buy",
        )

        MarketDataService.refresh_all_prices(db_session)

        # Verify price history was stored
        history = (
            db_session.query(PriceHistory)
            .filter(PriceHistory.ticker == "GOOG")
            .all()
        )
        assert len(history) == 1
        assert history[0].close_price == 175.0
        assert history[0].date == date.today()

    @patch("app.services.market_data_service.MarketDataService.fetch_quote")
    def test_refresh_handles_fetch_failure_gracefully(
        self, mock_fetch_quote: MagicMock, db_session: Session
    ) -> None:
        """Should log failure and continue when fetch_quote returns None."""
        from app.schemas.market import MarketQuote

        holding1 = Holding(
            ticker="AAPL",
            company_name="Apple",
            quantity=10.0,
            average_buy_price=100.0,
            current_price=100.0,
        )
        holding2 = Holding(
            ticker="GOOG",
            company_name="Alphabet",
            quantity=5.0,
            average_buy_price=100.0,
            current_price=100.0,
        )
        db_session.add_all([holding1, holding2])
        db_session.commit()

        def mock_quote(ticker: str) -> MarketQuote | None:
            if ticker == "AAPL":
                return None  # Simulate failure
            return MarketQuote(
                ticker="GOOG",
                current_price=175.0,
                previous_close=170.0,
                daily_change=5.0,
                daily_change_pct=2.94,
                week_52_high=190.0,
                week_52_low=130.0,
                market_cap=2000000000000,
                pe_ratio=25.0,
                dividend_yield=0.0,
                analyst_rating="buy",
            )

        mock_fetch_quote.side_effect = mock_quote

        result = MarketDataService.refresh_all_prices(db_session)

        assert result.failure_count == 1
        assert result.success_count == 1
        assert "AAPL" in result.tickers_failed
        assert "GOOG" in result.tickers_updated

    @patch("app.services.market_data_service.MarketDataService.fetch_quote")
    def test_refresh_deletes_old_price_history(
        self, mock_fetch_quote: MagicMock, db_session: Session
    ) -> None:
        """Should delete price_history records older than 365 days."""
        from app.schemas.market import MarketQuote

        # Create an old price history record
        old_date = date.today() - timedelta(days=400)
        recent_date = date.today() - timedelta(days=30)

        old_record = PriceHistory(
            ticker="AAPL",
            close_price=100.0,
            date=old_date,
        )
        # Create a recent record
        recent_record = PriceHistory(
            ticker="AAPL",
            close_price=150.0,
            date=recent_date,
        )
        db_session.add_all([old_record, recent_record])

        holding = Holding(
            ticker="AAPL",
            company_name="Apple",
            quantity=10.0,
            average_buy_price=100.0,
            current_price=100.0,
        )
        db_session.add(holding)
        db_session.commit()

        mock_fetch_quote.return_value = MarketQuote(
            ticker="AAPL",
            current_price=155.0,
            previous_close=150.0,
            daily_change=5.0,
            daily_change_pct=3.33,
            week_52_high=180.0,
            week_52_low=120.0,
            market_cap=2500000000000,
            pe_ratio=28.5,
            dividend_yield=0.006,
            analyst_rating="buy",
        )

        old_date = date.today() - timedelta(days=400)
        recent_date = date.today() - timedelta(days=30)

        MarketDataService.refresh_all_prices(db_session)

        # Old record should be deleted, recent and new should remain
        all_history = db_session.query(PriceHistory).all()
        dates = [h.date for h in all_history]
        assert old_date not in dates
        assert recent_date in dates


class TestGetCachedPrice:
    """Tests for MarketDataService.get_cached_price."""

    def test_get_cached_price_returns_latest(self, db_session: Session) -> None:
        """Should return the most recent close_price."""
        record = PriceHistory(
            ticker="AAPL",
            close_price=155.0,
            date=date.today(),
        )
        db_session.add(record)
        db_session.commit()

        result = MarketDataService.get_cached_price(db_session, "AAPL")

        assert result == 155.0

    def test_get_cached_price_returns_none_when_no_history(
        self, db_session: Session
    ) -> None:
        """Should return None when no price history exists."""
        result = MarketDataService.get_cached_price(db_session, "UNKNOWN")

        assert result is None
