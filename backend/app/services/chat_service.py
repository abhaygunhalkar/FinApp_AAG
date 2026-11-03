"""One chat turn: load the session, ask the engine, remember the exchange."""

from datetime import date

from sqlalchemy.orm import Session

from app.schemas.chat import ChatRequest, ChatResponse
from app.services.chat_engine import ChatEngine, ChatSession, EngineContext
from app.services.chat_sessions import SessionStore


class ChatService:
    def __init__(
        self, engine: ChatEngine, store: SessionStore, history_limit: int = 20
    ) -> None:
        self.engine = engine
        self.store = store
        self.history_limit = history_limit

    def handle(
        self,
        db: Session,
        user_id: str,
        request: ChatRequest,
        today: date | None = None,
    ) -> tuple[ChatResponse, str | None]:
        """The reply, and the intent the engine matched (for logging).

        Sessions are keyed by user and session id, so one user can never
        continue another's session even with the same id.
        """
        session = self.store.get(user_id, request.session_id) or ChatSession(
            request.session_id
        )
        ctx = EngineContext(db, user_id, session, today or date.today())
        response = self.engine.handle(request, ctx)

        # The last N messages: what the user sent, and what kinds of reply
        # came back (the bot's answers are recomputed, not stored).
        history: list[dict[str, object]] = session.state.setdefault("history", [])
        history.append(
            {
                "role": "user",
                "message": request.message,
                "action": request.action.type if request.action else None,
            }
        )
        history.append({"role": "bot", "types": [m.type for m in response.messages]})
        del history[: -self.history_limit]
        self.store.save(user_id, session)
        intent = session.state.get("intent")
        return response, intent if isinstance(intent, str) else None
