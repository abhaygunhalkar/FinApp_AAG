"""Service layer for transaction business logic."""

from fastapi import HTTPException
from sqlalchemy.orm import Session

from app.models.holding import Holding
from app.models.sell_lot_allocation import SellLotAllocation
from app.models.transaction import Transaction
from app.repositories.cash_balance_repository import CashBalanceRepository
from app.repositories.holdings_repository import HoldingsRepository
from app.repositories.lot_allocation_repository import LotAllocationRepository
from app.repositories.transaction_repository import TransactionRepository
from app.schemas.transaction import (
    LotAllocationResponse,
    TransactionCreate,
    TransactionResponse,
)
from app.services.lot_service import EPSILON, LotService, lot_order


class TransactionService:
    """Business logic for transaction operations including buy/sell processing."""

    @staticmethod
    def get_transactions(db: Session, holding_id: int) -> list[TransactionResponse]:
        """Retrieve all transactions for a holding ordered by date descending.

        Buys carry the shares still left in that lot; sells carry the lots
        they sold from.

        Raises HTTPException 404 if the holding does not exist.
        """
        holding = HoldingsRepository.get_by_id(db, holding_id)
        if holding is None:
            raise HTTPException(status_code=404, detail="Holding not found")

        transactions = TransactionRepository.get_by_holding(db, holding_id)
        return TransactionService._with_lots(db, transactions)

    @staticmethod
    def _with_lots(
        db: Session, transactions: list[Transaction]
    ) -> list[TransactionResponse]:
        """Build responses with each buy's remaining shares and each sell's lots."""
        buys = [t for t in transactions if t.transaction_type == "buy"]
        remaining = LotService.remaining_by_lot(db, buys)
        allocations = LotAllocationRepository.get_by_sells(
            db, [t.id for t in transactions if t.transaction_type == "sell"]
        )
        lot_buys = {
            t.id: t
            for t in TransactionRepository.get_by_ids(
                db, list({a.buy_transaction_id for a in allocations})
            )
        }
        lots_by_sell: dict[int, list[LotAllocationResponse]] = {}
        for a in allocations:
            buy = lot_buys.get(a.buy_transaction_id)
            if buy is None:
                continue
            lots_by_sell.setdefault(a.sell_transaction_id, []).append(
                LotAllocationResponse(
                    buy_transaction_id=buy.id,
                    quantity=a.quantity,
                    price=buy.price,
                    transaction_date=buy.transaction_date,
                )
            )

        responses = []
        for t in transactions:
            response = TransactionResponse.model_validate(t)
            if t.transaction_type == "buy":
                response.remaining_quantity = round(remaining[t.id], 8)
            else:
                response.lots = lots_by_sell.get(t.id, [])
            responses.append(response)
        return responses

    @staticmethod
    def create_transaction(db: Session, data: TransactionCreate) -> TransactionResponse:
        """Create a buy or sell transaction and update the holding accordingly.

        The holding is one ticker at one broker: `holding_id` names it, or it
        is found from ticker and broker.

        Buy logic:
        - If no holding exists for the ticker at that broker, create one.
        - Recalculate weighted average buy price.
        - Increase holding quantity.
        - Decrease cash balance by (price × quantity + fees).

        Sell logic:
        - Reject if sell quantity > holding quantity (HTTPException 422).
        - Take the shares from the chosen lots of this holding, or the oldest
          lots first, and record which lots were sold.
        - Decrease holding quantity; the average buy price becomes the
          average of the shares left.
        - Increase cash balance by (price × quantity - fees).
        - If quantity becomes 0, remove the holding.
        """
        HoldingsRepository.delete_zero_quantity_holdings(db)

        if data.transaction_type == "buy":
            return TransactionService._process_buy(db, data)
        else:
            return TransactionService._process_sell(db, data)

    @staticmethod
    def delete_transaction(db: Session, transaction_id: int) -> None:
        """Delete a transaction and recalculate the holding.

        - A buy lot that a sell took shares from can't be deleted until that
          sell is deleted (HTTPException 422).
        - Deleting a sell returns its shares to the lots it sold from.
        - Replay the remaining transactions to recalculate the holding's
          average_buy_price and quantity.
        - If no transactions remain, delete the holding.
        - Adjust cash balance accordingly.
        """
        transaction = TransactionRepository.get_by_id(db, transaction_id)
        if transaction is None:
            raise HTTPException(status_code=404, detail="Transaction not found")

        if transaction.transaction_type == "buy":
            used_by = LotAllocationRepository.get_by_buy(db, transaction_id)
            if used_by:
                sells = TransactionRepository.get_by_ids(
                    db, list({a.sell_transaction_id for a in used_by})
                )
                dates = ", ".join(sorted(str(s.transaction_date) for s in sells))
                raise HTTPException(
                    status_code=422,
                    detail=(
                        "Shares from this lot were sold "
                        f"({dates}). Delete those sells first."
                    ),
                )

        holding_id = transaction.holding_id
        transaction_type = transaction.transaction_type
        quantity = transaction.quantity
        price = transaction.price
        fees = transaction.fees

        # Reverse the cash balance effect of the deleted transaction
        cash_balance = CashBalanceRepository.get_balance(db)
        if transaction_type == "buy":
            # Buy decreased cash, so we add back
            new_balance = cash_balance.balance + (price * quantity + fees)
        else:
            # Sell increased cash, so we subtract back
            new_balance = cash_balance.balance - (price * quantity - fees)
        CashBalanceRepository.update_balance(db, new_balance)

        if transaction_type == "sell":
            LotAllocationRepository.delete_by_sell(db, transaction_id)

        # Delete the transaction
        TransactionRepository.delete(db, transaction_id)

        # Recalculate the holding from remaining transactions
        if holding_id is not None:
            TransactionService._recalculate_holding(db, holding_id)

    @staticmethod
    def _recalculate_holding(db: Session, holding_id: int) -> None:
        """Recalculate holding by replaying all remaining transactions.

        Replays in chronological order, keeping what is left of each buy lot.
        A sell takes its shares from the lots it recorded; any shares a sell
        has no lots for come out of every open lot evenly. The holding's
        quantity and average buy price are what the lots have left.
        If no transactions remain, delete the holding.
        """
        remaining = TransactionRepository.get_by_holding(db, holding_id)

        if not remaining:
            # No transactions left, delete the holding
            HoldingsRepository.delete(db, holding_id)
            return

        allocations: dict[int, list[SellLotAllocation]] = {}
        for a in LotAllocationRepository.get_by_sells(
            db, [t.id for t in remaining if t.transaction_type == "sell"]
        ):
            allocations.setdefault(a.sell_transaction_id, []).append(a)

        # buy id -> [shares left, price]
        lots: dict[int, list[float]] = {}
        for txn in sorted(remaining, key=lot_order):
            if txn.transaction_type == "buy":
                lots[txn.id] = [txn.quantity, txn.price]
                continue
            unmatched = txn.quantity
            for a in allocations.get(txn.id, []):
                lot = lots.get(a.buy_transaction_id)
                if lot is None:
                    continue
                take = min(a.quantity, lot[0])
                lot[0] -= take
                unmatched -= take
            open_shares = sum(lot[0] for lot in lots.values())
            if unmatched > EPSILON and open_shares > 0:
                keep = max(0.0, 1 - unmatched / open_shares)
                for lot in lots.values():
                    lot[0] *= keep

        total_quantity = TransactionService._normalize_quantity(
            sum(lot[0] for lot in lots.values())
        )
        total_cost = sum(lot[0] * lot[1] for lot in lots.values())

        holding = HoldingsRepository.get_by_id(db, holding_id)
        if holding is None:
            return

        if total_quantity <= 0:
            # All shares sold, remove holding
            HoldingsRepository.delete(db, holding_id)
        else:
            holding.quantity = total_quantity
            holding.average_buy_price = total_cost / total_quantity
            HoldingsRepository.update(db, holding)

    @staticmethod
    def _normalize_quantity(quantity: float) -> float:
        """Normalize quantities to avoid tiny floating-point residues."""
        normalized = round(quantity, 8)
        return 0.0 if abs(normalized) <= 1e-8 else normalized

    @staticmethod
    def _find_holding(db: Session, data: TransactionCreate) -> Holding | None:
        """The holding (ticker at one broker) a trade belongs to.

        Uses `holding_id` when given. Otherwise matches the ticker, narrowed
        to `broker` when given; a ticker held at several brokers with no
        broker named is ambiguous (HTTPException 422).
        """
        if data.holding_id is not None:
            holding = HoldingsRepository.get_by_id(db, data.holding_id)
            if holding is None:
                raise HTTPException(status_code=404, detail="Holding not found")
            if holding.ticker != data.ticker:
                raise HTTPException(
                    status_code=422,
                    detail=(
                        f"Holding {holding.id} is {holding.ticker}, "
                        f"not {data.ticker}"
                    ),
                )
            return holding

        candidates = HoldingsRepository.get_all_by_ticker(db, data.ticker)
        if data.broker is not None:
            candidates = [h for h in candidates if h.broker == data.broker]
        if len(candidates) > 1:
            brokers = ", ".join(sorted(h.broker or "no broker" for h in candidates))
            raise HTTPException(
                status_code=422,
                detail=(
                    f"{data.ticker} is held at more than one broker ({brokers}); "
                    "choose which holding"
                ),
            )
        return candidates[0] if candidates else None

    @staticmethod
    def _process_buy(db: Session, data: TransactionCreate) -> TransactionResponse:
        """Process a buy transaction."""
        holding = TransactionService._find_holding(db, data)

        if holding is None:
            # Create a new holding for this ticker at this broker
            holding = Holding(
                ticker=data.ticker,
                quantity=data.quantity,
                average_buy_price=data.price,
                current_price=data.price,
                broker=data.broker,
            )
            holding = HoldingsRepository.create(db, holding)
        else:
            # Recalculate weighted average
            old_avg = holding.average_buy_price
            old_qty = holding.quantity
            new_avg = ((old_avg * old_qty) + (data.price * data.quantity)) / (
                old_qty + data.quantity
            )
            holding.quantity = old_qty + data.quantity
            holding.average_buy_price = new_avg
            HoldingsRepository.update(db, holding)

        # Create the transaction record
        transaction = Transaction(
            holding_id=holding.id,
            ticker=data.ticker,
            transaction_type="buy",
            quantity=data.quantity,
            price=data.price,
            fees=data.fees,
            transaction_date=data.transaction_date,
            broker=data.broker or holding.broker,
            notes=data.notes,
        )
        transaction = TransactionRepository.create(db, transaction)

        # Decrease cash balance by (price × quantity - fees)
        cash_balance = CashBalanceRepository.get_balance(db)
        new_balance = cash_balance.balance - (data.price * data.quantity + data.fees)
        CashBalanceRepository.update_balance(db, new_balance)

        return TransactionService._with_lots(db, [transaction])[0]

    @staticmethod
    def _process_sell(db: Session, data: TransactionCreate) -> TransactionResponse:
        """Process a sell transaction."""
        holding = TransactionService._find_holding(db, data)

        if holding is None:
            raise HTTPException(
                status_code=422,
                detail=f"No holding found for ticker '{data.ticker}'",
            )

        # Reject if sell quantity > holding quantity
        if data.quantity > holding.quantity:
            raise HTTPException(
                status_code=422,
                detail=(
                    "Insufficient shares: cannot sell more"
                    " than current holding quantity"
                ),
            )

        plan = LotService.plan_sell(
            db, holding, data.quantity, data.transaction_date, data.lots
        )
        planned_shares = sum(qty for _, qty in plan)
        planned_cost = sum(qty * buy.price for buy, qty in plan)
        # Shares with no recorded buy lot leave at the average price.
        unplanned_cost = max(data.quantity - planned_shares, 0.0) * (
            holding.average_buy_price
        )

        transaction = Transaction(
            holding_id=holding.id,
            ticker=data.ticker,
            transaction_type="sell",
            quantity=data.quantity,
            price=data.price,
            fees=data.fees,
            transaction_date=data.transaction_date,
            broker=data.broker or holding.broker,
            notes=data.notes,
        )
        transaction = TransactionRepository.create(db, transaction)
        LotAllocationRepository.create_many(
            db,
            [
                SellLotAllocation(
                    sell_transaction_id=transaction.id,
                    buy_transaction_id=buy.id,
                    quantity=qty,
                )
                for buy, qty in plan
            ],
        )

        # Increase cash balance by (price × quantity - fees)
        cash_balance = CashBalanceRepository.get_balance(db)
        new_balance = cash_balance.balance + (data.price * data.quantity - data.fees)
        CashBalanceRepository.update_balance(db, new_balance)

        # Update holding quantity and normalize any floating-point residue
        new_quantity = TransactionService._normalize_quantity(
            holding.quantity - data.quantity
        )
        if new_quantity == 0.0:
            # Remove the holding since quantity is 0
            HoldingsRepository.delete(db, holding.id)
        else:
            cost_left = (
                holding.average_buy_price * holding.quantity
                - planned_cost
                - unplanned_cost
            )
            holding.quantity = new_quantity
            if cost_left > 0:
                holding.average_buy_price = cost_left / new_quantity
            HoldingsRepository.update(db, holding)

        return TransactionService._with_lots(db, [transaction])[0]
