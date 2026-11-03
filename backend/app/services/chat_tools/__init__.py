"""Chat assistant tools: read-only functions over the existing services.

Available: getBalance, getUpcomingBills. Spending, recent transactions,
budgets and spending comparisons need data the app doesn't have yet (see
docs/chat-tools.md).
"""

from app.config import get_settings
from app.services.chat_tools.accounts import GET_BALANCE
from app.services.chat_tools.bills import GET_UPCOMING_BILLS
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
    registry.register(GET_BALANCE)
    registry.register(GET_UPCOMING_BILLS)
    return registry
