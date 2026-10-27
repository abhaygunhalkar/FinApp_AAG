"""Model linking a sell transaction to the buy lots it sold from."""

from sqlalchemy import Float, ForeignKey, Index
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class SellLotAllocation(Base):
    """Shares a sell took from one buy lot.

    A sell may draw on several lots, and a lot may be sold off across several
    sells; a lot's remaining shares are its quantity minus all its allocations.
    """

    __tablename__ = "sell_lot_allocations"
    __table_args__ = (
        Index("ix_sell_lot_allocations_sell", "sell_transaction_id"),
        Index("ix_sell_lot_allocations_buy", "buy_transaction_id"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    sell_transaction_id: Mapped[int] = mapped_column(
        ForeignKey("transactions.id", ondelete="CASCADE"), nullable=False
    )
    buy_transaction_id: Mapped[int] = mapped_column(
        ForeignKey("transactions.id", ondelete="RESTRICT"), nullable=False
    )
    quantity: Mapped[float] = mapped_column(Float, nullable=False)
