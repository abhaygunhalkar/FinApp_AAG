"""Repository for IncomeSource CRUD operations."""

from sqlalchemy.orm import Session

from app.models.income_source import IncomeSource


class IncomeRepository:
    """Data access layer for income sources."""

    @staticmethod
    def get_all(db: Session) -> list[IncomeSource]:
        """Retrieve all income sources ordered by category, then name."""
        return list(
            db.query(IncomeSource)
            .order_by(IncomeSource.category, IncomeSource.name)
            .all()
        )

    @staticmethod
    def get_by_id(db: Session, income_id: int) -> IncomeSource | None:
        """Retrieve an income source by its ID."""
        return db.query(IncomeSource).filter(IncomeSource.id == income_id).first()

    @staticmethod
    def create(db: Session, income: IncomeSource) -> IncomeSource:
        """Create a new income source record."""
        try:
            db.add(income)
            db.commit()
            db.refresh(income)
            return income
        except Exception:
            db.rollback()
            raise

    @staticmethod
    def update(db: Session, income: IncomeSource) -> IncomeSource:
        """Persist changes to an existing income source."""
        try:
            db.commit()
            db.refresh(income)
            return income
        except Exception:
            db.rollback()
            raise

    @staticmethod
    def detach_account(db: Session, account_id: int, label: str) -> None:
        """Unlink income from an account being deleted, keeping its name as text.

        Does not commit; the caller commits together with the account deletion.
        """
        db.query(IncomeSource).filter(
            IncomeSource.deposited_to_account_id == account_id
        ).update(
            {
                IncomeSource.deposited_to_account_id: None,
                IncomeSource.deposited_to: label,
            },
            synchronize_session="fetch",
        )

    @staticmethod
    def delete(db: Session, income: IncomeSource) -> None:
        """Delete an income source."""
        try:
            db.delete(income)
            db.commit()
        except Exception:
            db.rollback()
            raise
