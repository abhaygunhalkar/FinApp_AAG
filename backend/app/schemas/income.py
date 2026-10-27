"""Pydantic schemas for income sources and the cash flow summary."""

from datetime import date, datetime
from typing import Literal

from pydantic import BaseModel, Field

from app.schemas.recurring_expense import ExpenseFrequency

IncomeCategory = Literal[
    "Salary",
    "Bonus",
    "Rental income",
    "Side income",
    "Dividends & interest",
    "Benefits & pension",
    "Other",
]

# What happens when a payday falls on a weekend.
WeekendRule = Literal["before", "after", "none"]


class IncomeSourceCreate(BaseModel):
    """Schema for adding an income source."""

    name: str = Field(..., min_length=1, max_length=200)
    category: IncomeCategory
    amount: float = Field(..., gt=0, le=10_000_000)
    frequency: ExpenseFrequency = "monthly"
    # Link to a Net Worth account; deposited_to is free text used only without a link.
    deposited_to_account_id: int | None = None
    deposited_to: str | None = Field(default=None, max_length=200)
    # Twice a month: the two days of the month (31 = last day). Other
    # frequencies: any one pay date, past or upcoming.
    pay_date: date | None = None
    pay_day_1: int | None = Field(default=None, ge=1, le=31)
    pay_day_2: int | None = Field(default=None, ge=1, le=31)
    weekend_rule: WeekendRule = "before"
    notes: str | None = Field(default=None, max_length=500)


class IncomeSourceUpdate(BaseModel):
    """Schema for editing an income source; only fields sent are changed."""

    name: str | None = Field(default=None, min_length=1, max_length=200)
    category: IncomeCategory | None = None
    amount: float | None = Field(default=None, gt=0, le=10_000_000)
    frequency: ExpenseFrequency | None = None
    deposited_to_account_id: int | None = None
    deposited_to: str | None = Field(default=None, max_length=200)
    pay_date: date | None = None
    pay_day_1: int | None = Field(default=None, ge=1, le=31)
    pay_day_2: int | None = Field(default=None, ge=1, le=31)
    weekend_rule: WeekendRule | None = None
    notes: str | None = Field(default=None, max_length=500)


class IncomeSourceResponse(BaseModel):
    """Schema for income source response data."""

    id: int
    name: str
    category: str
    amount: float
    frequency: str
    monthly_amount: float
    deposited_to_account_id: int | None
    # Linked account's current "Name (Institution)", else the stored free text.
    deposited_to: str | None
    pay_date: date | None
    pay_day_1: int | None
    pay_day_2: int | None
    weekend_rule: str
    # Next day money arrives (weekend rule applied); None without a schedule.
    next_pay_date: date | None
    notes: str | None
    created_at: datetime
    updated_at: datetime


class CashFlowSummary(BaseModel):
    """Monthly income vs fixed costs, and how long liquid cash would last."""

    monthly_income: float
    monthly_fixed_costs: float
    monthly_surplus: float
    # Share of income left after fixed costs; None when there is no income.
    kept_pct: float | None
    liquid_cash: float
    # Months of fixed costs that liquid cash covers; None when there are no fixed costs.
    emergency_months: float | None
