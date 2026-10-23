"""Integration tests for the recurring expenses router endpoints."""

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
    "name": "Car insurance",
    "category": "Transportation",
    "amount": 980,
    "frequency": "semiannual",
    "next_due_date": "2027-01-20",
    "paid_from": "Credit card",
    "autopay": False,
}


def test_crud_flow(test_client: TestClient) -> None:
    assert test_client.get("/api/recurring-expenses").json()["data"] == []

    created = test_client.post("/api/recurring-expenses", json=PAYLOAD)
    assert created.status_code == 201
    body = created.json()
    assert body["success"] is True
    expense = body["data"]
    assert expense["monthly_amount"] == pytest.approx(163.33)
    assert expense["next_due_date"] == "2027-01-20"

    updated = test_client.put(
        f"/api/recurring-expenses/{expense['id']}",
        json={"autopay": True, "amount": 1000},
    )
    assert updated.status_code == 200
    assert updated.json()["data"]["autopay"] is True
    assert updated.json()["data"]["amount"] == 1000

    listed = test_client.get("/api/recurring-expenses").json()["data"]
    assert len(listed) == 1

    deleted = test_client.delete(f"/api/recurring-expenses/{expense['id']}")
    assert deleted.status_code == 200
    assert test_client.get("/api/recurring-expenses").json()["data"] == []


@pytest.mark.parametrize(
    "override",
    [{"amount": 0}, {"name": ""}, {"category": "Groceries"}, {"frequency": "daily"}],
)
def test_create_rejects_invalid_input(
    test_client: TestClient, override: dict[str, object]
) -> None:
    response = test_client.post("/api/recurring-expenses", json={**PAYLOAD, **override})
    assert response.status_code == 422
    body = response.json()
    assert body["success"] is False
    assert body["details"]


@pytest.mark.parametrize(
    "category",
    ["Auto loans", "Kids activities", "Charity & social service", "Health & fitness"],
)
def test_create_accepts_new_categories(test_client: TestClient, category: str) -> None:
    response = test_client.post(
        "/api/recurring-expenses", json={**PAYLOAD, "category": category}
    )
    assert response.status_code == 201
    assert response.json()["data"]["category"] == category


def test_update_and_delete_missing_return_404(test_client: TestClient) -> None:
    put = test_client.put("/api/recurring-expenses/999", json={"amount": 5})
    assert put.status_code == 404
    assert put.json()["success"] is False
    assert test_client.delete("/api/recurring-expenses/999").status_code == 404
