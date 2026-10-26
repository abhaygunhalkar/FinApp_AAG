"""Pydantic schemas for recurring (fixed) expenses."""

from datetime import date, datetime
from typing import Literal

from pydantic import BaseModel, Field

ExpenseCategory = Literal[
    "Housing",
    "Utilities",
    "Transportation",
    "Auto loans",
    "Insurance",
    "Health & fitness",
    "Subscriptions",
    "Debt payments",
    "Childcare & education",
    "Kids activities",
    "Savings & investing",
    "Charity & social service",
    "Other",
]

ExpenseFrequency = Literal[
    "weekly", "biweekly", "monthly", "quarterly", "semiannual", "annual"
]


class RecurringExpenseCreate(BaseModel):
    """Schema for adding a recurring expense."""

    name: str = Field(..., min_length=1, max_length=200)
    category: ExpenseCategory
    amount: float = Field(..., gt=0, le=10_000_000)
    frequency: ExpenseFrequency = "monthly"
    next_due_date: date | None = None
    # Link to a Net Worth account; paid_from is free text used only without a link.
    paid_from_account_id: int | None = None
    paid_from: str | None = Field(default=None, max_length=200)
    autopay: bool = False
    notes: str | None = Field(default=None, max_length=500)


class RecurringExpenseUpdate(BaseModel):
    """Schema for editing a recurring expense; only fields sent are changed."""

    name: str | None = Field(default=None, min_length=1, max_length=200)
    category: ExpenseCategory | None = None
    amount: float | None = Field(default=None, gt=0, le=10_000_000)
    frequency: ExpenseFrequency | None = None
    next_due_date: date | None = None
    paid_from_account_id: int | None = None
    paid_from: str | None = Field(default=None, max_length=200)
    autopay: bool | None = None
    notes: str | None = Field(default=None, max_length=500)


class RecurringExpenseResponse(BaseModel):
    """Schema for recurring expense response data."""

    id: int
    name: str
    category: str
    amount: float
    frequency: str
    monthly_amount: float
    next_due_date: date | None
    paid_from_account_id: int | None
    # Linked account's current "Name (Institution)", else the stored free text.
    paid_from: str | None
    autopay: bool
    notes: str | None
    created_at: datetime
    updated_at: datetime
