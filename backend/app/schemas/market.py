"""Pydantic schemas for market data responses."""

from datetime import date

from pydantic import BaseModel


class MarketQuote(BaseModel):
    """Schema for a real-time market quote."""

    ticker: str
    current_price: float
    previous_close: float
    daily_change: float
    daily_change_pct: float
    week_52_high: float
    week_52_low: float
    market_cap: float | None
    pe_ratio: float | None
    dividend_yield: float
    analyst_rating: str | None


class PricePoint(BaseModel):
    """Schema for a historical price data point."""

    date: date
    open: float
    close: float
    high: float
    low: float
    volume: float


class CachedQuote(BaseModel):
    """The last saved price, when no live quote is available."""

    ticker: str
    current_price: float
    cached: bool = True


class CompanyInfo(BaseModel):
    """Company details used to fill in a new holding."""

    ticker: str
    company_name: str
    sector: str | None
    industry: str | None
    # The start of the company description, at most about 200 characters.
    notes: str | None


class RefreshSummary(BaseModel):
    """What a manual price refresh updated."""

    updated: int
    failed: int
    tickers_updated: list[str]
    tickers_failed: list[str]
