"""Pick the chat engine from the CHAT_ENGINE setting."""

from collections.abc import Callable

from app.config import get_settings
from app.services.chat_engine.base import ChatEngine
from app.services.chat_engine.rules import RuleBasedEngine
from app.services.chat_tools import ToolRegistry, build_registry

# Add an engine here (e.g. "llm") when it exists; callers don't change.
ENGINES: dict[str, Callable[[ToolRegistry], ChatEngine]] = {
    "rules": RuleBasedEngine,
}


def create_engine(
    name: str | None = None, tools: ToolRegistry | None = None
) -> ChatEngine:
    """The engine named by `name`, else by the CHAT_ENGINE setting."""
    name = name or get_settings().CHAT_ENGINE
    factory = ENGINES.get(name)
    if factory is None:
        available = ", ".join(sorted(ENGINES))
        raise ValueError(f"Unknown CHAT_ENGINE '{name}'. Available: {available}")
    return factory(tools or build_registry())
