"""Financial account model for net worth tracking."""

from datetime import datetime

from sqlalchemy import DateTime, Float, ForeignKey, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class FinancialAccount(Base):
    __tablename__ = "financial_accounts"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    institution: Mapped[str | None] = mapped_column(String(200), nullable=True)
    account_type: Mapped[str] = mapped_column(String(50), nullable=False)
    balance: Mapped[float] = mapped_column(Float, default=0.0)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    plaid_account_id: Mapped[str | None] = mapped_column(String(100), nullable=True, unique=True)
    plaid_item_id: Mapped[int | None] = mapped_column(ForeignKey("plaid_items.id"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, default=func.now(), onupdate=func.now()
    )
