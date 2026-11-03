"""RuleBasedEngine: answers by matching patterns to intents, then calling tools."""

import logging
import re
from typing import Any

from app.schemas.chat import (
    BotMessage,
    ChatRequest,
    ChatResponse,
    ErrorMessage,
    QuickRepliesMessage,
    TextMessage,
)
from app.services.chat_engine.base import EngineContext
from app.services.chat_engine.entities import AccountRef
from app.services.chat_engine.intents import (
    UNSUPPORTED,
    Entities,
    ExtractContext,
    Intent,
    IntentRegistry,
    default_intents,
    starter_chips,
)
from app.services.chat_tools import ToolContext, ToolError, ToolRegistry

logger = logging.getLogger(__name__)

LOG_LIMIT = 200


def redact(text: str, names: list[str]) -> str:
    """A message safe to log: no numbers, emails, or the user's account names."""
    out = re.sub(r"\S+@\S+", "<email>", text)
    for name in sorted(names, key=len, reverse=True):
        out = re.sub(re.escape(name), "<account>", out, flags=re.IGNORECASE)
    out = re.sub(r"\d", "#", out)
    return out[:LOG_LIMIT]


class RuleBasedEngine:
    def __init__(self, tools: ToolRegistry, intents: IntentRegistry | None = None):
        self.tools = tools
        self.intents = intents or default_intents()
        missing = [
            i.name
            for i in self.intents.all()
            if i.tool is not None and i.tool not in tools.names()
        ]
        if missing:
            raise ValueError(f"Intents use tools that don't exist: {missing}")

    def handle(self, request: ChatRequest, ctx: EngineContext) -> ChatResponse:
        # What this turn was understood as, for logs: an intent name, or
        # "unsupported", "fallback", "unknown_action", "forbidden".
        ctx.session.state["intent"] = "forbidden"
        if not self.tools.allows(ctx.user_id):
            messages: list[BotMessage] = [
                ErrorMessage(type="error", message="Not allowed", code="forbidden")
            ]
        else:
            messages = self._answer(request, ctx)
        return ChatResponse(session_id=request.session_id, messages=messages)

    # --- turn handling -------------------------------------------------------

    def _answer(self, request: ChatRequest, ctx: EngineContext) -> list[BotMessage]:
        accounts_cache: list[AccountRef] | None = None

        def accounts() -> list[AccountRef]:
            nonlocal accounts_cache
            if accounts_cache is None:
                result = self._call("getBalance", {}, ctx)
                accounts_cache = [
                    AccountRef(a.id, a.name, a.institution, a.type)
                    for a in result.accounts
                ]
            return accounts_cache

        if request.action is not None:
            # A clicked quick reply: run its intent directly, no parsing.
            intent = self.intents.get(request.action.type)
            if intent is None:
                ctx.session.state["intent"] = "unknown_action"
                return self._error("That option isn't available any more.", ctx)
            entities = intent.from_payload(request.action.payload or {})
            return self._run(intent, entities, ctx)

        text = request.message or ""
        if UNSUPPORTED.search(text.lower()):
            ctx.session.state["intent"] = "unsupported"
            self._log_unmatched(text, accounts, "unsupported")
            return [
                TextMessage(
                    type="text",
                    text="I can't see spending, transactions or budgets yet. I can "
                    "help with your net worth, account balances and upcoming bills.",
                ),
                QuickRepliesMessage(
                    type="quickReplies", options=starter_chips(ctx.today)
                ),
            ]
        intent = self.intents.match(text)
        if intent is None:
            ctx.session.state["intent"] = "fallback"
            self._log_unmatched(text, accounts, "no_intent")
            return [
                TextMessage(
                    type="text",
                    text="Sorry, I didn't catch that. I can help with your net "
                    "worth, account balances and upcoming bills:",
                ),
                QuickRepliesMessage(
                    type="quickReplies", options=starter_chips(ctx.today)
                ),
            ]
        try:
            entities = intent.extract(text, ExtractContext(ctx.today, accounts))
        except ToolError as exc:
            return self._error(str(exc), ctx)
        return self._run(intent, entities, ctx)

    def _run(
        self, intent: Intent, entities: Entities, ctx: EngineContext
    ) -> list[BotMessage]:
        ctx.session.state["intent"] = intent.name
        question = intent.clarify(entities)
        if question:
            return question
        missing = [k for k in intent.required if k not in entities]
        if missing:
            return self._error(f"I need {', '.join(missing)} to answer that.", ctx)
        result: Any = None
        if intent.tool is not None:
            try:
                result = self._call(intent.tool, intent.build_input(entities), ctx)
            except ToolError as exc:
                return self._error(str(exc), ctx)
        return [
            *intent.format(result, entities, ctx.today),
            QuickRepliesMessage(
                type="quickReplies",
                options=intent.follow_ups(result, entities, ctx.today),
            ),
        ]

    def _call(self, tool: str, data: dict[str, Any], ctx: EngineContext) -> Any:
        return self.tools.call(tool, data, ToolContext(ctx.db, ctx.user_id, ctx.today))

    def _error(self, message: str, ctx: EngineContext) -> list[BotMessage]:
        return [
            ErrorMessage(type="error", message=message),
            QuickRepliesMessage(type="quickReplies", options=starter_chips(ctx.today)),
        ]

    def _log_unmatched(self, text: str, accounts: Any, reason: str) -> None:
        """Record what people ask that isn't covered, to plan new intents."""
        try:
            names = [n for a in accounts() for n in (a.name, a.institution) if n]
        except ToolError:
            names = []
        logger.info("Unmatched chat message (%s): %s", reason, redact(text, names))
