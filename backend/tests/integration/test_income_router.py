"""Integration tests for the income and cash flow endpoints."""

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


PAYLOAD = {
    "name": "Paycheck",
    "category": "Salary",
    "amount": 3000,
    "frequency": "biweekly",
}


def test_crud_flow_and_summary(test_client: TestClient) -> None:
    created = test_client.post("/api/income", json=PAYLOAD)
    assert created.status_code == 201
    income = created.json()["data"]
    assert income["monthly_amount"] == 6500.0

    updated = test_client.put(
        f"/api/income/{income['id']}", json={"deposited_to": "Checking"}
    )
    assert updated.status_code == 200
    assert updated.json()["data"]["deposited_to"] == "Checking"

    summary = test_client.get("/api/cash-flow/summary").json()["data"]
    assert summary["monthly_income"] == 6500.0
    assert summary["kept_pct"] == 100.0
    assert summary["emergency_months"] is None

    assert test_client.delete(f"/api/income/{income['id']}").status_code == 200
    assert test_client.get("/api/income").json()["data"] == []


@pytest.mark.parametrize(
    "override",
    [{"amount": 0}, {"name": ""}, {"category": "Lottery"}, {"frequency": "daily"}],
)
def test_create_rejects_invalid_input(
    test_client: TestClient, override: dict[str, object]
) -> None:
    response = test_client.post("/api/income", json={**PAYLOAD, **override})
    assert response.status_code == 422
    assert response.json()["success"] is False


def test_missing_returns_404(test_client: TestClient) -> None:
    assert test_client.put("/api/income/999", json={"amount": 5}).status_code == 404
    assert test_client.delete("/api/income/999").status_code == 404


def test_linking_to_a_missing_account_returns_422(test_client: TestClient) -> None:
    bad = test_client.post(
        "/api/income", json={**PAYLOAD, "deposited_to_account_id": 999}
    )
    assert bad.status_code == 422
    assert bad.json()["success"] is False
