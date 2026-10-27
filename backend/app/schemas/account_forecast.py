"""Pydantic schemas for the per-account bill forecast."""

from datetime import date
from typing import Literal

from pydantic import BaseModel


class ForecastEvent(BaseModel):
    """One bill or payday in an account's timeline."""

    date: date
    kind: Literal["bill", "income"]
    name: str
    # Negative for bills, positive for income.
    amount: float
    balance_after: float
    # A manual bill already past its due date, counted as due today.
    overdue: bool = False


class AccountForecast(BaseModel):
    """How a bank account's balance moves through the window."""

    account_id: int
    label: str
    account_type: str
    balance: float
    bills_total: float
    income_total: float
    ending_balance: float
    lowest_balance: float
    lowest_date: date
    # First day the balance goes below zero, and the bill that takes it there.
    short_date: date | None
    short_bill: str | None
    events: list[ForecastEvent]


class CardCharges(BaseModel):
    """Bills charged to a credit card in the window (no cash needed yet)."""

    account_id: int
    label: str
    total: float
    count: int


class AccountForecastResponse(BaseModel):
    """Bills and paydays per account between start and end (inclusive)."""

    start: date
    end: date
    accounts: list[AccountForecast]
    cards: list[CardCharges]
    # Bills due in the window that aren't linked to an account.
    unlinked_total: float
    unlinked_count: int
    # Bills without a due date can't be placed in the window.
    undated_count: int
