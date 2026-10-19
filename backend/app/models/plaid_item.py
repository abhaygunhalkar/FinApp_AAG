"""PlaidItem model storing Plaid access tokens per connected institution."""

from datetime import datetime

from sqlalchemy import DateTime, String, func
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class PlaidItem(Base):
    __tablename__ = "plaid_items"

    id: Mapped[int] = mapped_column(primary_key=True)
    item_id: Mapped[str] = mapped_column(String(100), unique=True, nullable=False)
    access_token: Mapped[str] = mapped_column(String(200), nullable=False)
    institution_id: Mapped[str | None] = mapped_column(String(100), nullable=True)
    institution_name: Mapped[str | None] = mapped_column(String(200), nullable=True)
    last_synced: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=func.now())
