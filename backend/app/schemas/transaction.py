"""Pydantic schemas for transaction-related requests and responses."""

from datetime import date, datetime
from typing import Literal

from pydantic import BaseModel, Field, model_validator


class LotSelection(BaseModel):
    """Shares to sell from one buy lot."""

    buy_transaction_id: int
    quantity: float = Field(..., gt=0)


class TransactionCreate(BaseModel):
    """Schema for creating a new transaction."""

    ticker: str = Field(..., min_length=1, max_length=5, pattern=r"^[A-Z]{1,5}$")
    transaction_type: Literal["buy", "sell"]
    quantity: float = Field(..., gt=0)
    price: float = Field(..., ge=0.01)
    fees: float = Field(default=0.0, ge=0)
    transaction_date: date
    broker: str | None = None
    notes: str | None = None
    # The holding (ticker + broker account) this trade belongs to. When left
    # out, the holding is found from ticker and broker.
    holding_id: int | None = None
    # Sells only: which lots to sell from. Left out, the oldest lots go first.
    lots: list[LotSelection] | None = None

    @model_validator(mode="after")
    def check_lots(self) -> "TransactionCreate":
        """Lots apply to sells, once each, and must add up to the quantity."""
        if self.lots is None:
            return self
        if self.transaction_type != "sell":
            raise ValueError("lots can only be chosen for a sell")
        ids = [lot.buy_transaction_id for lot in self.lots]
        if len(ids) != len(set(ids)):
            raise ValueError("each lot can only be listed once")
        if abs(sum(lot.quantity for lot in self.lots) - self.quantity) > 1e-6:
            raise ValueError("lot quantities must add up to the sell quantity")
        return self


class LotAllocationResponse(BaseModel):
    """Shares a sell took from one buy lot, with that lot's cost."""

    buy_transaction_id: int
    quantity: float
    price: float
    transaction_date: date


class TransactionResponse(BaseModel):
    """Schema for transaction response data."""

    id: int
    holding_id: int | None
    ticker: str
    transaction_type: str
    quantity: float
    price: float
    fees: float
    transaction_date: date
    notes: str | None
    broker: str | None = None
    created_at: datetime
    # Buys: shares of this lot not yet sold.
    remaining_quantity: float | None = None
    # Sells: the lots the shares came from.
    lots: list[LotAllocationResponse] = []

    model_config = {"from_attributes": True}
