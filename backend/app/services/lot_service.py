"""Buy lots: what is left of each one, and which lots a sell takes from.

A lot is one buy transaction. Lots belong to a holding, and a holding is one
ticker at one broker, so a sell can only ever take shares bought in the same
brokerage account.
"""

from datetime import date

from fastapi import HTTPException
from sqlalchemy.orm import Session

from app.models.holding import Holding
from app.models.transaction import Transaction
from app.repositories.lot_allocation_repository import LotAllocationRepository
from app.repositories.transaction_repository import TransactionRepository
from app.schemas.transaction import LotSelection

# Quantities are floats; anything closer than this counts as equal.
EPSILON = 1e-6


def lot_order(txn: Transaction) -> tuple[date, bool, int]:
    """Chronological order, buys before sells on the same day."""
    return (txn.transaction_date, txn.transaction_type != "buy", txn.id)


class LotService:
    """Business logic for buy lots and sell allocations."""

    @staticmethod
    def remaining_by_lot(db: Session, buys: list[Transaction]) -> dict[int, float]:
        """Shares of each buy lot not yet sold."""
        sold = LotAllocationRepository.sold_by_buy(db, [b.id for b in buys])
        return {b.id: max(b.quantity - sold.get(b.id, 0.0), 0.0) for b in buys}

    @staticmethod
    def open_lots(
        db: Session, holding_id: int, as_of: date | None = None
    ) -> list[tuple[Transaction, float]]:
        """Lots of a holding that still have shares, oldest first.

        With `as_of`, only lots bought on or before that day: a sale can't
        take shares bought after it.
        """
        buys = [
            t
            for t in TransactionRepository.get_by_holding(db, holding_id)
            if t.transaction_type == "buy"
            and (as_of is None or t.transaction_date <= as_of)
        ]
        remaining = LotService.remaining_by_lot(db, buys)
        return [
            (b, remaining[b.id])
            for b in sorted(buys, key=lot_order)
            if remaining[b.id] > EPSILON
        ]

    @staticmethod
    def plan_sell(
        db: Session,
        holding: Holding,
        quantity: float,
        sell_date: date,
        lots: list[LotSelection] | None,
    ) -> list[tuple[Transaction, float]]:
        """Decide which lots a sell takes its shares from.

        Chosen lots must be buys of this same holding (same ticker and broker),
        bought on or before the sale, with enough shares left. Without a
        choice the oldest lots go first. The plan may cover fewer shares than
        the sell when the holding has shares with no recorded buy.
        """
        if lots is None:
            plan: list[tuple[Transaction, float]] = []
            left = quantity
            for buy, available in LotService.open_lots(db, holding.id, sell_date):
                if left <= EPSILON:
                    break
                take = min(available, left)
                plan.append((buy, take))
                left -= take
            return plan

        buys = {
            t.id: t
            for t in TransactionRepository.get_by_ids(
                db, [lot.buy_transaction_id for lot in lots]
            )
        }
        remaining = LotService.remaining_by_lot(db, list(buys.values()))
        account = holding.broker or "no broker"
        plan = []
        for lot in lots:
            chosen = buys.get(lot.buy_transaction_id)
            if chosen is None or chosen.transaction_type != "buy":
                raise HTTPException(
                    status_code=422,
                    detail=f"Lot {lot.buy_transaction_id} is not a buy",
                )
            if chosen.holding_id != holding.id:
                raise HTTPException(
                    status_code=422,
                    detail=(
                        f"Lot {chosen.id} is in another account; this sell can "
                        f"only use {holding.ticker} lots at {account}"
                    ),
                )
            if chosen.transaction_date > sell_date:
                raise HTTPException(
                    status_code=422,
                    detail=(
                        f"The lot bought on {chosen.transaction_date} is after "
                        f"the sale date {sell_date}"
                    ),
                )
            if lot.quantity > remaining[chosen.id] + EPSILON:
                raise HTTPException(
                    status_code=422,
                    detail=(
                        f"The lot bought on {chosen.transaction_date} has only "
                        f"{remaining[chosen.id]:g} shares left"
                    ),
                )
            plan.append((chosen, lot.quantity))
        return plan

    @staticmethod
    def cost_basis_by_sell(db: Session) -> dict[int, float]:
        """Average cost per share of each sell, from the lots it sold.

        A sell with no recorded lots (one written straight to the database)
        takes the oldest shares still left in its holding, or in its ticker
        once the holding is closed.
        """
        allocations = LotAllocationRepository.get_all(db)
        transactions = TransactionRepository.get_all_ordered(db)
        by_id = {t.id: t for t in transactions}
        cost: dict[int, float] = {}
        shares: dict[int, float] = {}
        sold: dict[int, float] = {}
        for a in allocations:
            buy = by_id.get(a.buy_transaction_id)
            if buy is None:
                continue
            sid = a.sell_transaction_id
            cost[sid] = cost.get(sid, 0.0) + a.quantity * buy.price
            shares[sid] = shares.get(sid, 0.0) + a.quantity
            sold[buy.id] = sold.get(buy.id, 0.0) + a.quantity

        recorded = {a.sell_transaction_id for a in allocations}
        # holding (or ticker) -> [[shares left, price]], oldest first
        queues: dict[int | str, list[list[float]]] = {}
        for t in sorted(transactions, key=lot_order):
            queue = queues.setdefault(
                t.holding_id if t.holding_id is not None else t.ticker, []
            )
            if t.transaction_type == "buy":
                queue.append([t.quantity - sold.get(t.id, 0.0), t.price])
                continue
            if t.id in recorded:
                continue
            left = t.quantity
            for lot in queue:
                if left <= EPSILON:
                    break
                take = min(lot[0], left)
                if take <= EPSILON:
                    continue
                lot[0] -= take
                left -= take
                cost[t.id] = cost.get(t.id, 0.0) + take * lot[1]
                shares[t.id] = shares.get(t.id, 0.0) + take

        return {sid: cost[sid] / shares[sid] for sid in cost if shares[sid] > 0}
