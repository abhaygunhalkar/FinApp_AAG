"""Integration tests for GET /api/plaid/items (no calls to Plaid itself)."""

from datetime import datetime

from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.models.financial_account import FinancialAccount
from app.models.plaid_item import PlaidItem


def test_items_list_institutions_with_their_account_counts(
    client: TestClient, db_session: Session
) -> None:
    synced = datetime(2026, 11, 13, 9, 30, 15, 123456)
    chase = PlaidItem(
        item_id="item-chase",
        access_token="secret",
        institution_name="Chase",
        last_synced=synced,
    )
    never = PlaidItem(item_id="item-new", access_token="secret")
    db_session.add_all([chase, never])
    db_session.commit()
    db_session.add_all(
        FinancialAccount(
            name=f"Account {n}",
            account_type="checking",
            balance=1,
            plaid_item_id=chase.id,
        )
        for n in range(2)
    )
    db_session.commit()

    body = client.get("/api/plaid/items").json()

    assert body["success"] is True
    assert body["data"] == [
        {
            "id": chase.id,
            "item_id": "item-chase",
            "institution_name": "Chase",
            # Same text as datetime.isoformat(), as before the schema existed.
            "last_synced": synced.isoformat(),
            "account_count": 2,
        },
        {
            "id": never.id,
            "item_id": "item-new",
            "institution_name": None,
            "last_synced": None,
            "account_count": 0,
        },
    ]
    # The access token never leaves the server.
    assert "secret" not in str(body)


def test_disconnecting_an_unknown_item_is_404(client: TestClient) -> None:
    response = client.delete("/api/plaid/items/nope")
    assert response.status_code == 404
    assert response.json()["error"] == "Plaid item not found"
