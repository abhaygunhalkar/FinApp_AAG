"""Repository for sell-to-buy lot allocations."""

from sqlalchemy import func
from sqlalchemy.orm import Session

from app.models.sell_lot_allocation import SellLotAllocation


class LotAllocationRepository:
    """Data access layer for sell lot allocations."""

    @staticmethod
    def get_all(db: Session) -> list[SellLotAllocation]:
        """Retrieve every allocation."""
        return list(db.query(SellLotAllocation).all())

    @staticmethod
    def get_by_sells(db: Session, sell_ids: list[int]) -> list[SellLotAllocation]:
        """Retrieve the allocations of the given sell transactions."""
        if not sell_ids:
            return []
        return list(
            db.query(SellLotAllocation)
            .filter(SellLotAllocation.sell_transaction_id.in_(sell_ids))
            .order_by(SellLotAllocation.id)
            .all()
        )

    @staticmethod
    def get_by_buy(db: Session, buy_id: int) -> list[SellLotAllocation]:
        """Retrieve the allocations that sold from one buy lot."""
        return list(
            db.query(SellLotAllocation)
            .filter(SellLotAllocation.buy_transaction_id == buy_id)
            .all()
        )

    @staticmethod
    def sold_by_buy(db: Session, buy_ids: list[int]) -> dict[int, float]:
        """Total shares already sold from each of the given buy lots."""
        if not buy_ids:
            return {}
        rows = (
            db.query(
                SellLotAllocation.buy_transaction_id,
                func.sum(SellLotAllocation.quantity),
            )
            .filter(SellLotAllocation.buy_transaction_id.in_(buy_ids))
            .group_by(SellLotAllocation.buy_transaction_id)
            .all()
        )
        return {buy_id: float(total) for buy_id, total in rows}

    @staticmethod
    def create_many(db: Session, allocations: list[SellLotAllocation]) -> None:
        """Save allocations in one commit."""
        try:
            db.add_all(allocations)
            db.commit()
        except Exception:
            db.rollback()
            raise

    @staticmethod
    def delete_by_sell(db: Session, sell_id: int) -> None:
        """Remove a sell's allocations, returning its shares to their lots."""
        try:
            db.query(SellLotAllocation).filter(
                SellLotAllocation.sell_transaction_id == sell_id
            ).delete()
            db.commit()
        except Exception:
            db.rollback()
            raise
