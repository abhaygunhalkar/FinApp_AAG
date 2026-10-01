"""Integration tests for the dashboard router endpoints."""

from collections.abc import Generator

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.database import get_db
from app.main import app
from app.models.cash_balance import CashBalance
from app.models.holding import Holding


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
def _seed_data(db_session: Session) -> None:
    """Seed the database with sample data for dashboard tests."""
    cash = CashBalance(id=1, balance=5000.0)
    db_session.add(cash)

    holding = Holding(
        ticker="AAPL",
        company_name="Apple Inc.",
        quantity=10,
        average_buy_price=150.0,
        current_price=175.0,
        sector="Technology",
        industry="Consumer Electronics",
        dividend_yield=0.005,
    )
    db_session.add(holding)
    db_session.commit()


def test_get_summary_empty_portfolio(test_client: TestClient) -> None:
    """GET /api/dashboard/summary returns zeros when no holdings exist."""
    response = test_client.get("/api/dashboard/summary")
    assert response.status_code == 200
    body = response.json()
    assert body["success"] is True
    assert body["error"] is None
    data = body["data"]
    assert data["total_portfolio_value"] == 0.0
    assert data["number_of_holdings"] == 0
    assert data["stale_data"] is False


@pytest.mark.usefixtures("_seed_data")
def test_get_summary_with_holdings(test_client: TestClient) -> None:
    """GET /api/dashboard/summary returns calculated metrics."""
    response = test_client.get("/api/dashboard/summary")
    assert response.status_code == 200
    body = response.json()
    assert body["success"] is True
    data = body["data"]
    assert data["total_portfolio_value"] == 1750.0  # 175 * 10
    assert data["total_invested"] == 1500.0  # 150 * 10
    assert data["unrealized_gain"] == 250.0
    assert data["number_of_holdings"] == 1
    assert data["cash_position"] == 5000.0
    assert "stale_data" in data
    assert "last_successful_fetch" in data


def test_get_by_broker_empty_portfolio(test_client: TestClient) -> None:
    """GET /api/dashboard/by-broker returns an empty list when no holdings exist."""
    response = test_client.get("/api/dashboard/by-broker")
    assert response.status_code == 200
    body = response.json()
    assert body["success"] is True
    assert body["error"] is None
    assert body["data"] == []


@pytest.mark.usefixtures("_seed_data")
def test_get_by_broker_with_holdings(test_client: TestClient) -> None:
    """GET /api/dashboard/by-broker aggregates market value per broker."""
    response = test_client.get("/api/dashboard/by-broker")
    assert response.status_code == 200
    body = response.json()
    assert body["success"] is True
    data = body["data"]
    assert len(data) == 1
    assert data[0]["market_value"] == 1750.0
    assert data[0]["total_invested"] == 1500.0
    assert data[0]["unrealized_gain"] == 250.0
    assert data[0]["holding_count"] == 1


def test_get_activity_empty(test_client: TestClient) -> None:
    """GET /api/dashboard/activity returns empty list when no events."""
    response = test_client.get("/api/dashboard/activity")
    assert response.status_code == 200
    body = response.json()
    assert body["success"] is True
    assert body["data"] == []
    assert body["error"] is None


@pytest.mark.usefixtures("_seed_data")
def test_get_activity_with_holdings(test_client: TestClient) -> None:
    """GET /api/dashboard/activity includes holding_added events."""
    response = test_client.get("/api/dashboard/activity")
    assert response.status_code == 200
    body = response.json()
    assert body["success"] is True
    assert len(body["data"]) >= 1
    event = body["data"][0]
    assert event["event_type"] == "holding_added"
    assert event["ticker"] == "AAPL"


def test_get_history_empty(test_client: TestClient) -> None:
    """GET /api/dashboard/history returns empty list when no holdings."""
    response = test_client.get("/api/dashboard/history")
    assert response.status_code == 200
    body = response.json()
    assert body["success"] is True
    assert body["data"] == []
    assert body["error"] is None


def test_get_history_default_days(test_client: TestClient) -> None:
    """GET /api/dashboard/history defaults to 30 days."""
    response = test_client.get("/api/dashboard/history")
    assert response.status_code == 200
    body = response.json()
    assert body["success"] is True


def test_get_history_custom_days(test_client: TestClient) -> None:
    """GET /api/dashboard/history accepts days query parameter."""
    response = test_client.get("/api/dashboard/history?days=7")
    assert response.status_code == 200
    body = response.json()
    assert body["success"] is True


def test_get_history_invalid_days(test_client: TestClient) -> None:
    """GET /api/dashboard/history rejects invalid days parameter."""
    response = test_client.get("/api/dashboard/history?days=0")
    assert response.status_code == 422


def test_get_history_days_too_large(test_client: TestClient) -> None:
    """GET /api/dashboard/history rejects days > 365."""
    response = test_client.get("/api/dashboard/history?days=500")
    assert response.status_code == 422
