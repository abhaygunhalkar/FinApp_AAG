"""Integration tests for confirming a manual account's balance."""

from collections.abc import Generator

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.database import get_db
from app.main import app


@pytest.fixture()
def test_client(db_session: Session) -> Generator[TestClient, None, None]:
    """Provide a synchronous test client with the test DB session injected."""

    def _override_get_db() -> Generator[Session, None, None]:
        yield db_session

    app.dependency_overrides[get_db] = _override_get_db
    with TestClient(app) as tc:
        yield tc
    app.dependency_overrides.clear()


def test_confirm_keeps_the_balance(test_client: TestClient) -> None:
    created = test_client.post(
        "/api/net-worth/accounts",
        json={"name": "Car loan", "account_type": "loan", "balance": 14302},
    ).json()["data"]

    res = test_client.post(f"/api/net-worth/accounts/{created['id']}/confirm")

    assert res.status_code == 200
    body = res.json()
    assert body["success"] is True
    assert body["data"]["balance"] == 14302
    assert body["data"]["last_synced"] >= created["last_synced"]


def test_confirm_missing_account_returns_404(test_client: TestClient) -> None:
    res = test_client.post("/api/net-worth/accounts/999/confirm")

    assert res.status_code == 404
    assert res.json() == {"success": False, "data": None, "error": "Account not found"}
