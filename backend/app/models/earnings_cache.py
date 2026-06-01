"""Earnings cache model for storing daily Finnhub earnings calendar responses."""

from datetime import date, datetime

from sqlalchemy import Date, DateTime, Integer, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class EarningsCache(Base):
    """Cached earnings calendar payload for a given date."""

    __tablename__ = "earnings_cache"

    id: Mapped[int] = mapped_column(primary_key=True)
    cache_date: Mapped[date] = mapped_column(Date, nullable=False, unique=True)
    data: Mapped[str] = mapped_column(Text, nullable=False)
    fetched_at: Mapped[datetime] = mapped_column(DateTime, nullable=False)
