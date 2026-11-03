"""A registry of chat tools a model can call by name (function calling).

Each tool has a name, a description, an input schema and a handler. The
caller's identity is never part of the input: it comes from the server-side
ToolContext, and the registry refuses any user other than the app's owner.

Tools that change data (`writes=True`) must take an `idempotencyKey`: the
registry runs a given key at most once, and any repeat gets the first call's
result, so a double click can't apply a change twice.
"""

import threading
from collections import OrderedDict
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
    # Changes data; requires an idempotency_key input field.
    writes: bool = False

    def definition(self) -> dict[str, Any]:
        """Name, description and JSON Schema input, for function calling."""
        return {
            "name": self.name,
            "description": self.description,
            "input_schema": self.input_model.model_json_schema(by_alias=True),
        }


@dataclass
class _Run:
    done: threading.Event = field(default_factory=threading.Event)
    result: Any = None
    error: BaseException | None = None


class IdempotencyStore:
    """Runs each key at most once; repeats get the first run's result.

    A repeat that arrives while the first run is still going waits for it. If
    the first run fails, the key is forgotten, so it can be tried again. Keeps
    the most recent `limit` keys, in memory (one process, like the rest of the
    chat state).
    """

    def __init__(self, limit: int = 1000) -> None:
        self._limit = limit
        self._lock = threading.Lock()
        self._runs: OrderedDict[tuple[str, ...], _Run] = OrderedDict()

    def run(self, key: tuple[str, ...], fn: Callable[[], Any]) -> Any:
        with self._lock:
            run = self._runs.get(key)
            first = run is None
            if run is None:
                run = self._runs[key] = _Run()
                while len(self._runs) > self._limit:
                    self._runs.popitem(last=False)
        if not first:
            run.done.wait(timeout=30)
            if run.error is not None:
                raise run.error
            return run.result
        try:
            run.result = fn()
            return run.result
        except BaseException as exc:
            run.error = exc
            with self._lock:
                self._runs.pop(key, None)
            raise
        finally:
            run.done.set()


class ToolRegistry:
    def __init__(self, owner_id: str) -> None:
        self._owner_id = owner_id
        self._tools: dict[str, Tool[Any, Any]] = {}
        self._idempotency = IdempotencyStore()

    def register(self, tool: Tool[Any, Any]) -> None:
        if tool.name in self._tools:
            raise ValueError(f"Tool {tool.name} is already registered")
        if tool.writes and "idempotency_key" not in tool.input_model.model_fields:
            raise ValueError(f"Tool {tool.name} writes, so needs an idempotency_key")
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
        if tool.writes:
            key = (ctx.user_id, name, str(data.idempotency_key))
            return self._idempotency.run(key, lambda: tool.handler(ctx, data))
        return tool.handler(ctx, data)
