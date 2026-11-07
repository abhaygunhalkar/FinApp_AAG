"""Chat assistant tools: read-only functions over the existing services.

Available: getBalance, getUpcomingBills, getBills, getCashFlowForecast,
getIncome, getDebts, getNetWorthTrend, getPortfolio, getOptions, and one that
changes data, markBillPaid (only after the owner confirms). Spending, recent
transactions, budgets and spending comparisons need data the app doesn't have
yet. See docs/chat-tools.md.
"""

from app.config import get_settings
from app.services.chat_tools.accounts import GET_BALANCE
from app.services.chat_tools.bills import GET_BILLS, GET_UPCOMING_BILLS, MARK_BILL_PAID
from app.services.chat_tools.cashflow import GET_CASH_FLOW_FORECAST, GET_INCOME
from app.services.chat_tools.debts import GET_DEBTS
from app.services.chat_tools.networth import GET_NET_WORTH_TREND
from app.services.chat_tools.options import GET_OPTIONS
from app.services.chat_tools.portfolio import GET_PORTFOLIO
from app.services.chat_tools.registry import (
    IdempotencyStore,
    Tool,
    ToolAccessError,
    ToolContext,
    ToolError,
    ToolRegistry,
    money,
)

__all__ = [
    "IdempotencyStore",
    "Tool",
    "ToolAccessError",
    "ToolContext",
    "ToolError",
    "ToolRegistry",
    "build_registry",
    "money",
]


def build_registry(owner_id: str | None = None) -> ToolRegistry:
    """Every available tool, usable only for the app's owner."""
    registry = ToolRegistry(owner_id or get_settings().OWNER_USER_ID)
    for tool in (
        GET_BALANCE,
        GET_UPCOMING_BILLS,
        GET_BILLS,
        MARK_BILL_PAID,
        GET_CASH_FLOW_FORECAST,
        GET_INCOME,
        GET_DEBTS,
        GET_NET_WORTH_TREND,
        GET_PORTFOLIO,
        GET_OPTIONS,
    ):
        registry.register(tool)
    return registry
