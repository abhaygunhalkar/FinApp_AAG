"""Transactions API router."""

from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.schemas.common import ApiResponse
from app.schemas.transaction import (
    SellHistoryItem,
    TransactionCreate,
    TransactionResponse,
)
from app.services.transaction_service import TransactionService

router = APIRouter(prefix="/api/transactions", tags=["transactions"])


@router.get("", response_model=ApiResponse[list[TransactionResponse]])
def get_transactions(
    holding_id: int = Query(
        ..., description="ID of the holding to fetch transactions for"
    ),
    db: Session = Depends(get_db),
) -> dict[str, object]:
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
) -> dict[str, object]:
    """Create a new buy or sell transaction."""
    transaction = TransactionService.create_transaction(db, data)
    return {"success": True, "data": transaction, "error": None}


@router.delete("/{transaction_id}", response_model=ApiResponse[None])
def delete_transaction(
    transaction_id: int,
    db: Session = Depends(get_db),
) -> dict[str, object]:
    """Delete a transaction and recalculate the associated holding."""
    TransactionService.delete_transaction(db, transaction_id)
    return {"success": True, "data": None, "error": None}


@router.get("/sells", response_model=ApiResponse[list[SellHistoryItem]])
def get_sell_history(db: Session = Depends(get_db)) -> dict[str, object]:
    """Retrieve all sell transactions with realized gain info."""
    sells = TransactionService.get_sell_history(db)
    return {"success": True, "data": sells, "error": None}
