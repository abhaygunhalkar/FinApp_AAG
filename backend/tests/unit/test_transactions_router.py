"""Unit tests for the transactions router endpoints."""

from collections.abc import AsyncGenerator
from datetime import date

import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy.orm import Session

from app.database import get_db
from app.main import app
from app.models.cash_balance import CashBalance
from app.models.holding import Holding
from app.models.transaction import Transaction


@pytest.fixture()
async def async_client(db_session: Session) -> AsyncGenerator[AsyncClient, None]:
    """Provide an async HTTP test client with the test DB session."""

    def _override_get_db():  # type: ignore[no-untyped-def]
        yield db_session

    app.dependency_overrides[get_db] = _override_get_db

    transport = ASGITransport(app=app)  # type: ignore[arg-type]
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac

    app.dependency_overrides.clear()


class TestGetTransactions:
    """Tests for GET /api/transactions?holding_id={id}."""

    @pytest.mark.asyncio
    async def test_get_transactions_returns_200_with_list(
        self, db_session: Session, async_client: AsyncClient
    ) -> None:
        holding = Holding(
            ticker="AAPL",
            quantity=10.0,
            average_buy_price=150.0,
            current_price=160.0,
        )
        db_session.add(holding)
        db_session.commit()

        txn = Transaction(
            holding_id=holding.id,
            ticker="AAPL",
            transaction_type="buy",
            quantity=10.0,
            price=150.0,
            fees=5.0,
            transaction_date=date(2024, 1, 15),
        )
        db_session.add(txn)
        db_session.commit()

        response = await async_client.get(
            f"/api/transactions?holding_id={holding.id}"
        )

        assert response.status_code == 200
        body = response.json()
        assert body["success"] is True
        assert body["error"] is None
        assert len(body["data"]) == 1
        assert body["data"][0]["ticker"] == "AAPL"
        assert body["data"][0]["quantity"] == 10.0

    @pytest.mark.asyncio
    async def test_get_transactions_returns_empty_list(
        self, db_session: Session, async_client: AsyncClient
    ) -> None:
        holding = Holding(
            ticker="MSFT",
            quantity=5.0,
            average_buy_price=300.0,
            current_price=310.0,
        )
        db_session.add(holding)
        db_session.commit()

        response = await async_client.get(
            f"/api/transactions?holding_id={holding.id}"
        )

        assert response.status_code == 200
        body = response.json()
        assert body["success"] is True
        assert body["data"] == []

    @pytest.mark.asyncio
    async def test_get_transactions_returns_404_for_nonexistent_holding(
        self, async_client: AsyncClient
    ) -> None:
        response = await async_client.get("/api/transactions?holding_id=999")

        assert response.status_code == 404

    @pytest.mark.asyncio
    async def test_get_transactions_returns_422_without_holding_id(
        self, async_client: AsyncClient
    ) -> None:
        response = await async_client.get("/api/transactions")

        assert response.status_code == 422


class TestCreateTransaction:
    """Tests for POST /api/transactions."""

    @pytest.mark.asyncio
    async def test_create_buy_returns_201(
        self, db_session: Session, async_client: AsyncClient
    ) -> None:
        cash = CashBalance(balance=50000.0)
        db_session.add(cash)
        db_session.commit()

        payload = {
            "ticker": "AAPL",
            "transaction_type": "buy",
            "quantity": 10.0,
            "price": 150.0,
            "fees": 5.0,
            "transaction_date": "2024-01-15",
        }

        response = await async_client.post("/api/transactions", json=payload)

        assert response.status_code == 201
        body = response.json()
        assert body["success"] is True
        assert body["error"] is None
        assert body["data"]["ticker"] == "AAPL"
        assert body["data"]["transaction_type"] == "buy"
        assert body["data"]["quantity"] == 10.0

    @pytest.mark.asyncio
    async def test_create_sell_returns_201(
        self, db_session: Session, async_client: AsyncClient
    ) -> None:
        cash = CashBalance(balance=0.0)
        db_session.add(cash)
        holding = Holding(
            ticker="AAPL",
            quantity=20.0,
            average_buy_price=100.0,
            current_price=150.0,
        )
        db_session.add(holding)
        db_session.commit()

        payload = {
            "ticker": "AAPL",
            "transaction_type": "sell",
            "quantity": 5.0,
            "price": 150.0,
            "fees": 0.0,
            "transaction_date": "2024-03-01",
        }

        response = await async_client.post("/api/transactions", json=payload)

        assert response.status_code == 201
        body = response.json()
        assert body["success"] is True
        assert body["data"]["transaction_type"] == "sell"
        assert body["data"]["quantity"] == 5.0

    @pytest.mark.asyncio
    async def test_create_sell_exceeding_quantity_returns_422(
        self, db_session: Session, async_client: AsyncClient
    ) -> None:
        holding = Holding(
            ticker="AAPL",
            quantity=5.0,
            average_buy_price=100.0,
            current_price=150.0,
        )
        db_session.add(holding)
        db_session.commit()

        payload = {
            "ticker": "AAPL",
            "transaction_type": "sell",
            "quantity": 10.0,
            "price": 150.0,
            "fees": 0.0,
            "transaction_date": "2024-03-01",
        }

        response = await async_client.post("/api/transactions", json=payload)

        assert response.status_code == 422

    @pytest.mark.asyncio
    async def test_create_with_invalid_body_returns_422(
        self, async_client: AsyncClient
    ) -> None:
        payload = {
            "ticker": "aapl",  # invalid: must be uppercase
            "transaction_type": "buy",
            "quantity": -1,  # invalid: must be > 0
            "price": 150.0,
            "transaction_date": "2024-01-15",
        }

        response = await async_client.post("/api/transactions", json=payload)

        assert response.status_code == 422


class TestDeleteTransaction:
    """Tests for DELETE /api/transactions/{id}."""

    @pytest.mark.asyncio
    async def test_delete_returns_200(
        self, db_session: Session, async_client: AsyncClient
    ) -> None:
        cash = CashBalance(balance=10000.0)
        db_session.add(cash)
        holding = Holding(
            ticker="AAPL",
            quantity=10.0,
            average_buy_price=100.0,
            current_price=110.0,
        )
        db_session.add(holding)
        db_session.commit()

        txn = Transaction(
            holding_id=holding.id,
            ticker="AAPL",
            transaction_type="buy",
            quantity=10.0,
            price=100.0,
            fees=0.0,
            transaction_date=date(2024, 1, 1),
        )
        db_session.add(txn)
        db_session.commit()

        response = await async_client.delete(f"/api/transactions/{txn.id}")

        assert response.status_code == 200
        body = response.json()
        assert body["success"] is True
        assert body["data"] is None
        assert body["error"] is None

    @pytest.mark.asyncio
    async def test_delete_nonexistent_returns_404(
        self, async_client: AsyncClient
    ) -> None:
        response = await async_client.delete("/api/transactions/999")

        assert response.status_code == 404


class TestSellChosenLot:
    """Tests for POST /api/transactions with lots, then GET."""

    @pytest.mark.asyncio
    async def test_sell_from_a_chosen_lot_shows_what_is_left(
        self, db_session: Session, async_client: AsyncClient
    ) -> None:
        holding = Holding(
            ticker="NVDA",
            quantity=15.0,
            average_buy_price=110.0,
            current_price=200.0,
            broker="Schwab",
        )
        db_session.add(holding)
        db_session.commit()
        old = Transaction(
            holding_id=holding.id,
            ticker="NVDA",
            transaction_type="buy",
            quantity=10.0,
            price=100.0,
            fees=0.0,
            transaction_date=date(2025, 1, 2),
        )
        new = Transaction(
            holding_id=holding.id,
            ticker="NVDA",
            transaction_type="buy",
            quantity=5.0,
            price=130.0,
            fees=0.0,
            transaction_date=date(2025, 3, 2),
        )
        db_session.add_all([old, new])
        db_session.commit()

        response = await async_client.post(
            "/api/transactions",
            json={
                "ticker": "NVDA",
                "transaction_type": "sell",
                "quantity": 2,
                "price": 200,
                "transaction_date": "2025-04-01",
                "holding_id": holding.id,
                "lots": [{"buy_transaction_id": new.id, "quantity": 2}],
            },
        )
        assert response.status_code == 201
        assert response.json()["data"]["lots"][0]["price"] == 130.0

        listed = await async_client.get(
            "/api/transactions", params={"holding_id": holding.id}
        )
        left = {
            t["id"]: t["remaining_quantity"]
            for t in listed.json()["data"]
            if t["transaction_type"] == "buy"
        }
        assert left == {old.id: 10.0, new.id: 3.0}
