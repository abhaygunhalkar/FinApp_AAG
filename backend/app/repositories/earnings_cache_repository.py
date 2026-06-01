"""Repository for earnings cache operations."""

from datetime import date, datetime

from sqlalchemy.orm import Session

from app.models.earnings_cache import EarningsCache


class EarningsCacheRepository:
    """Data access for earnings cache."""

    @staticmethod
    def get_by_cache_date(db: Session, cache_date: date) -> EarningsCache | None:
        return (
            db.query(EarningsCache)
            .filter(EarningsCache.cache_date == cache_date)
            .first()
        )

    @staticmethod
    def create(db: Session, cache_date: date, data: str) -> EarningsCache:
        earnings_cache = EarningsCache(
            cache_date=cache_date,
            data=data,
            fetched_at=datetime.utcnow(),
        )
        try:
            db.add(earnings_cache)
            db.commit()
            db.refresh(earnings_cache)
            return earnings_cache
        except Exception:
            db.rollback()
            raise
