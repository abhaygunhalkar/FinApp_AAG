"""Pydantic schemas for portfolio analysis insights."""

from pydantic import BaseModel


class PortfolioInsight(BaseModel):
    rule_id: str
    category: (
        str  # portfolio_health | risk | income_returns | behaviour | options | mistakes
    )
    severity: str  # info | warning | alert
    title: str
    message: str
