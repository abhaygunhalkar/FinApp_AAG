"""Inputs and results of the chat assistant's tools (app/services/chat_tools).

camelCase on the wire like the rest of the chat contract. Inputs are what a
model may send, so they never carry a user: the caller's identity comes from
the server-side ToolContext. Money is Decimal rounded to cents, never float;
it serialises to JSON as a string ("1234.50").
"""

from datetime import date, datetime
from decimal import Decimal

from pydantic import Field

from app.schemas.chat import ChatModel


class GetBalanceInput(ChatModel):
    """Leave accountId out for every account plus net worth totals."""

    account_id: int | None = Field(
        None, ge=1, strict=True, description="One Net Worth account's id."
    )


class AccountBalance(ChatModel):
    id: int
    name: str
    institution: str | None
    type: str
    is_asset: bool
    # Liabilities (cards, loans) are positive amounts owed.
    balance: Decimal
    last_updated: datetime | None


class BalanceTotals(ChatModel):
    """Net worth as the Net Worth page shows it; assets include the portfolio."""

    assets: Decimal
    liabilities: Decimal
    net_worth: Decimal
    portfolio: Decimal


class GetBalanceResult(ChatModel):
    accounts: list[AccountBalance]
    totals: BalanceTotals | None = None


class GetUpcomingBillsInput(ChatModel):
    within_days: int = Field(
        30, ge=1, le=60, strict=True, description="Days ahead to look, 1–60."
    )


class UpcomingBill(ChatModel):
    bill_id: int
    name: str
    category: str
    amount: Decimal
    # An overdue manual bill is due today; `overdue` says it was missed.
    due_date: date
    overdue: bool
    autopay: bool
    paid_from: str | None


class GetUpcomingBillsResult(ChatModel):
    start: date
    end: date
    bills: list[UpcomingBill]
    total: Decimal
    # Bills with no due date set can't be placed in the window.
    without_due_date: int
