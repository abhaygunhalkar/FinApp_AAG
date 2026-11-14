"""Earnings calendar schema; mirrors frontend/src/types/earnings.ts."""

from pydantic import BaseModel, ConfigDict, Field


class EarningsCalendarEntry(BaseModel):
    """One company reporting earnings. The wire names are Finnhub's camelCase."""

    model_config = ConfigDict(populate_by_name=True)

    ticker: str
    company: str
    date: str
    # "bmo" (before market open) or "amc" (after market close).
    hour: str
    # int | float keeps whole numbers as sent (no ".0").
    eps_estimate: int | float | None = Field(alias="epsEstimate")
    revenue_estimate: int | float | None = Field(alias="revenueEstimate")
