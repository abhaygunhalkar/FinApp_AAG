"""Repository for the single Owner row."""

from sqlalchemy.orm import Session

from app.models.owner import Owner


class OwnerRepository:

    @staticmethod
    def get(db: Session) -> Owner | None:
        return db.query(Owner).order_by(Owner.id).first()

    @staticmethod
    def get_by_id(db: Session, owner_id: int) -> Owner | None:
        return db.query(Owner).filter(Owner.id == owner_id).first()

    @staticmethod
    def create(db: Session, username: str, password_hash: str) -> Owner:
        owner = Owner(username=username, password_hash=password_hash)
        db.add(owner)
        db.commit()
        db.refresh(owner)
        return owner

    @staticmethod
    def save(db: Session, owner: Owner) -> None:
        db.add(owner)
        db.commit()
