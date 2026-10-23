"""Repository for RecurringExpense CRUD operations."""

from sqlalchemy.orm import Session

from app.models.recurring_expense import RecurringExpense


class RecurringExpenseRepository:
    """Data access layer for recurring expenses."""

    @staticmethod
    def get_all(db: Session) -> list[RecurringExpense]:
        """Retrieve all recurring expenses ordered by category, then name."""
        return list(
            db.query(RecurringExpense)
            .order_by(RecurringExpense.category, RecurringExpense.name)
            .all()
        )

    @staticmethod
    def get_by_id(db: Session, expense_id: int) -> RecurringExpense | None:
        """Retrieve a recurring expense by its ID."""
        return (
            db.query(RecurringExpense).filter(RecurringExpense.id == expense_id).first()
        )

    @staticmethod
    def create(db: Session, expense: RecurringExpense) -> RecurringExpense:
        """Create a new recurring expense record."""
        try:
            db.add(expense)
            db.commit()
            db.refresh(expense)
            return expense
        except Exception:
            db.rollback()
            raise

    @staticmethod
    def update(db: Session, expense: RecurringExpense) -> RecurringExpense:
        """Persist changes to an existing recurring expense."""
        try:
            db.commit()
            db.refresh(expense)
            return expense
        except Exception:
            db.rollback()
            raise

    @staticmethod
    def delete(db: Session, expense: RecurringExpense) -> None:
        """Delete a recurring expense."""
        try:
            db.delete(expense)
            db.commit()
        except Exception:
            db.rollback()
            raise
