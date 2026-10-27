"""IncomeSource model for manually entered recurring income."""

from datetime import date, datetime

from sqlalchemy import Date, DateTime, Float, ForeignKey, Integer, String, Text, func
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
    # Pay schedule. Twice-a-month income is paid on two days of the month
    # (pay_day_1/pay_day_2, 31 = last day); every other frequency counts from
    # one known pay date (pay_date), forwards and back.
    pay_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    pay_day_1: Mapped[int | None] = mapped_column(Integer, nullable=True)
    pay_day_2: Mapped[int | None] = mapped_column(Integer, nullable=True)
    # When a payday lands on a weekend: "before" (the Friday), "after" (the
    # Monday) or "none" (that day).
    weekend_rule: Mapped[str] = mapped_column(
        String(10), nullable=False, default="before", server_default="before"
    )
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, default=func.now(), onupdate=func.now()
    )
