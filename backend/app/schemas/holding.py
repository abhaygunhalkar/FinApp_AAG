"""Pydantic schemas for holding-related requests and responses."""

from datetime import datetime

from pydantic import BaseModel, Field


class HoldingCreate(BaseModel):
    """Schema for creating a new holding."""

    ticker: str = Field(..., min_length=1, max_length=5, pattern=r"^[A-Z]{1,5}$")
    quantity: float = Field(..., gt=0)
    buy_price: float = Field(..., ge=0.01)
    company_name: str | None = None
    sector: str | None = None
    industry: str | None = None
    broker: str | None = None
    notes: str | None = None
    holding_type: str | None = None


class HoldingUpdate(BaseModel):
    """Schema for updating an existing holding."""

    company_name: str | None = None
    sector: str | None = None
    industry: str | None = None
    notes: str | None = None


class HoldingResponse(BaseModel):
    """Schema for holding response data."""

    id: int
    ticker: str
    company_name: str | None
    quantity: float
    average_buy_price: float
    current_price: float
    total_invested: float
    current_value: float
    daily_change: float
    daily_change_pct: float
    unrealized_gain: float
    unrealized_gain_pct: float
    allocation_pct: float
    sector: str | None
    industry: str | None
    dividend_yield: float
    annual_dividend_income: float
    broker: str | None = None
    holding_type: str
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}
