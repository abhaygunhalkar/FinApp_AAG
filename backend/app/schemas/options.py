"""Pydantic schemas for options trades."""
from datetime import date, datetime
from typing import Literal

from pydantic import BaseModel, Field


class OptionsTradeCreate(BaseModel):
    ticker: str = Field(..., min_length=1, max_length=5, pattern=r"^[A-Z]{1,5}$")
    trade_type: Literal["sell_put", "sell_call", "buy_call", "buy_put"]
    strike_price: float = Field(..., ge=0)
    premium: float = Field(..., ge=0)
    contracts: int = Field(..., ge=1)
    open_date: date
    expiry_date: date
    status: Literal["open", "closed", "expired_worthless", "assigned"]
    close_price: float | None = None
    notes: str | None = None


class OptionsTradeResponse(BaseModel):
    id: int
    ticker: str
    trade_type: str
    strike_price: float
    premium: float
    contracts: int
    open_date: date
    expiry_date: date
    status: str
    close_price: float | None
    notes: str | None
    created_at: datetime
    updated_at: datetime
    pnl: float | None = None

    model_config = {"from_attributes": True}


class OptionsSummary(BaseModel):
    total_pnl: float
    open_positions: int
    expiring_this_week: int
    win_rate: float

    model_config = {"from_attributes": True}


class OptionQuoteResponse(BaseModel):
    """Live market quote for a single open options trade, sourced from yfinance."""

    bid: float | None
    ask: float | None
    last_price: float | None
    current_price: float | None  # bid/ask midpoint, falls back to last_price
    unrealized_pnl: float | None
