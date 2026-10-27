"""Transactions API router."""

from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.schemas.common import ApiResponse
from app.schemas.transaction import TransactionCreate, TransactionResponse
from app.services.lot_service import LotService
from app.services.transaction_service import TransactionService

router = APIRouter(prefix="/api/transactions", tags=["transactions"])


@router.get("", response_model=ApiResponse[list[TransactionResponse]])
def get_transactions(
    holding_id: int = Query(..., description="ID of the holding to fetch transactions for"),
    db: Session = Depends(get_db),
) -> dict:
    """Retrieve all transactions for a given holding."""
    transactions = TransactionService.get_transactions(db, holding_id)
    return {"success": True, "data": transactions, "error": None}


@router.post(
    "",
    response_model=ApiResponse[TransactionResponse],
    status_code=status.HTTP_201_CREATED,
)
def create_transaction(
    data: TransactionCreate,
    db: Session = Depends(get_db),
) -> dict:
    """Create a new buy or sell transaction."""
    transaction = TransactionService.create_transaction(db, data)
    return {"success": True, "data": transaction, "error": None}


@router.delete("/{transaction_id}", response_model=ApiResponse[None])
def delete_transaction(
    transaction_id: int,
    db: Session = Depends(get_db),
) -> dict:
    """Delete a transaction and recalculate the associated holding."""
    TransactionService.delete_transaction(db, transaction_id)
    return {"success": True, "data": None, "error": None}


@router.get("/sells")
def get_sell_history(
    db: Session = Depends(get_db),
) -> dict:
    """Retrieve all sell transactions with realized gain info."""
    from app.repositories.transaction_repository import TransactionRepository
    from app.repositories.holdings_repository import HoldingsRepository

    all_transactions = TransactionRepository.get_all_ordered(db)

    sorted_txns = sorted(all_transactions, key=lambda t: t.transaction_date)
    # Average cost of the buy lots each sell took its shares from
    cost_basis = LotService.cost_basis_by_sell(db)

    # Also build a map of ticker -> avg buy price from current holdings as fallback
    all_holdings = HoldingsRepository.get_all(db)
    holding_avg_prices: dict[str, float] = {
        h.ticker: h.average_buy_price for h in all_holdings
    }

    sell_details = []
    for txn in sorted_txns:
        if txn.transaction_type == "sell":
            if txn.id in cost_basis:
                avg_cost = cost_basis[txn.id]
            elif txn.ticker in holding_avg_prices:
                # Fallback: use current holding's average buy price
                avg_cost = holding_avg_prices[txn.ticker]
            else:
                # No data available — cost basis unknown
                avg_cost = 0.0

            realized_gain = round((txn.price - avg_cost) * txn.quantity, 2)
            sell_details.append({
                "id": txn.id,
                "holding_id": txn.holding_id,
                "ticker": txn.ticker,
                "transaction_type": txn.transaction_type,
                "quantity": txn.quantity,
                "price": txn.price,
                "fees": txn.fees,
                "transaction_date": txn.transaction_date.isoformat(),
                "broker": txn.broker,
                "notes": txn.notes,
                "created_at": txn.created_at.isoformat(),
                "cost_basis": round(avg_cost, 2),
                "realized_gain": realized_gain,
            })

    # Sort by date descending (most recent first)
    sell_details.sort(key=lambda x: x["transaction_date"], reverse=True)
    return {"success": True, "data": sell_details, "error": None}
