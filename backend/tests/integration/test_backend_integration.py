"""Backend integration tests for full CRUD flows, error responses, and market data.

Validates Requirements: 11.1, 11.2, 11.3, 11.4, 11.5, 11.8, 11.9
Tests the full request/response cycle through the API using FastAPI TestClient.
"""

from collections.abc import Generator
from datetime import date
from unittest.mock import patch

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.database import get_db
from app.main import app
from app.models.cash_balance import CashBalance
from app.models.holding import Holding
from app.models.watchlist_item import WatchlistItem
from app.schemas.market import MarketQuote, PricePoint


@pytest.fixture()
def test_client(db_session: Session) -> Generator[TestClient, None, None]:
    """Provide a synchronous test client with the test DB session injected."""

    def _override_get_db() -> Generator[Session, None, None]:
        yield db_session

    app.dependency_overrides[get_db] = _override_get_db
    with TestClient(app) as tc:
        yield tc
    app.dependency_overrides.clear()


@pytest.fixture()
def _seed_cash(db_session: Session) -> None:
    """Seed the database with a cash balance."""
    cash = CashBalance(id=1, balance=100000.0)
    db_session.add(cash)
    db_session.commit()


# =============================================================================
# FULL CRUD FLOW TESTS - Holdings (Requirement 11.1)
# =============================================================================


class TestHoldingsCRUDFlow:
    """Test full create -> read -> update -> delete flow for holdings."""

    @pytest.mark.usefixtures("_seed_cash")
    def test_full_holdings_crud_flow(self, test_client: TestClient) -> None:
        """Test complete CRUD lifecycle for a holding."""
        # CREATE
        create_payload = {
            "ticker": "GOOG",
            "quantity": 15.0,
            "buy_price": 140.0,
            "company_name": "Alphabet Inc.",
            "sector": "Technology",
            "industry": "Internet Services",
        }
        create_resp = test_client.post("/api/holdings", json=create_payload)
        assert create_resp.status_code == 201
        create_body = create_resp.json()
        assert create_body["success"] is True
        assert create_body["error"] is None
        assert create_body["data"]["ticker"] == "GOOG"
        assert create_body["data"]["quantity"] == 15.0
        assert create_body["data"]["average_buy_price"] == 140.0
        holding_id = create_body["data"]["id"]

        # READ (single)
        get_resp = test_client.get(f"/api/holdings/{holding_id}")
        assert get_resp.status_code == 200
        get_body = get_resp.json()
        assert get_body["success"] is True
        assert get_body["data"]["ticker"] == "GOOG"
        assert get_body["data"]["quantity"] == 15.0
        assert get_body["data"]["company_name"] == "Alphabet Inc."

        # READ (list)
        list_resp = test_client.get("/api/holdings")
        assert list_resp.status_code == 200
        list_body = list_resp.json()
        assert list_body["success"] is True
        assert len(list_body["data"]) == 1
        assert list_body["data"][0]["ticker"] == "GOOG"

        # UPDATE
        update_payload = {
            "company_name": "Alphabet Inc. (Updated)",
            "sector": "Communication Services",
            "notes": "Renamed sector",
        }
        update_resp = test_client.put(
            f"/api/holdings/{holding_id}", json=update_payload
        )
        assert update_resp.status_code == 200
        update_body = update_resp.json()
        assert update_body["success"] is True
        assert update_body["data"]["company_name"] == "Alphabet Inc. (Updated)"
        assert update_body["data"]["sector"] == "Communication Services"

        # DELETE
        delete_resp = test_client.delete(f"/api/holdings/{holding_id}")
        assert delete_resp.status_code == 200
        delete_body = delete_resp.json()
        assert delete_body["success"] is True
        assert delete_body["data"] is None
        assert delete_body["error"] is None

        # VERIFY DELETED
        verify_resp = test_client.get(f"/api/holdings/{holding_id}")
        assert verify_resp.status_code == 404

    @pytest.mark.usefixtures("_seed_cash")
    def test_created_holding_includes_calculated_fields(
        self, test_client: TestClient
    ) -> None:
        """Created holding response includes all calculated fields."""
        payload = {
            "ticker": "TSLA",
            "quantity": 10.0,
            "buy_price": 200.0,
        }
        resp = test_client.post("/api/holdings", json=payload)
        assert resp.status_code == 201
        data = resp.json()["data"]

        # Verify calculated fields are present
        assert "total_invested" in data
        assert "current_value" in data
        assert "unrealized_gain" in data
        assert "unrealized_gain_pct" in data
        assert "allocation_pct" in data
        assert "annual_dividend_income" in data
        assert data["total_invested"] == 2000.0  # 10 * 200


# =============================================================================
# FULL CRUD FLOW TESTS - Transactions (Requirement 11.2)
# =============================================================================


class TestTransactionsCRUDFlow:
    """Test full create -> read -> delete flow for transactions."""

    @pytest.mark.usefixtures("_seed_cash")
    def test_full_transaction_crud_flow(self, test_client: TestClient) -> None:
        """Test complete CRUD lifecycle for transactions."""
        # First create a holding
        holding_payload = {
            "ticker": "AMZN",
            "quantity": 20.0,
            "buy_price": 150.0,
        }
        holding_resp = test_client.post("/api/holdings", json=holding_payload)
        assert holding_resp.status_code == 201
        holding_id = holding_resp.json()["data"]["id"]

        # CREATE a buy transaction
        buy_payload = {
            "ticker": "AMZN",
            "transaction_type": "buy",
            "quantity": 5.0,
            "price": 160.0,
            "fees": 9.99,
            "transaction_date": "2024-06-15",
            "notes": "Additional buy",
        }
        create_resp = test_client.post("/api/transactions", json=buy_payload)
        assert create_resp.status_code == 201
        create_body = create_resp.json()
        assert create_body["success"] is True
        assert create_body["error"] is None
        assert create_body["data"]["ticker"] == "AMZN"
        assert create_body["data"]["transaction_type"] == "buy"
        assert create_body["data"]["quantity"] == 5.0
        assert create_body["data"]["price"] == 160.0
        assert create_body["data"]["fees"] == 9.99
        transaction_id = create_body["data"]["id"]

        # READ transactions for holding
        read_resp = test_client.get(f"/api/transactions?holding_id={holding_id}")
        assert read_resp.status_code == 200
        read_body = read_resp.json()
        assert read_body["success"] is True
        # Should have at least 2 transactions (initial buy + additional buy)
        assert len(read_body["data"]) >= 2

        # Verify the holding quantity was updated (20 + 5 = 25)
        holding_resp = test_client.get(f"/api/holdings/{holding_id}")
        assert holding_resp.status_code == 200
        assert holding_resp.json()["data"]["quantity"] == 25.0

        # DELETE the additional transaction
        delete_resp = test_client.delete(f"/api/transactions/{transaction_id}")
        assert delete_resp.status_code == 200
        delete_body = delete_resp.json()
        assert delete_body["success"] is True
        assert delete_body["data"] is None
        assert delete_body["error"] is None

        # Verify holding quantity reverted (back to 20)
        holding_resp = test_client.get(f"/api/holdings/{holding_id}")
        assert holding_resp.status_code == 200
        assert holding_resp.json()["data"]["quantity"] == 20.0

    @pytest.mark.usefixtures("_seed_cash")
    def test_sell_transaction_reduces_quantity(self, test_client: TestClient) -> None:
        """Sell transaction reduces holding quantity."""
        # Create holding
        holding_payload = {
            "ticker": "META",
            "quantity": 30.0,
            "buy_price": 300.0,
        }
        holding_resp = test_client.post("/api/holdings", json=holding_payload)
        assert holding_resp.status_code == 201
        holding_id = holding_resp.json()["data"]["id"]

        # Sell some shares
        sell_payload = {
            "ticker": "META",
            "transaction_type": "sell",
            "quantity": 10.0,
            "price": 350.0,
            "fees": 5.0,
            "transaction_date": "2024-07-01",
        }
        sell_resp = test_client.post("/api/transactions", json=sell_payload)
        assert sell_resp.status_code == 201
        sell_body = sell_resp.json()
        assert sell_body["success"] is True
        assert sell_body["data"]["transaction_type"] == "sell"

        # Verify holding quantity decreased
        holding_resp = test_client.get(f"/api/holdings/{holding_id}")
        assert holding_resp.status_code == 200
        assert holding_resp.json()["data"]["quantity"] == 20.0

    @pytest.mark.usefixtures("_seed_cash")
    def test_sell_exceeding_quantity_returns_422(self, test_client: TestClient) -> None:
        """Sell transaction exceeding holding quantity returns 422."""
        # Create holding with 5 shares
        holding_payload = {
            "ticker": "NVDA",
            "quantity": 5.0,
            "buy_price": 800.0,
        }
        test_client.post("/api/holdings", json=holding_payload)

        # Try to sell more than available
        sell_payload = {
            "ticker": "NVDA",
            "transaction_type": "sell",
            "quantity": 10.0,
            "price": 900.0,
            "transaction_date": "2024-07-01",
        }
        resp = test_client.post("/api/transactions", json=sell_payload)
        assert resp.status_code == 422
        body = resp.json()
        assert body["success"] is False
        assert body["data"] is None
        assert body["error"] is not None


# =============================================================================
# FULL CRUD FLOW TESTS - Watchlist (Requirement 11.3)
# =============================================================================


class TestWatchlistCRUDFlow:
    """Test full create -> read -> update -> delete flow for watchlist."""

    def test_full_watchlist_crud_flow(self, test_client: TestClient) -> None:
        """Test complete CRUD lifecycle for a watchlist item."""
        # CREATE
        create_payload = {
            "ticker": "NFLX",
            "target_buy_price": 500.0,
            "priority": 2,
            "notes": "Watch for earnings dip",
        }
        create_resp = test_client.post("/api/watchlist", json=create_payload)
        assert create_resp.status_code == 201
        create_body = create_resp.json()
        assert create_body["success"] is True
        assert create_body["error"] is None
        assert create_body["data"]["ticker"] == "NFLX"
        assert create_body["data"]["target_buy_price"] == 500.0
        assert create_body["data"]["priority"] == 2
        item_id = create_body["data"]["id"]

        # READ (list)
        list_resp = test_client.get("/api/watchlist")
        assert list_resp.status_code == 200
        list_body = list_resp.json()
        assert list_body["success"] is True
        assert len(list_body["data"]) == 1
        assert list_body["data"][0]["ticker"] == "NFLX"

        # UPDATE
        update_payload = {
            "target_buy_price": 480.0,
            "priority": 1,
            "notes": "Updated target after analysis",
        }
        update_resp = test_client.put(f"/api/watchlist/{item_id}", json=update_payload)
        assert update_resp.status_code == 200
        update_body = update_resp.json()
        assert update_body["success"] is True
        assert update_body["data"]["target_buy_price"] == 480.0
        assert update_body["data"]["priority"] == 1
        assert update_body["data"]["notes"] == "Updated target after analysis"

        # DELETE
        delete_resp = test_client.delete(f"/api/watchlist/{item_id}")
        assert delete_resp.status_code == 200
        delete_body = delete_resp.json()
        assert delete_body["success"] is True
        assert delete_body["data"] is None
        assert delete_body["error"] is None

        # VERIFY DELETED
        list_resp = test_client.get("/api/watchlist")
        assert list_resp.status_code == 200
        assert list_resp.json()["data"] == []


# =============================================================================
# DASHBOARD SUMMARY WITH POPULATED DATA (Requirement 11.4)
# =============================================================================


class TestDashboardWithPopulatedData:
    """Test dashboard summary endpoint with multiple holdings."""

    def test_dashboard_summary_multiple_holdings(
        self, test_client: TestClient, db_session: Session
    ) -> None:
        """Dashboard summary correctly aggregates multiple holdings."""
        # Seed cash balance
        cash = CashBalance(id=1, balance=10000.0)
        db_session.add(cash)

        # Seed multiple holdings
        holdings = [
            Holding(
                ticker="AAPL",
                company_name="Apple Inc.",
                quantity=10.0,
                average_buy_price=150.0,
                current_price=175.0,
                sector="Technology",
                dividend_yield=0.005,
            ),
            Holding(
                ticker="MSFT",
                company_name="Microsoft Corp.",
                quantity=5.0,
                average_buy_price=300.0,
                current_price=350.0,
                sector="Technology",
                dividend_yield=0.008,
            ),
            Holding(
                ticker="JNJ",
                company_name="Johnson & Johnson",
                quantity=20.0,
                average_buy_price=160.0,
                current_price=155.0,
                sector="Healthcare",
                dividend_yield=0.03,
            ),
        ]
        for h in holdings:
            db_session.add(h)
        db_session.commit()

        resp = test_client.get("/api/dashboard/summary")
        assert resp.status_code == 200
        body = resp.json()
        assert body["success"] is True
        assert body["error"] is None

        data = body["data"]
        # Total portfolio value: (175*10) + (350*5) + (155*20) = 1750 + 1750 + 3100 =
        # 6600
        assert data["total_portfolio_value"] == 6600.0
        # Total invested: (150*10) + (300*5) + (160*20) = 1500 + 1500 + 3200 = 6200
        assert data["total_invested"] == 6200.0
        # Unrealized gain: 6600 - 6200 = 400
        assert data["unrealized_gain"] == 400.0
        assert data["number_of_holdings"] == 3
        assert data["cash_position"] == 10000.0
        assert "stale_data" in data
        assert "last_successful_fetch" in data

    def test_dashboard_activity_with_populated_data(
        self, test_client: TestClient, db_session: Session
    ) -> None:
        """Dashboard activity feed includes events from populated data."""
        # Seed holdings
        holding = Holding(
            ticker="AAPL",
            company_name="Apple Inc.",
            quantity=10.0,
            average_buy_price=150.0,
            current_price=175.0,
            sector="Technology",
        )
        db_session.add(holding)

        # Seed watchlist items
        watchlist_item = WatchlistItem(
            ticker="TSLA",
            company_name="Tesla Inc.",
            current_price=250.0,
            target_buy_price=200.0,
            priority=2,
        )
        db_session.add(watchlist_item)
        db_session.commit()

        resp = test_client.get("/api/dashboard/activity")
        assert resp.status_code == 200
        body = resp.json()
        assert body["success"] is True
        assert body["error"] is None
        # Should have at least holding_added and watchlist_added events
        assert len(body["data"]) >= 1


# =============================================================================
# ERROR RESPONSE FORMAT VERIFICATION (Requirements 11.8, 11.9)
# =============================================================================


class TestErrorResponseEnvelopeFormat:
    """Verify all error responses match the standard envelope format."""

    def test_404_holding_not_found_envelope(self, test_client: TestClient) -> None:
        """404 response for holding not found matches envelope format."""
        resp = test_client.get("/api/holdings/99999")
        assert resp.status_code == 404
        body = resp.json()
        # Verify envelope structure
        assert "success" in body
        assert "data" in body
        assert "error" in body
        assert body["success"] is False
        assert body["data"] is None
        assert isinstance(body["error"], str)
        assert len(body["error"]) > 0

    def test_404_watchlist_not_found_envelope(self, test_client: TestClient) -> None:
        """404 response for watchlist item not found matches envelope format."""
        resp = test_client.put("/api/watchlist/99999", json={"priority": 1})
        assert resp.status_code == 404
        body = resp.json()
        assert body["success"] is False
        assert body["data"] is None
        assert isinstance(body["error"], str)

    def test_422_validation_error_envelope_holdings(
        self, test_client: TestClient
    ) -> None:
        """422 validation error for holdings matches envelope format."""
        # Invalid ticker (lowercase)
        payload = {"ticker": "invalid", "quantity": 5.0, "buy_price": 100.0}
        resp = test_client.post("/api/holdings", json=payload)
        assert resp.status_code == 422
        body = resp.json()
        assert body["success"] is False
        assert body["data"] is None
        assert body["error"] is not None

    def test_422_validation_error_envelope_transactions(
        self, test_client: TestClient
    ) -> None:
        """422 validation error for transactions matches envelope format."""
        # Missing required fields
        payload = {"ticker": "invalid", "transaction_type": "buy"}
        resp = test_client.post("/api/transactions", json=payload)
        assert resp.status_code == 422
        body = resp.json()
        assert body["success"] is False
        assert body["data"] is None
        assert body["error"] is not None

    def test_422_validation_error_envelope_watchlist(
        self, test_client: TestClient
    ) -> None:
        """422 validation error for watchlist matches envelope format."""
        # Invalid ticker format
        payload = {"ticker": "toolongticker"}
        resp = test_client.post("/api/watchlist", json=payload)
        assert resp.status_code == 422
        body = resp.json()
        assert body["success"] is False
        assert body["data"] is None
        assert body["error"] is not None

    def test_422_validation_error_includes_details(
        self, test_client: TestClient
    ) -> None:
        """422 validation error includes field-level details."""
        # Multiple validation errors
        payload = {
            "ticker": "bad",
            "quantity": -1.0,
            "buy_price": 0.0,
        }
        resp = test_client.post("/api/holdings", json=payload)
        assert resp.status_code == 422
        body = resp.json()
        assert body["success"] is False
        # Should have details about which fields failed
        assert "details" in body or "error" in body

    def test_404_delete_nonexistent_holding_envelope(
        self, test_client: TestClient
    ) -> None:
        """404 on delete of nonexistent holding matches envelope format."""
        resp = test_client.delete("/api/holdings/99999")
        assert resp.status_code == 404
        body = resp.json()
        assert body["success"] is False
        assert body["data"] is None
        assert isinstance(body["error"], str)

    def test_404_delete_nonexistent_watchlist_envelope(
        self, test_client: TestClient
    ) -> None:
        """404 on delete of nonexistent watchlist item matches envelope."""
        resp = test_client.delete("/api/watchlist/99999")
        assert resp.status_code == 404
        body = resp.json()
        assert body["success"] is False
        assert body["data"] is None
        assert isinstance(body["error"], str)

    def test_success_response_envelope_format(self, test_client: TestClient) -> None:
        """Successful responses match envelope format with success=True."""
        resp = test_client.get("/api/holdings")
        assert resp.status_code == 200
        body = resp.json()
        assert "success" in body
        assert "data" in body
        assert "error" in body
        assert body["success"] is True
        assert body["error"] is None
        assert body["data"] is not None


# =============================================================================
# MARKET DATA ENDPOINTS WITH MOCKED YFINANCE (Requirement 11.5)
# =============================================================================


class TestMarketDataEndpoints:
    """Test market data endpoints with mocked yfinance."""

    def test_market_quote_with_full_data(self, test_client: TestClient) -> None:
        """Market quote endpoint returns full quote data when available."""
        mock_quote = MarketQuote(
            ticker="AAPL",
            current_price=185.50,
            previous_close=183.25,
            daily_change=2.25,
            daily_change_pct=1.23,
            week_52_high=199.62,
            week_52_low=124.17,
            market_cap=2900000000000,
            pe_ratio=30.5,
            dividend_yield=0.005,
            analyst_rating="buy",
        )

        with patch(
            "app.routers.market.MarketDataService.fetch_quote",
            return_value=mock_quote,
        ):
            resp = test_client.get("/api/market/quote/AAPL")

        assert resp.status_code == 200
        body = resp.json()
        assert body["success"] is True
        assert body["error"] is None
        data = body["data"]
        assert data["ticker"] == "AAPL"
        assert data["current_price"] == 185.50
        assert data["previous_close"] == 183.25
        assert data["daily_change"] == 2.25
        assert data["daily_change_pct"] == 1.23
        assert data["week_52_high"] == 199.62
        assert data["week_52_low"] == 124.17
        assert data["market_cap"] == 2900000000000
        assert data["pe_ratio"] == 30.5
        assert data["dividend_yield"] == 0.005
        assert data["analyst_rating"] == "buy"

    def test_market_quote_fallback_to_cache(self, test_client: TestClient) -> None:
        """Market quote falls back to cached price when yfinance fails."""
        with (
            patch(
                "app.routers.market.MarketDataService.fetch_quote",
                return_value=None,
            ),
            patch(
                "app.routers.market.MarketDataService.get_cached_price",
                return_value=180.0,
            ),
        ):
            resp = test_client.get("/api/market/quote/AAPL")

        assert resp.status_code == 200
        body = resp.json()
        assert body["success"] is True
        assert body["data"]["ticker"] == "AAPL"
        assert body["data"]["current_price"] == 180.0
        assert body["data"]["cached"] is True

    def test_market_quote_no_data_returns_404(self, test_client: TestClient) -> None:
        """Market quote returns 404 when no data available at all."""
        with (
            patch(
                "app.routers.market.MarketDataService.fetch_quote",
                return_value=None,
            ),
            patch(
                "app.routers.market.MarketDataService.get_cached_price",
                return_value=None,
            ),
        ):
            resp = test_client.get("/api/market/quote/FAKE")

        assert resp.status_code == 404
        body = resp.json()
        assert body["success"] is False
        assert body["data"] is None
        assert "not available" in body["error"].lower()

    def test_market_history_returns_price_points(self, test_client: TestClient) -> None:
        """Market history endpoint returns list of price points."""
        mock_history = [
            PricePoint(
                date=date(2024, 3, 1),
                open=170.0,
                close=172.5,
                high=174.0,
                low=169.0,
                volume=50000000,
            ),
            PricePoint(
                date=date(2024, 3, 2),
                open=172.5,
                close=175.0,
                high=176.0,
                low=171.0,
                volume=48000000,
            ),
            PricePoint(
                date=date(2024, 3, 3),
                open=175.0,
                close=173.0,
                high=176.5,
                low=172.0,
                volume=52000000,
            ),
        ]

        with patch(
            "app.routers.market.MarketDataService.fetch_history",
            return_value=mock_history,
        ):
            resp = test_client.get("/api/market/history/AAPL?period=7d")

        assert resp.status_code == 200
        body = resp.json()
        assert body["success"] is True
        assert body["error"] is None
        assert len(body["data"]) == 3
        assert body["data"][0]["date"] == "2024-03-01"
        assert body["data"][0]["close"] == 172.5
        assert body["data"][1]["open"] == 172.5
        assert body["data"][2]["volume"] == 52000000

    def test_market_history_empty_for_unknown_ticker(
        self, test_client: TestClient
    ) -> None:
        """Market history returns empty list for unknown ticker."""
        with patch(
            "app.routers.market.MarketDataService.fetch_history",
            return_value=[],
        ):
            resp = test_client.get("/api/market/history/UNKNOWN?period=30d")

        assert resp.status_code == 200
        body = resp.json()
        assert body["success"] is True
        assert body["data"] == []
        assert body["error"] is None

    def test_market_history_different_periods(self, test_client: TestClient) -> None:
        """Market history endpoint accepts different period parameters."""
        with patch(
            "app.routers.market.MarketDataService.fetch_history",
            return_value=[],
        ) as mock_fetch:
            # Test 90d period
            resp = test_client.get("/api/market/history/AAPL?period=90d")
            assert resp.status_code == 200
            mock_fetch.assert_called_with("AAPL", "90d")

            # Test 1y period
            resp = test_client.get("/api/market/history/AAPL?period=1y")
            assert resp.status_code == 200
            mock_fetch.assert_called_with("AAPL", "1y")

    def test_market_quote_envelope_format_on_success(
        self, test_client: TestClient
    ) -> None:
        """Market quote success response follows envelope format."""
        mock_quote = MarketQuote(
            ticker="MSFT",
            current_price=420.0,
            previous_close=418.0,
            daily_change=2.0,
            daily_change_pct=0.48,
            week_52_high=430.0,
            week_52_low=310.0,
            market_cap=3100000000000,
            pe_ratio=35.0,
            dividend_yield=0.007,
            analyst_rating="strong buy",
        )

        with patch(
            "app.routers.market.MarketDataService.fetch_quote",
            return_value=mock_quote,
        ):
            resp = test_client.get("/api/market/quote/MSFT")

        assert resp.status_code == 200
        body = resp.json()
        # Verify envelope structure
        assert "success" in body
        assert "data" in body
        assert "error" in body
        assert body["success"] is True
        assert body["error"] is None
        assert isinstance(body["data"], dict)
