"""RecurringExpense model for manually entered fixed costs."""

from datetime import date, datetime

from sqlalchemy import Boolean, Date, DateTime, Float, ForeignKey, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class RecurringExpense(Base):
    """A fixed bill paid on a schedule (rent, utilities, subscriptions, ...)."""

    __tablename__ = "recurring_expenses"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    category: Mapped[str] = mapped_column(String(50), nullable=False)
    amount: Mapped[float] = mapped_column(Float, nullable=False)
    frequency: Mapped[str] = mapped_column(String(20), nullable=False)
    next_due_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    # Linked Net Worth account; paid_from holds free text only when no account is linked
    # (typed before linking existed, or the account was since deleted).
    paid_from_account_id: Mapped[int | None] = mapped_column(
        ForeignKey("financial_accounts.id", ondelete="SET NULL"), nullable=True
    )
    paid_from: Mapped[str | None] = mapped_column(String(200), nullable=True)
    autopay: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, default=func.now(), onupdate=func.now()
    )
