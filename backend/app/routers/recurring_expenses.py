"""Recurring (fixed) expenses API router."""

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.schemas.common import ApiResponse
from app.schemas.recurring_expense import (
    RecurringExpenseCreate,
    RecurringExpenseResponse,
    RecurringExpenseUpdate,
)
from app.services.recurring_expense_service import (
    ExpenseNotFoundError,
    RecurringExpenseService,
)

router = APIRouter(prefix="/api/recurring-expenses", tags=["recurring-expenses"])


@router.get("", response_model=ApiResponse[list[RecurringExpenseResponse]])
def get_recurring_expenses(db: Session = Depends(get_db)) -> dict[str, object]:
    """Retrieve all recurring expenses."""
    return {"success": True, "data": RecurringExpenseService.get_all(db), "error": None}


@router.post(
    "",
    response_model=ApiResponse[RecurringExpenseResponse],
    status_code=status.HTTP_201_CREATED,
)
def create_recurring_expense(
    data: RecurringExpenseCreate, db: Session = Depends(get_db)
) -> dict[str, object]:
    """Add a recurring expense."""
    try:
        expense = RecurringExpenseService.create(db, data)
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e)) from e
    return {"success": True, "data": expense, "error": None}


@router.put("/{expense_id}", response_model=ApiResponse[RecurringExpenseResponse])
def update_recurring_expense(
    expense_id: int, data: RecurringExpenseUpdate, db: Session = Depends(get_db)
) -> dict[str, object]:
    """Edit a recurring expense."""
    try:
        expense = RecurringExpenseService.update(db, expense_id, data)
    except ExpenseNotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e)) from e
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e)) from e
    return {"success": True, "data": expense, "error": None}


@router.post(
    "/{expense_id}/mark-paid", response_model=ApiResponse[RecurringExpenseResponse]
)
def mark_recurring_expense_paid(
    expense_id: int, db: Session = Depends(get_db)
) -> dict[str, object]:
    """Mark the current bill paid, advancing its due date by one period."""
    try:
        expense = RecurringExpenseService.mark_paid(db, expense_id)
    except ExpenseNotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e)) from e
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e)) from e
    return {"success": True, "data": expense, "error": None}


@router.delete("/{expense_id}", response_model=ApiResponse[None])
def delete_recurring_expense(
    expense_id: int, db: Session = Depends(get_db)
) -> dict[str, object]:
    """Delete a recurring expense."""
    try:
        RecurringExpenseService.delete(db, expense_id)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e)) from e
    return {"success": True, "data": None, "error": None}
