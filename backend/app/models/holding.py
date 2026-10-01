"""Holding model representing a stock position in the portfolio."""

from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import DateTime, Float, String, Text, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base

if TYPE_CHECKING:
    from app.models.transaction import Transaction


class Holding(Base):
    """Represents a stock holding in the user's portfolio."""

    __tablename__ = "holdings"
    __table_args__ = (
        UniqueConstraint(
            "ticker", "holding_type", "broker", name="uq_holdings_ticker_type_broker"
        ),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    ticker: Mapped[str] = mapped_column(String(10), nullable=False)
    company_name: Mapped[str] = mapped_column(String(200), nullable=True)
    quantity: Mapped[float] = mapped_column(Float, nullable=False)
    average_buy_price: Mapped[float] = mapped_column(Float, nullable=False)
    current_price: Mapped[float] = mapped_column(Float, default=0.0)
    holding_type: Mapped[str] = mapped_column(String(20), default='stock', nullable=False)
    sector: Mapped[str | None] = mapped_column(String(100), nullable=True)
    industry: Mapped[str | None] = mapped_column(String(100), nullable=True)
    dividend_yield: Mapped[float] = mapped_column(Float, default=0.0)
    broker: Mapped[str | None] = mapped_column(String(50), nullable=True)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, default=func.now(), onupdate=func.now()
    )

    transactions: Mapped[list["Transaction"]] = relationship(
        back_populates="holding", cascade="save-update, merge"
    )
