"""Repository for Transaction CRUD and ordered query operations."""

from sqlalchemy.orm import Session

from app.models.transaction import Transaction


class TransactionRepository:
    """Data access layer for transactions."""

    @staticmethod
    def get_by_holding(db: Session, holding_id: int) -> list[Transaction]:
        """Retrieve all transactions for a holding.

        Returns transactions ordered by date descending.
        """
        return list(
            db.query(Transaction)
            .filter(Transaction.holding_id == holding_id)
            .order_by(Transaction.transaction_date.desc())
            .all()
        )

    @staticmethod
    def get_by_id(db: Session, transaction_id: int) -> Transaction | None:
        """Retrieve a transaction by its ID."""
        return db.query(Transaction).filter(Transaction.id == transaction_id).first()

    @staticmethod
    def create(db: Session, transaction: Transaction) -> Transaction:
        """Create a new transaction record."""
        try:
            db.add(transaction)
            db.commit()
            db.refresh(transaction)
            return transaction
        except Exception:
            db.rollback()
            raise

    @staticmethod
    def delete(db: Session, transaction_id: int) -> None:
        """Delete a transaction by its ID."""
        try:
            transaction = (
                db.query(Transaction).filter(Transaction.id == transaction_id).first()
            )
            if transaction:
                db.delete(transaction)
                db.commit()
        except Exception:
            db.rollback()
            raise

    @staticmethod
    def get_all_ordered(db: Session) -> list[Transaction]:
        """Retrieve all transactions ordered by transaction_date descending."""
        return list(
            db.query(Transaction).order_by(Transaction.transaction_date.desc()).all()
        )

    @staticmethod
    def get_by_ids(db: Session, transaction_ids: list[int]) -> list[Transaction]:
        """Retrieve transactions by ID, in no particular order."""
        if not transaction_ids:
            return []
        return list(
            db.query(Transaction).filter(Transaction.id.in_(transaction_ids)).all()
        )
