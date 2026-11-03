"""Inputs and results of the chat assistant's tools (app/services/chat_tools).

camelCase on the wire like the rest of the chat contract. Inputs are what a
model may send, so they never carry a user: the caller's identity comes from
the server-side ToolContext. Money is Decimal rounded to cents, never float;
it serialises to JSON as a string ("1234.50").
"""

from datetime import date, datetime
from decimal import Decimal
from typing import Literal

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


# --- getCashFlowForecast -----------------------------------------------------


class GetCashFlowForecastInput(ChatModel):
    within_days: int = Field(
        14, ge=1, le=90, strict=True, description="Days ahead to project, 1–90."
    )


class AccountProjection(ChatModel):
    account_id: int
    name: str  # "Name (Institution)"
    balance: Decimal
    bills: Decimal
    income: Decimal
    ending_balance: Decimal
    lowest_balance: Decimal
    lowest_date: date
    # The first day the balance would go below zero, and the bill that does it.
    short_date: date | None
    short_bill: str | None


class GetCashFlowForecastResult(ChatModel):
    start: date
    end: date
    accounts: list[AccountProjection]
    # Bills charged to credit cards in the window (they don't draw on a bank
    # account until the card is paid).
    card_charges: Decimal
    # Bills with no paying account, so not in any projection.
    unlinked: Decimal
    unlinked_count: int


# --- getIncome -----------------------------------------------------------------


class IncomeItem(ChatModel):
    id: int
    name: str
    category: str
    amount: Decimal
    frequency: str
    monthly_amount: Decimal
    next_pay_date: date | None
    deposited_to: str | None


class GetIncomeResult(ChatModel):
    sources: list[IncomeItem]
    monthly_income: Decimal
    monthly_fixed_costs: Decimal
    monthly_left_over: Decimal
    # Share of income left after fixed costs, 0–100; None without income.
    kept_pct: float | None
    liquid_cash: Decimal
    # How many months of fixed costs the checking and savings balances cover.
    emergency_months: float | None


class NoInput(ChatModel):
    """For tools that take no input."""


# --- getDebts ------------------------------------------------------------------


class CardDebt(ChatModel):
    id: int
    name: str
    balance: Decimal
    credit_limit: Decimal | None
    utilization_pct: float | None
    apr: float | None
    due_date: date | None


class LoanDebt(ChatModel):
    id: int
    name: str
    type: str  # loan | mortgage
    balance: Decimal
    original_amount: Decimal | None
    paid_off_pct: float | None
    apr: float | None
    payoff_date: date | None


class GetDebtsResult(ChatModel):
    cards: list[CardDebt]
    loans: list[LoanDebt]
    card_balance: Decimal
    # Over the cards that have a limit set.
    card_limit: Decimal
    utilization_pct: float | None
    loan_balance: Decimal
    total: Decimal


# --- getNetWorthTrend --------------------------------------------------------------

TrendRange = Literal["1W", "1M", "3M", "1Y", "ALL"]


class GetNetWorthTrendInput(ChatModel):
    range: TrendRange = Field("1M", description="1W, 1M, 3M, 1Y or ALL.")


class TrendPoint(ChatModel):
    date: date
    value: Decimal


class GetNetWorthTrendResult(ChatModel):
    range: TrendRange
    # Fewer than two points means there isn't enough history yet.
    points: list[TrendPoint]
    change: Decimal | None
    change_pct: float | None
    high: Decimal | None
    low: Decimal | None


# --- getPortfolio ------------------------------------------------------------------


class BrokerValue(ChatModel):
    broker: str
    value: Decimal
    gain: Decimal
    holdings: int


class Mover(ChatModel):
    ticker: str
    name: str | None
    day_change: Decimal
    day_change_pct: float
    value: Decimal


class GetPortfolioResult(ChatModel):
    value: Decimal
    invested: Decimal
    unrealized_gain: Decimal
    unrealized_gain_pct: float | None
    day_change: Decimal
    realized_gain: Decimal
    annual_dividends: Decimal
    holdings: int
    brokers: list[BrokerValue]
    # Today's largest moves in dollars, up to three each way.
    gainers: list[Mover]
    losers: list[Mover]
    # Prices may be out of date when the last market data fetch failed.
    stale: bool
