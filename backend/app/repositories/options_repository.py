"""Repository for options trades."""

from datetime import date
from typing import Any

from sqlalchemy.orm import Session

from app.models.options_trade import OptionsTrade


class OptionsRepository:
    @staticmethod
    def get_all(db: Session) -> list[OptionsTrade]:
        return db.query(OptionsTrade).order_by(OptionsTrade.expiry_date.asc()).all()

    @staticmethod
    def get_by_id(db: Session, id: int) -> OptionsTrade | None:
        return db.query(OptionsTrade).filter(OptionsTrade.id == id).first()

    @staticmethod
    def create(db: Session, payload: dict[str, Any]) -> OptionsTrade:
        obj = OptionsTrade(**payload)
        db.add(obj)
        db.commit()
        db.refresh(obj)
        return obj

    @staticmethod
    def update(db: Session, id: int, payload: dict[str, Any]) -> OptionsTrade | None:
        obj = db.query(OptionsTrade).filter(OptionsTrade.id == id).first()
        if not obj:
            return None
        for k, v in payload.items():
            setattr(obj, k, v)
        db.add(obj)
        db.commit()
        db.refresh(obj)
        return obj

    @staticmethod
    def delete(db: Session, id: int) -> None:
        obj = db.query(OptionsTrade).filter(OptionsTrade.id == id).first()
        if obj:
            db.delete(obj)
            db.commit()

    @staticmethod
    def count_expiring_between(db: Session, start: date, end: date) -> int:
        return (
            db.query(OptionsTrade)
            .filter(
                OptionsTrade.status == "open",
                OptionsTrade.expiry_date >= start,
                OptionsTrade.expiry_date <= end,
            )
            .count()
        )
