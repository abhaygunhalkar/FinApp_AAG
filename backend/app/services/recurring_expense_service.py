"""Business logic for recurring (fixed) expenses."""

from sqlalchemy.orm import Session

from app.models.recurring_expense import RecurringExpense
from app.repositories.recurring_expense_repository import RecurringExpenseRepository
from app.schemas.recurring_expense import (
    RecurringExpenseCreate,
    RecurringExpenseResponse,
    RecurringExpenseUpdate,
)

# How many times per month each frequency occurs, used to normalise every
# bill to a monthly amount.
MONTHLY_FACTOR: dict[str, float] = {
    "weekly": 52 / 12,
    "biweekly": 26 / 12,
    "monthly": 1.0,
    "quarterly": 1 / 3,
    "semiannual": 1 / 6,
    "annual": 1 / 12,
}


class RecurringExpenseService:
    """Service layer for recurring expense business logic."""

    @staticmethod
    def monthly_amount(amount: float, frequency: str) -> float:
        """Convert an amount paid at the given frequency to a monthly amount."""
        return round(amount * MONTHLY_FACTOR.get(frequency, 1.0), 2)

    @staticmethod
    def get_all(db: Session) -> list[RecurringExpenseResponse]:
        """Retrieve all recurring expenses."""
        return [
            RecurringExpenseService._to_response(e)
            for e in RecurringExpenseRepository.get_all(db)
        ]

    @staticmethod
    def create(db: Session, data: RecurringExpenseCreate) -> RecurringExpenseResponse:
        """Create a recurring expense."""
        expense = RecurringExpense(
            name=data.name.strip(),
            category=data.category,
            amount=round(data.amount, 2),
            frequency=data.frequency,
            next_due_date=data.next_due_date,
            paid_from=RecurringExpenseService._clean(data.paid_from),
            autopay=data.autopay,
            notes=RecurringExpenseService._clean(data.notes),
        )
        return RecurringExpenseService._to_response(
            RecurringExpenseRepository.create(db, expense)
        )

    @staticmethod
    def update(
        db: Session, expense_id: int, data: RecurringExpenseUpdate
    ) -> RecurringExpenseResponse:
        """Update the fields that were sent.

        Raises:
            ValueError: If the expense does not exist.
        """
        expense = RecurringExpenseRepository.get_by_id(db, expense_id)
        if expense is None:
            raise ValueError(f"Recurring expense {expense_id} not found")

        fields = data.model_dump(exclude_unset=True)
        if fields.get("name") is not None:
            expense.name = fields["name"].strip()
        if fields.get("category") is not None:
            expense.category = fields["category"]
        if fields.get("amount") is not None:
            expense.amount = round(fields["amount"], 2)
        if fields.get("frequency") is not None:
            expense.frequency = fields["frequency"]
        if "next_due_date" in fields:
            expense.next_due_date = fields["next_due_date"]
        if "paid_from" in fields:
            expense.paid_from = RecurringExpenseService._clean(fields["paid_from"])
        if fields.get("autopay") is not None:
            expense.autopay = fields["autopay"]
        if "notes" in fields:
            expense.notes = RecurringExpenseService._clean(fields["notes"])

        return RecurringExpenseService._to_response(
            RecurringExpenseRepository.update(db, expense)
        )

    @staticmethod
    def delete(db: Session, expense_id: int) -> None:
        """Delete a recurring expense.

        Raises:
            ValueError: If the expense does not exist.
        """
        expense = RecurringExpenseRepository.get_by_id(db, expense_id)
        if expense is None:
            raise ValueError(f"Recurring expense {expense_id} not found")
        RecurringExpenseRepository.delete(db, expense)

    @staticmethod
    def _clean(value: str | None) -> str | None:
        """Trim optional text and store blanks as NULL."""
        if value is None:
            return None
        value = value.strip()
        return value or None

    @staticmethod
    def _to_response(expense: RecurringExpense) -> RecurringExpenseResponse:
        return RecurringExpenseResponse(
            id=expense.id,
            name=expense.name,
            category=expense.category,
            amount=expense.amount,
            frequency=expense.frequency,
            monthly_amount=RecurringExpenseService.monthly_amount(
                expense.amount, expense.frequency
            ),
            next_due_date=expense.next_due_date,
            paid_from=expense.paid_from,
            autopay=expense.autopay,
            notes=expense.notes,
            created_at=expense.created_at,
            updated_at=expense.updated_at,
        )
