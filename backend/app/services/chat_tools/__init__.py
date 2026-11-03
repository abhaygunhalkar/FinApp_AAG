"""Chat assistant tools: read-only functions over the existing services.

Available: getBalance, getUpcomingBills, getCashFlowForecast, getIncome,
getDebts, getNetWorthTrend, getPortfolio. Spending, recent transactions,
budgets and spending comparisons need data the app doesn't have yet (see
docs/chat-tools.md).
"""

from app.config import get_settings
from app.services.chat_tools.accounts import GET_BALANCE
from app.services.chat_tools.bills import GET_UPCOMING_BILLS
from app.services.chat_tools.cashflow import GET_CASH_FLOW_FORECAST, GET_INCOME
from app.services.chat_tools.debts import GET_DEBTS
from app.services.chat_tools.networth import GET_NET_WORTH_TREND
from app.services.chat_tools.portfolio import GET_PORTFOLIO
from app.services.chat_tools.registry import (
    Tool,
    ToolAccessError,
    ToolContext,
    ToolError,
    ToolRegistry,
    money,
)

__all__ = [
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
        GET_CASH_FLOW_FORECAST,
        GET_INCOME,
        GET_DEBTS,
        GET_NET_WORTH_TREND,
        GET_PORTFOLIO,
    ):
        registry.register(tool)
    return registry
