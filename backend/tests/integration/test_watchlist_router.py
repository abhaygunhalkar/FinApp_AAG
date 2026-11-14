"""Integration tests for the watchlist router endpoints."""

from collections.abc import Generator

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.database import get_db
from app.main import app
from app.models.watchlist_item import WatchlistItem


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
def _seed_watchlist(db_session: Session) -> None:
    """Seed the database with a sample watchlist item."""
    item = WatchlistItem(
        ticker="AAPL",
        company_name="Apple Inc.",
        current_price=175.0,
        target_buy_price=150.0,
        priority=1,
        notes="Buy on dip",
    )
    db_session.add(item)
    db_session.commit()


def test_get_watchlist_empty(test_client: TestClient) -> None:
    """GET /api/watchlist returns empty list when no items exist."""
    response = test_client.get("/api/watchlist")
    assert response.status_code == 200
    body = response.json()
    assert body["success"] is True
    assert body["data"] == []
    assert body["error"] is None


@pytest.mark.usefixtures("_seed_watchlist")
def test_get_watchlist_with_items(test_client: TestClient) -> None:
    """GET /api/watchlist returns all watchlist items."""
    response = test_client.get("/api/watchlist")
    assert response.status_code == 200
    body = response.json()
    assert body["success"] is True
    assert len(body["data"]) == 1
    assert body["data"][0]["ticker"] == "AAPL"
    assert body["error"] is None


def test_create_watchlist_item(test_client: TestClient) -> None:
    """POST /api/watchlist creates a new item and returns 201."""
    payload = {
        "ticker": "MSFT",
        "target_buy_price": 300.0,
        "priority": 2,
        "notes": "Watch for earnings",
    }
    response = test_client.post("/api/watchlist", json=payload)
    assert response.status_code == 201
    body = response.json()
    assert body["success"] is True
    assert body["data"]["ticker"] == "MSFT"
    assert body["data"]["target_buy_price"] == 300.0
    assert body["data"]["priority"] == 2
    assert body["error"] is None


@pytest.mark.usefixtures("_seed_watchlist")
def test_create_duplicate_ticker_returns_422(test_client: TestClient) -> None:
    """POST /api/watchlist with duplicate ticker returns 422."""
    payload = {"ticker": "AAPL", "priority": 3}
    response = test_client.post("/api/watchlist", json=payload)
    assert response.status_code == 422
    body = response.json()
    assert body["success"] is False
    assert body["data"] is None
    assert "already on the watchlist" in body["error"]


def test_create_invalid_ticker_returns_422(test_client: TestClient) -> None:
    """POST /api/watchlist with invalid ticker format returns 422."""
    payload = {"ticker": "invalid"}
    response = test_client.post("/api/watchlist", json=payload)
    assert response.status_code == 422
    body = response.json()
    assert body["success"] is False


@pytest.mark.usefixtures("_seed_watchlist")
def test_update_watchlist_item(test_client: TestClient, db_session: Session) -> None:
    """PUT /api/watchlist/{id} updates item and returns 200."""
    item = db_session.query(WatchlistItem).filter_by(ticker="AAPL").first()
    assert item is not None
    payload = {"target_buy_price": 160.0, "priority": 2, "notes": "Updated note"}
    response = test_client.put(f"/api/watchlist/{item.id}", json=payload)
    assert response.status_code == 200
    body = response.json()
    assert body["success"] is True
    assert body["data"]["target_buy_price"] == 160.0
    assert body["data"]["priority"] == 2
    assert body["data"]["notes"] == "Updated note"
    assert body["error"] is None


def test_update_nonexistent_item_returns_404(test_client: TestClient) -> None:
    """PUT /api/watchlist/{id} with invalid id returns 404."""
    payload = {"priority": 1}
    response = test_client.put("/api/watchlist/9999", json=payload)
    assert response.status_code == 404
    body = response.json()
    assert body["success"] is False
    assert body["data"] is None
    assert "not found" in body["error"]


@pytest.mark.usefixtures("_seed_watchlist")
def test_delete_watchlist_item(test_client: TestClient, db_session: Session) -> None:
    """DELETE /api/watchlist/{id} removes item and returns 200."""
    item = db_session.query(WatchlistItem).filter_by(ticker="AAPL").first()
    assert item is not None
    response = test_client.delete(f"/api/watchlist/{item.id}")
    assert response.status_code == 200
    body = response.json()
    assert body["success"] is True
    assert body["data"] is None
    assert body["error"] is None


def test_delete_nonexistent_item_returns_404(test_client: TestClient) -> None:
    """DELETE /api/watchlist/{id} with invalid id returns 404."""
    response = test_client.delete("/api/watchlist/9999")
    assert response.status_code == 404
    body = response.json()
    assert body["success"] is False
    assert body["data"] is None
    assert "not found" in body["error"]
