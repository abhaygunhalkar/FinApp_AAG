"""Unit tests for selling specific buy lots within one broker account."""

from datetime import date

import pytest
from fastapi import HTTPException
from pydantic import ValidationError
from sqlalchemy.orm import Session

from app.models.holding import Holding
from app.models.transaction import Transaction
from app.schemas.transaction import LotSelection, TransactionCreate
from app.services.dashboard_service import DashboardService
from app.services.lot_service import LotService
from app.services.transaction_service import TransactionService


def _holding(
    db: Session, broker: str, qty: float, price: float, day: int
) -> tuple[Holding, int]:
    """A holding with its first lot, as the Add Holding flow creates it."""
    holding = Holding(
        ticker="NVDA",
        quantity=qty,
        average_buy_price=price,
        current_price=200.0,
        broker=broker,
    )
    db.add(holding)
    db.commit()
    first = Transaction(
        holding_id=holding.id,
        ticker="NVDA",
        transaction_type="buy",
        quantity=qty,
        price=price,
        fees=0.0,
        transaction_date=date(2025, 1, day),
    )
    db.add(first)
    db.commit()
    return holding, first.id


def _buy(db: Session, holding: Holding, qty: float, price: float, day: int) -> int:
    return TransactionService.create_transaction(
        db,
        TransactionCreate(
            ticker="NVDA",
            transaction_type="buy",
            quantity=qty,
            price=price,
            transaction_date=date(2025, 1, day),
            holding_id=holding.id,
        ),
    ).id


def _sell(
    db: Session,
    holding: Holding,
    qty: float,
    lots: list[tuple[int, float]] | None = None,
    price: float = 200.0,
    day: int = 28,
) -> int:
    return TransactionService.create_transaction(
        db,
        TransactionCreate(
            ticker="NVDA",
            transaction_type="sell",
            quantity=qty,
            price=price,
            transaction_date=date(2025, 1, day),
            holding_id=holding.id,
            lots=(
                None
                if lots is None
                else [LotSelection(buy_transaction_id=b, quantity=q) for b, q in lots]
            ),
        ),
    ).id


def _remaining(db: Session, holding: Holding) -> dict[int, float | None]:
    return {
        t.id: t.remaining_quantity
        for t in TransactionService.get_transactions(db, holding.id)
        if t.transaction_type == "buy"
    }


@pytest.fixture
def two_brokers(db_session: Session) -> dict[str, object]:
    """NVDA at two brokers: 4 lots at Schwab and 6 at Merrill."""
    schwab, first = _holding(db_session, "Schwab", 10, 100, 1)
    schwab_lots = [first] + [
        _buy(db_session, schwab, 10, 100 + i * 10, i + 1) for i in range(1, 4)
    ]
    merrill, first = _holding(db_session, "Merrill", 5, 150, 5)
    merrill_lots = [first] + [
        _buy(db_session, merrill, 5, 150 + i * 5, i + 5) for i in range(1, 6)
    ]
    return {
        "schwab": schwab,
        "merrill": merrill,
        "schwab_lots": schwab_lots,
        "merrill_lots": merrill_lots,
    }


class TestSellChosenLots:
    def test_sells_part_of_a_chosen_lot_in_its_own_account(
        self, db_session: Session, two_brokers: dict[str, object]
    ) -> None:
        schwab = two_brokers["schwab"]
        merrill = two_brokers["merrill"]
        merrill_lots = two_brokers["merrill_lots"]
        assert isinstance(schwab, Holding) and isinstance(merrill, Holding)
        assert isinstance(merrill_lots, list)

        sell_id = _sell(db_session, merrill, 3, [(merrill_lots[4], 3)])

        db_session.refresh(schwab)
        db_session.refresh(merrill)
        assert schwab.quantity == 40
        assert merrill.quantity == 27
        assert _remaining(db_session, merrill)[merrill_lots[4]] == 2
        assert all(q == 10 for q in _remaining(db_session, schwab).values())
        sell = next(
            t
            for t in TransactionService.get_transactions(db_session, merrill.id)
            if t.id == sell_id
        )
        assert sell.broker == "Merrill"
        assert [(lot.buy_transaction_id, lot.quantity) for lot in sell.lots] == [
            (merrill_lots[4], 3)
        ]

    def test_sells_the_rest_of_a_lot_and_spans_several_lots(
        self, db_session: Session, two_brokers: dict[str, object]
    ) -> None:
        merrill = two_brokers["merrill"]
        lots = two_brokers["merrill_lots"]
        assert isinstance(merrill, Holding) and isinstance(lots, list)

        _sell(db_session, merrill, 3, [(lots[2], 3)])
        _sell(db_session, merrill, 7, [(lots[2], 2), (lots[5], 5)])

        remaining = _remaining(db_session, merrill)
        assert remaining[lots[2]] == 0
        assert remaining[lots[5]] == 0
        assert remaining[lots[0]] == 5

    def test_rejects_a_lot_from_another_broker(
        self, db_session: Session, two_brokers: dict[str, object]
    ) -> None:
        merrill = two_brokers["merrill"]
        schwab_lots = two_brokers["schwab_lots"]
        assert isinstance(merrill, Holding) and isinstance(schwab_lots, list)

        with pytest.raises(HTTPException) as exc:
            _sell(db_session, merrill, 2, [(schwab_lots[0], 2)])
        assert exc.value.status_code == 422
        assert "Merrill" in str(exc.value.detail)

    def test_rejects_more_shares_than_the_lot_has_left(
        self, db_session: Session, two_brokers: dict[str, object]
    ) -> None:
        merrill = two_brokers["merrill"]
        lots = two_brokers["merrill_lots"]
        assert isinstance(merrill, Holding) and isinstance(lots, list)

        _sell(db_session, merrill, 4, [(lots[1], 4)])
        with pytest.raises(HTTPException) as exc:
            _sell(db_session, merrill, 2, [(lots[1], 2)])
        assert "only 1 shares left" in str(exc.value.detail)

    def test_rejects_a_lot_bought_after_the_sale(
        self, db_session: Session, two_brokers: dict[str, object]
    ) -> None:
        merrill = two_brokers["merrill"]
        lots = two_brokers["merrill_lots"]
        assert isinstance(merrill, Holding) and isinstance(lots, list)

        with pytest.raises(HTTPException) as exc:
            _sell(db_session, merrill, 1, [(lots[5], 1)], day=6)
        assert "after the sale date" in str(exc.value.detail)

    def test_lots_must_add_up_to_the_quantity(self) -> None:
        with pytest.raises(ValidationError):
            TransactionCreate(
                ticker="NVDA",
                transaction_type="sell",
                quantity=5,
                price=1,
                transaction_date=date(2025, 1, 1),
                lots=[LotSelection(buy_transaction_id=1, quantity=4)],
            )

    def test_average_cost_is_what_the_remaining_lots_cost(
        self, db_session: Session, two_brokers: dict[str, object]
    ) -> None:
        schwab = two_brokers["schwab"]
        lots = two_brokers["schwab_lots"]
        assert isinstance(schwab, Holding) and isinstance(lots, list)

        # Lots cost 100, 110, 120, 130; selling the 130 lot leaves 110 average.
        _sell(db_session, schwab, 10, [(lots[3], 10)])

        db_session.refresh(schwab)
        assert schwab.quantity == 30
        assert schwab.average_buy_price == pytest.approx(110)

    def test_realized_gain_uses_the_chosen_lot(
        self, db_session: Session, two_brokers: dict[str, object]
    ) -> None:
        schwab = two_brokers["schwab"]
        lots = two_brokers["schwab_lots"]
        assert isinstance(schwab, Holding) and isinstance(lots, list)

        _sell(db_session, schwab, 5, [(lots[3], 5)], price=200)

        summary = DashboardService.get_summary(db_session)
        assert summary.realized_gain == pytest.approx((200 - 130) * 5)


class TestSellDefaultLots:
    def test_takes_oldest_lots_of_the_same_broker_only(
        self, db_session: Session, two_brokers: dict[str, object]
    ) -> None:
        merrill = two_brokers["merrill"]
        lots = two_brokers["merrill_lots"]
        schwab = two_brokers["schwab"]
        assert isinstance(merrill, Holding) and isinstance(lots, list)
        assert isinstance(schwab, Holding)

        _sell(db_session, merrill, 7)

        remaining = _remaining(db_session, merrill)
        assert remaining[lots[0]] == 0
        assert remaining[lots[1]] == 3
        db_session.refresh(schwab)
        assert schwab.quantity == 40

    def test_ticker_at_two_brokers_needs_a_holding(
        self, db_session: Session, two_brokers: dict[str, object]
    ) -> None:
        with pytest.raises(HTTPException) as exc:
            TransactionService.create_transaction(
                db_session,
                TransactionCreate(
                    ticker="NVDA",
                    transaction_type="sell",
                    quantity=1,
                    price=1,
                    transaction_date=date(2025, 2, 1),
                ),
            )
        assert "more than one broker" in str(exc.value.detail)

    def test_broker_name_picks_the_holding(
        self, db_session: Session, two_brokers: dict[str, object]
    ) -> None:
        merrill = two_brokers["merrill"]
        assert isinstance(merrill, Holding)

        TransactionService.create_transaction(
            db_session,
            TransactionCreate(
                ticker="NVDA",
                transaction_type="sell",
                quantity=1,
                price=1,
                transaction_date=date(2025, 2, 1),
                broker="Merrill",
            ),
        )
        db_session.refresh(merrill)
        assert merrill.quantity == 29


class TestDeleteWithLots:
    def test_a_sold_lot_cannot_be_deleted(
        self, db_session: Session, two_brokers: dict[str, object]
    ) -> None:
        merrill = two_brokers["merrill"]
        lots = two_brokers["merrill_lots"]
        assert isinstance(merrill, Holding) and isinstance(lots, list)

        _sell(db_session, merrill, 2, [(lots[0], 2)])
        with pytest.raises(HTTPException) as exc:
            TransactionService.delete_transaction(db_session, lots[0])
        assert "Delete those sells first" in str(exc.value.detail)

    def test_deleting_a_sell_returns_shares_to_its_lot(
        self, db_session: Session, two_brokers: dict[str, object]
    ) -> None:
        schwab = two_brokers["schwab"]
        lots = two_brokers["schwab_lots"]
        assert isinstance(schwab, Holding) and isinstance(lots, list)

        sell_id = _sell(db_session, schwab, 10, [(lots[3], 10)])
        TransactionService.delete_transaction(db_session, sell_id)

        assert _remaining(db_session, schwab)[lots[3]] == 10
        db_session.refresh(schwab)
        assert schwab.quantity == 40
        assert schwab.average_buy_price == pytest.approx(115)

    def test_replay_keeps_chosen_lots_after_another_delete(
        self, db_session: Session, two_brokers: dict[str, object]
    ) -> None:
        schwab = two_brokers["schwab"]
        lots = two_brokers["schwab_lots"]
        assert isinstance(schwab, Holding) and isinstance(lots, list)

        _sell(db_session, schwab, 10, [(lots[3], 10)])
        # Deleting the unsold 100 lot leaves the 110 and 120 lots.
        TransactionService.delete_transaction(db_session, lots[0])

        db_session.refresh(schwab)
        assert schwab.quantity == 20
        assert schwab.average_buy_price == pytest.approx(115)


class TestSellBroker:
    def test_sells_without_a_broker_get_one_from_their_account(
        self, db_session: Session, two_brokers: dict[str, object]
    ) -> None:
        schwab = two_brokers["schwab"]
        merrill = two_brokers["merrill"]
        assert isinstance(schwab, Holding) and isinstance(merrill, Holding)

        def old_sell(ticker: str, holding_id: int | None) -> int:
            txn = Transaction(
                holding_id=holding_id,
                ticker=ticker,
                transaction_type="sell",
                quantity=1,
                price=1,
                fees=0.0,
                transaction_date=date(2025, 2, 1),
            )
            db_session.add(txn)
            db_session.commit()
            return txn.id

        in_holding = old_sell("NVDA", merrill.id)
        db_session.add(
            Transaction(
                ticker="AMD",
                transaction_type="buy",
                quantity=1,
                price=1,
                fees=0.0,
                transaction_date=date(2025, 1, 1),
                broker="Schwab",
            )
        )
        closed = old_sell("AMD", None)
        ambiguous = old_sell("NVDA", None)

        brokers = LotService.broker_by_sell(db_session, [schwab, merrill])
        assert brokers[in_holding] == "Merrill"
        assert brokers[closed] == "Schwab"
        assert ambiguous not in brokers
