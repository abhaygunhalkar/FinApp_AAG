"""The chat engine interface: one user turn in, the bot's messages out.

Callers (the future chat endpoint) depend only on ChatEngine, and get an
engine from create_engine(), so a different engine can replace the rule-based
one without changing them.
"""

from dataclasses import dataclass, field
from datetime import date
from typing import Any, Protocol

from sqlalchemy.orm import Session

from app.schemas.chat import ChatRequest, ChatResponse


@dataclass
class ChatSession:
    """One conversation. `state` is free for an engine to keep things in."""

    id: str
    state: dict[str, Any] = field(default_factory=dict)


@dataclass(frozen=True)
class EngineContext:
    """Who is asking, built by the server; never taken from the request."""

    db: Session
    user_id: str
    session: ChatSession
    today: date = field(default_factory=date.today)


class ChatEngine(Protocol):
    def handle(self, request: ChatRequest, ctx: EngineContext) -> ChatResponse:
        """Answer one turn. Never raises for bad input; replies with an error."""
        ...
