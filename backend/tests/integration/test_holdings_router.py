"""Integration tests for the holdings router endpoints."""

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
def _seed_cash(db_session: Session) -> None:
    """Seed the database with a cash balance for holding creation tests."""
    cash = CashBalance(id=1, balance=50000.0)
    db_session.add(cash)
    db_session.commit()


@pytest.fixture()
def _seed_holding(db_session: Session) -> None:
    """Seed the database with a holding and cash balance."""
    cash = CashBalance(id=1, balance=5000.0)
    db_session.add(cash)
    holding = Holding(
        ticker="AAPL",
        company_name="Apple Inc.",
        quantity=10.0,
        average_buy_price=150.0,
        current_price=175.0,
        sector="Technology",
        industry="Consumer Electronics",
        dividend_yield=0.005,
    )
    db_session.add(holding)
    db_session.commit()


# --- GET /api/holdings ---


def test_get_holdings_empty(test_client: TestClient) -> None:
    """GET /api/holdings returns empty list when no holdings exist."""
    response = test_client.get("/api/holdings")
    assert response.status_code == 200
    body = response.json()
    assert body["success"] is True
    assert body["data"] == []
    assert body["error"] is None


@pytest.mark.usefixtures("_seed_holding")
def test_get_holdings_with_data(test_client: TestClient) -> None:
    """GET /api/holdings returns holdings wrapped in ApiResponse envelope."""
    response = test_client.get("/api/holdings")
    assert response.status_code == 200
    body = response.json()
    assert body["success"] is True
    assert body["error"] is None
    assert len(body["data"]) == 1
    holding = body["data"][0]
    assert holding["ticker"] == "AAPL"
    assert holding["quantity"] == 10.0
    assert holding["average_buy_price"] == 150.0
    assert holding["current_price"] == 175.0


# --- GET /api/holdings/{id} ---


@pytest.mark.usefixtures("_seed_holding")
def test_get_holding_by_id(test_client: TestClient) -> None:
    """GET /api/holdings/{id} returns a single holding."""
    response = test_client.get("/api/holdings/1")
    assert response.status_code == 200
    body = response.json()
    assert body["success"] is True
    assert body["error"] is None
    assert body["data"]["ticker"] == "AAPL"


def test_get_holding_not_found(test_client: TestClient) -> None:
    """GET /api/holdings/{id} returns 404 for nonexistent holding."""
    response = test_client.get("/api/holdings/999")
    assert response.status_code == 404
    body = response.json()
    assert body["success"] is False
    assert body["data"] is None
    assert "not found" in body["error"].lower()


# --- POST /api/holdings ---


@pytest.mark.usefixtures("_seed_cash")
def test_create_holding_returns_201(test_client: TestClient) -> None:
    """POST /api/holdings creates a holding and returns 201."""
    payload = {
        "ticker": "MSFT",
        "quantity": 5.0,
        "buy_price": 300.0,
        "company_name": "Microsoft Corp.",
        "sector": "Technology",
    }
    response = test_client.post("/api/holdings", json=payload)
    assert response.status_code == 201
    body = response.json()
    assert body["success"] is True
    assert body["error"] is None
    assert body["data"]["ticker"] == "MSFT"
    assert body["data"]["quantity"] == 5.0
    assert body["data"]["average_buy_price"] == 300.0


@pytest.mark.usefixtures("_seed_holding")
def test_create_holding_duplicate_ticker(test_client: TestClient) -> None:
    """POST /api/holdings rejects duplicate ticker with 400."""
    payload = {
        "ticker": "AAPL",
        "quantity": 5.0,
        "buy_price": 160.0,
    }
    response = test_client.post("/api/holdings", json=payload)
    assert response.status_code == 400
    body = response.json()
    assert body["success"] is False
    assert body["data"] is None
    assert "already exists" in body["error"].lower()


@pytest.mark.usefixtures("_seed_holding")
def test_create_holding_same_ticker_different_broker_allowed(
    test_client: TestClient,
) -> None:
    """POST /api/holdings allows the same ticker under a different broker."""
    payload = {
        "ticker": "AAPL",
        "quantity": 5.0,
        "buy_price": 160.0,
        "broker": "Fidelity",
    }
    response = test_client.post("/api/holdings", json=payload)
    assert response.status_code == 201
    body = response.json()
    assert body["success"] is True
    assert body["data"]["broker"] == "Fidelity"


def test_create_holding_invalid_ticker_422(test_client: TestClient) -> None:
    """POST /api/holdings returns 422 for invalid ticker format."""
    payload = {
        "ticker": "invalid",
        "quantity": 5.0,
        "buy_price": 100.0,
    }
    response = test_client.post("/api/holdings", json=payload)
    assert response.status_code == 422


def test_create_holding_zero_quantity_422(test_client: TestClient) -> None:
    """POST /api/holdings returns 422 for zero quantity."""
    payload = {
        "ticker": "AAPL",
        "quantity": 0,
        "buy_price": 100.0,
    }
    response = test_client.post("/api/holdings", json=payload)
    assert response.status_code == 422


def test_create_holding_negative_price_422(test_client: TestClient) -> None:
    """POST /api/holdings returns 422 for negative buy price."""
    payload = {
        "ticker": "AAPL",
        "quantity": 5.0,
        "buy_price": -1.0,
    }
    response = test_client.post("/api/holdings", json=payload)
    assert response.status_code == 422


# --- PUT /api/holdings/{id} ---


@pytest.mark.usefixtures("_seed_holding")
def test_update_holding_returns_200(test_client: TestClient) -> None:
    """PUT /api/holdings/{id} updates holding and returns 200."""
    payload = {
        "company_name": "Apple Inc. Updated",
        "sector": "Tech",
        "notes": "Updated notes",
    }
    response = test_client.put("/api/holdings/1", json=payload)
    assert response.status_code == 200
    body = response.json()
    assert body["success"] is True
    assert body["error"] is None
    assert body["data"]["company_name"] == "Apple Inc. Updated"
    assert body["data"]["sector"] == "Tech"


def test_update_holding_not_found(test_client: TestClient) -> None:
    """PUT /api/holdings/{id} returns 404 for nonexistent holding."""
    payload = {"company_name": "Test"}
    response = test_client.put("/api/holdings/999", json=payload)
    assert response.status_code == 404
    body = response.json()
    assert body["success"] is False
    assert body["data"] is None
    assert "not found" in body["error"].lower()


# --- DELETE /api/holdings/{id} ---


@pytest.mark.usefixtures("_seed_holding")
def test_delete_holding_returns_200(test_client: TestClient) -> None:
    """DELETE /api/holdings/{id} deletes holding and returns 200."""
    response = test_client.delete("/api/holdings/1")
    assert response.status_code == 200
    body = response.json()
    assert body["success"] is True
    assert body["data"] is None
    assert body["error"] is None


def test_delete_holding_not_found(test_client: TestClient) -> None:
    """DELETE /api/holdings/{id} returns 404 for nonexistent holding."""
    response = test_client.delete("/api/holdings/999")
    assert response.status_code == 404
    body = response.json()
    assert body["success"] is False
    assert body["data"] is None
    assert "not found" in body["error"].lower()
