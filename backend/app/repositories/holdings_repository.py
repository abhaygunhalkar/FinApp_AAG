"""Repository for Holding CRUD operations."""

from sqlalchemy.orm import Session

from app.models.holding import Holding

ACTIVE_QUANTITY_THRESHOLD = 1e-8


class HoldingsRepository:
    """Data access layer for holdings."""

    @staticmethod
    def get_all(db: Session) -> list[Holding]:
        """Retrieve all active holdings."""
        return list(
            db.query(Holding)
            .filter(Holding.quantity > ACTIVE_QUANTITY_THRESHOLD)
            .all()
        )

    @staticmethod
    def get_by_id(db: Session, holding_id: int) -> Holding | None:
        """Retrieve a holding by its ID."""
        return db.query(Holding).filter(Holding.id == holding_id).first()

    @staticmethod
    def get_by_ticker(db: Session, ticker: str) -> Holding | None:
        """Retrieve an active holding by its ticker symbol."""
        return (
            db.query(Holding)
            .filter(
                Holding.ticker == ticker,
                Holding.quantity > ACTIVE_QUANTITY_THRESHOLD,
            )
            .first()
        )

    @staticmethod
    def get_by_ticker_and_type(
        db: Session, ticker: str, holding_type: str, broker: str | None = None
    ) -> Holding | None:
        """Retrieve an active holding by ticker, type, and broker."""
        return (
            db.query(Holding)
            .filter(
                Holding.ticker == ticker,
                Holding.holding_type == holding_type,
                Holding.broker == broker,
                Holding.quantity > ACTIVE_QUANTITY_THRESHOLD,
            )
            .first()
        )

    @staticmethod
    def get_all_by_type(db: Session, holding_type: str) -> list[Holding]:
        """Retrieve all active holdings by type."""
        return list(
            db.query(Holding)
            .filter(
                Holding.holding_type == holding_type,
                Holding.quantity > ACTIVE_QUANTITY_THRESHOLD,
            )
            .all()
        )

    @staticmethod
    def delete_zero_quantity_holdings(db: Session) -> None:
        """Remove any holdings that are effectively zero quantity."""
        try:
            query = db.query(Holding).filter(
                Holding.quantity <= ACTIVE_QUANTITY_THRESHOLD
            )
            query.delete(synchronize_session=False)
            db.commit()
        except Exception:
            db.rollback()
            raise

    @staticmethod
    def get_by_id_and_type(db: Session, holding_id: int, holding_type: str) -> Holding | None:
        """Retrieve an active holding by ID and type."""
        return (
            db.query(Holding)
            .filter(
                Holding.id == holding_id,
                Holding.holding_type == holding_type,
                Holding.quantity > ACTIVE_QUANTITY_THRESHOLD,
            )
            .first()
        )

    @staticmethod
    def create(db: Session, holding: Holding) -> Holding:
        """Create a new holding record."""
        try:
            db.add(holding)
            db.commit()
            db.refresh(holding)
            return holding
        except Exception:
            db.rollback()
            raise

    @staticmethod
    def update(db: Session, holding: Holding) -> Holding:
        """Update an existing holding record."""
        try:
            db.commit()
            db.refresh(holding)
            return holding
        except Exception:
            db.rollback()
            raise

    @staticmethod
    def delete(db: Session, holding_id: int) -> None:
        """Delete a holding by its ID. Preserves transaction history by nullifying holding_id."""
        try:
            from app.models.transaction import Transaction

            holding = db.query(Holding).filter(Holding.id == holding_id).first()
            if holding:
                # Nullify holding_id on transactions to preserve trade history
                db.query(Transaction).filter(
                    Transaction.holding_id == holding_id
                ).update({"holding_id": None})
                db.delete(holding)
                db.commit()
        except Exception:
            db.rollback()
            raise
