"""Recurring (fixed) expenses API router."""

from fastapi import APIRouter, Depends, status
from fastapi.responses import JSONResponse
from sqlalchemy.orm import Session

from app.database import get_db
from app.schemas.recurring_expense import RecurringExpenseCreate, RecurringExpenseUpdate
from app.services.recurring_expense_service import (
    ExpenseNotFoundError,
    RecurringExpenseService,
)

router = APIRouter(prefix="/api/recurring-expenses", tags=["recurring-expenses"])


@router.get("")
def get_recurring_expenses(db: Session = Depends(get_db)) -> JSONResponse:
    """Retrieve all recurring expenses."""
    expenses = RecurringExpenseService.get_all(db)
    return JSONResponse(
        status_code=status.HTTP_200_OK,
        content={
            "success": True,
            "data": [e.model_dump(mode="json") for e in expenses],
            "error": None,
        },
    )


@router.post("", status_code=status.HTTP_201_CREATED)
def create_recurring_expense(
    data: RecurringExpenseCreate, db: Session = Depends(get_db)
) -> JSONResponse:
    """Add a recurring expense."""
    expense = RecurringExpenseService.create(db, data)
    return JSONResponse(
        status_code=status.HTTP_201_CREATED,
        content={
            "success": True,
            "data": expense.model_dump(mode="json"),
            "error": None,
        },
    )


@router.put("/{expense_id}")
def update_recurring_expense(
    expense_id: int, data: RecurringExpenseUpdate, db: Session = Depends(get_db)
) -> JSONResponse:
    """Edit a recurring expense."""
    try:
        expense = RecurringExpenseService.update(db, expense_id, data)
        return JSONResponse(
            status_code=status.HTTP_200_OK,
            content={
                "success": True,
                "data": expense.model_dump(mode="json"),
                "error": None,
            },
        )
    except ValueError as e:
        return JSONResponse(
            status_code=status.HTTP_404_NOT_FOUND,
            content={"success": False, "data": None, "error": str(e)},
        )


@router.post("/{expense_id}/mark-paid")
def mark_recurring_expense_paid(
    expense_id: int, db: Session = Depends(get_db)
) -> JSONResponse:
    """Mark the current bill paid, advancing its due date by one period."""
    try:
        expense = RecurringExpenseService.mark_paid(db, expense_id)
        return JSONResponse(
            status_code=status.HTTP_200_OK,
            content={
                "success": True,
                "data": expense.model_dump(mode="json"),
                "error": None,
            },
        )
    except ExpenseNotFoundError as e:
        return JSONResponse(
            status_code=status.HTTP_404_NOT_FOUND,
            content={"success": False, "data": None, "error": str(e)},
        )
    except ValueError as e:
        return JSONResponse(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            content={"success": False, "data": None, "error": str(e)},
        )


@router.delete("/{expense_id}")
def delete_recurring_expense(
    expense_id: int, db: Session = Depends(get_db)
) -> JSONResponse:
    """Delete a recurring expense."""
    try:
        RecurringExpenseService.delete(db, expense_id)
        return JSONResponse(
            status_code=status.HTTP_200_OK,
            content={"success": True, "data": None, "error": None},
        )
    except ValueError as e:
        return JSONResponse(
            status_code=status.HTTP_404_NOT_FOUND,
            content={"success": False, "data": None, "error": str(e)},
        )
