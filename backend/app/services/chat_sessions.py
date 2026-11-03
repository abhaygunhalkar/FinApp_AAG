"""Server-side chat session state, keyed by user and session id, with a TTL.

SessionStore is the interface; InMemorySessionStore suits one process on one
VM (state is lost on restart). A Redis store can implement the same two
methods later.
"""

import threading
import time
from collections.abc import Callable
from typing import Protocol

from app.services.chat_engine import ChatSession


class SessionStore(Protocol):
    def get(self, user_id: str, session_id: str) -> ChatSession | None: ...

    def save(self, user_id: str, session: ChatSession) -> None: ...


class InMemorySessionStore:
    def __init__(
        self, ttl_seconds: float, clock: Callable[[], float] = time.monotonic
    ) -> None:
        self._ttl = ttl_seconds
        self._clock = clock
        self._lock = threading.Lock()
        # (user_id, session_id) -> (expires_at, session)
        self._items: dict[tuple[str, str], tuple[float, ChatSession]] = {}

    def get(self, user_id: str, session_id: str) -> ChatSession | None:
        with self._lock:
            self._prune()
            item = self._items.get((user_id, session_id))
            return item[1] if item else None

    def save(self, user_id: str, session: ChatSession) -> None:
        with self._lock:
            self._items[(user_id, session.id)] = (
                self._clock() + self._ttl,
                session,
            )

    def _prune(self) -> None:
        now = self._clock()
        for key in [k for k, (exp, _s) in self._items.items() if exp <= now]:
            del self._items[key]
