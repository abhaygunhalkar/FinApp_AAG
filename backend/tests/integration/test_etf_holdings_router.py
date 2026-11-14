"""Integration tests for the ETF holdings router endpoints."""

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
    def _override_get_db() -> Generator[Session, None, None]:
        yield db_session

    app.dependency_overrides[get_db] = _override_get_db
    with TestClient(app) as tc:
        yield tc
    app.dependency_overrides.clear()


@pytest.fixture()
def _seed_cash(db_session: Session) -> None:
    cash = CashBalance(id=1, balance=50000.0)
    db_session.add(cash)
    db_session.commit()


@pytest.fixture()
def _seed_holding(db_session: Session) -> None:
    cash = CashBalance(id=1, balance=5000.0)
    db_session.add(cash)
    holding = Holding(
        ticker="AAPL",
        company_name="Apple Inc.",
        quantity=10.0,
        average_buy_price=150.0,
        current_price=175.0,
        holding_type="stock",
        sector="Technology",
        industry="Consumer Electronics",
        dividend_yield=0.005,
    )
    db_session.add(holding)
    db_session.commit()


def test_get_etf_holdings_empty(test_client: TestClient) -> None:
    response = test_client.get("/api/etf-holdings")
    assert response.status_code == 200
    body = response.json()
    assert body["success"] is True
    assert body["data"] == []
    assert body["error"] is None


@pytest.mark.usefixtures("_seed_cash")
def test_create_etf_holding_returns_201(test_client: TestClient) -> None:
    payload = {
        "ticker": "IVV",
        "quantity": 2.0,
        "buy_price": 450.0,
        "company_name": "iShares Core S&P 500 ETF",
        "sector": "ETF",
    }
    response = test_client.post("/api/etf-holdings", json=payload)
    assert response.status_code == 201
    body = response.json()
    assert body["success"] is True
    assert body["error"] is None
    assert body["data"]["ticker"] == "IVV"
    assert body["data"]["holding_type"] == "etf"


# _seed_holding already adds the cash balance.
@pytest.mark.usefixtures("_seed_holding", "offline_market")
def test_get_etf_holdings_filters_by_type(test_client: TestClient) -> None:
    # Create one ETF holding in addition to the seeded stock holding.
    payload = {
        "ticker": "VTI",
        "quantity": 3.0,
        "buy_price": 200.0,
        "company_name": "Vanguard Total Stock Market ETF",
        "sector": "ETF",
    }
    response = test_client.post("/api/etf-holdings", json=payload)
    assert response.status_code == 201

    response = test_client.get("/api/etf-holdings")
    assert response.status_code == 200
    body = response.json()
    assert body["success"] is True
    assert len(body["data"]) == 1
    assert body["data"][0]["ticker"] == "VTI"
    assert body["data"][0]["holding_type"] == "etf"
