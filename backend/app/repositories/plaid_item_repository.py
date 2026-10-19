"""Repository for PlaidItem CRUD operations."""

from datetime import datetime

from sqlalchemy.orm import Session

from app.models.plaid_item import PlaidItem


class PlaidItemRepository:

    @staticmethod
    def get_all(db: Session) -> list[PlaidItem]:
        return list(db.query(PlaidItem).order_by(PlaidItem.created_at).all())

    @staticmethod
    def get_by_item_id(db: Session, item_id: str) -> PlaidItem | None:
        return db.query(PlaidItem).filter(PlaidItem.item_id == item_id).first()

    @staticmethod
    def create(
        db: Session,
        item_id: str,
        access_token: str,
        institution_id: str | None,
        institution_name: str | None,
    ) -> PlaidItem:
        item = PlaidItem(
            item_id=item_id,
            access_token=access_token,
            institution_id=institution_id,
            institution_name=institution_name,
        )
        db.add(item)
        db.commit()
        db.refresh(item)
        return item

    @staticmethod
    def update_last_synced(db: Session, item: PlaidItem) -> None:
        item.last_synced = datetime.utcnow()
        db.add(item)
        db.commit()

    @staticmethod
    def delete(db: Session, item: PlaidItem) -> None:
        db.delete(item)
        db.commit()
