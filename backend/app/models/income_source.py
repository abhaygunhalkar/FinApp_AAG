"""IncomeSource model for manually entered recurring income."""

from datetime import datetime

from sqlalchemy import DateTime, Float, ForeignKey, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class IncomeSource(Base):
    """Money coming in on a schedule (salary, rent received, side income, ...)."""

    __tablename__ = "income_sources"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    category: Mapped[str] = mapped_column(String(50), nullable=False)
    # Take-home amount per payment (after tax and deductions).
    amount: Mapped[float] = mapped_column(Float, nullable=False)
    frequency: Mapped[str] = mapped_column(String(20), nullable=False)
    # Linked Net Worth account; deposited_to holds free text only when no account
    # is linked.
    deposited_to_account_id: Mapped[int | None] = mapped_column(
        ForeignKey("financial_accounts.id", ondelete="SET NULL"), nullable=True
    )
    deposited_to: Mapped[str | None] = mapped_column(String(200), nullable=True)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, default=func.now(), onupdate=func.now()
    )
