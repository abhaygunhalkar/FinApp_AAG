"""Pydantic schemas for dashboard-related responses."""

from datetime import date, datetime
from typing import Any, Literal

from pydantic import BaseModel


class DashboardSummary(BaseModel):
    """Schema for the portfolio dashboard summary."""

    total_portfolio_value: float
    total_invested: float
    unrealized_gain: float
    etf_unrealized_gain: float
    realized_gain: float
    daily_change: float
    annual_dividend_income: float
    cash_position: float
    number_of_holdings: int
    stale_data: bool = False
    last_successful_fetch: datetime | None = None


class BrokerSummary(BaseModel):
    """Schema for aggregated holding value per brokerage account."""

    broker: str
    market_value: float
    total_invested: float
    unrealized_gain: float
    holding_count: int


class ActivityEvent(BaseModel):
    """Schema for a portfolio activity event."""

    event_type: Literal[
        "holding_added",
        "stock_sold",
        "watchlist_added",
        "watchlist_removed",
        "notes_updated",
    ]
    ticker: str
    details: dict[str, Any]
    timestamp: datetime


class PortfolioSnapshot(BaseModel):
    """Schema for a portfolio value snapshot at a point in time."""

    date: date
    total_value: float
