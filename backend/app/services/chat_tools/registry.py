"""A registry of chat tools a model can call by name (function calling).

Each tool has a name, a description, an input schema and a handler. The
caller's identity is never part of the input: it comes from the server-side
ToolContext, and the registry refuses any user other than the app's owner.
"""

from collections.abc import Callable, Mapping
from dataclasses import dataclass, field
from datetime import date
from decimal import ROUND_HALF_UP, Decimal
from typing import Any, Generic, TypeVar

from pydantic import ValidationError
from sqlalchemy.orm import Session

from app.schemas.chat import ChatModel

In = TypeVar("In", bound=ChatModel)
Out = TypeVar("Out", bound=ChatModel)

CENT = Decimal("0.01")


def money(value: float) -> Decimal:
    """A stored float amount as exact cents (1234.565 -> 1234.57)."""
    # str() gives the shortest decimal that round-trips, so no binary noise.
    return Decimal(str(value)).quantize(CENT, rounding=ROUND_HALF_UP)


class ToolError(Exception):
    """A problem to report back to the model, e.g. bad input or not found."""


class ToolAccessError(ToolError):
    """The context's user may not use the tools."""


@dataclass(frozen=True)
class ToolContext:
    """Who is asking and where; built by the server, never from model input."""

    db: Session
    user_id: str
    today: date = field(default_factory=date.today)


@dataclass(frozen=True)
class Tool(Generic[In, Out]):
    name: str
    description: str
    input_model: type[In]
    output_model: type[Out]
    handler: Callable[[ToolContext, In], Out]

    def definition(self) -> dict[str, Any]:
        """Name, description and JSON Schema input, for function calling."""
        return {
            "name": self.name,
            "description": self.description,
            "input_schema": self.input_model.model_json_schema(by_alias=True),
        }


class ToolRegistry:
    def __init__(self, owner_id: str) -> None:
        self._owner_id = owner_id
        self._tools: dict[str, Tool[Any, Any]] = {}

    def register(self, tool: Tool[Any, Any]) -> None:
        if tool.name in self._tools:
            raise ValueError(f"Tool {tool.name} is already registered")
        self._tools[tool.name] = tool

    def allows(self, user_id: str) -> bool:
        """Only the app's owner may use the tools."""
        return user_id == self._owner_id

    def names(self) -> list[str]:
        return list(self._tools)

    def definitions(self) -> list[dict[str, Any]]:
        return [t.definition() for t in self._tools.values()]

    def call(self, name: str, raw_input: Mapping[str, Any], ctx: ToolContext) -> Any:
        """Check the caller, validate the input, then run the tool.

        Raises:
            ToolAccessError: If the context's user is not the owner.
            ToolError: For an unknown tool, invalid input, or a handler's
                own error (e.g. an account that doesn't exist).
        """
        if not self.allows(ctx.user_id):
            raise ToolAccessError("Not allowed")
        tool = self._tools.get(name)
        if tool is None:
            raise ToolError(f"Unknown tool: {name}")
        try:
            data = tool.input_model.model_validate(dict(raw_input), by_name=False)
        except ValidationError as exc:
            problems = "; ".join(
                f"{'.'.join(str(p) for p in e['loc']) or 'input'}: {e['msg']}"
                for e in exc.errors()
            )
            raise ToolError(f"Invalid input for {name}: {problems}") from None
        return tool.handler(ctx, data)
