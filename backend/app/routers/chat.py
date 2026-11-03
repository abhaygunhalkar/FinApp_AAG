"""POST /api/chat: one turn with the chat assistant.

Every failure, from auth to a bug, comes back as the usual envelope with
`data` holding a ChatResponse of one `error` message, so the widget can always
render it. Nothing internal (stack traces, exception text) is ever returned.
Logs are one JSON line per request, without message content.
"""

import asyncio
import json
import logging
import math
import re
import time
import uuid
from typing import Annotated, Any

from fastapi import APIRouter, Depends, Request
from fastapi.concurrency import run_in_threadpool
from fastapi.responses import JSONResponse
from pydantic import ValidationError
from sqlalchemy.orm import Session

from app.auth import user_from_request
from app.config import Settings, get_settings
from app.database import get_db
from app.schemas.chat import ChatResponse, dump_chat_response, parse_chat_request
from app.schemas.common import ApiResponse
from app.services.chat_engine import create_engine
from app.services.chat_service import ChatService
from app.services.chat_sessions import InMemorySessionStore
from app.services.rate_limit import InMemoryRateLimiter, RateLimiter

router = APIRouter(prefix="/api/chat", tags=["chat"])
logger = logging.getLogger("app.chat")

REQUEST_ID = re.compile(r"^[A-Za-z0-9._-]{1,64}$")


class ChatRequestError(Exception):
    """A chat request that failed; turned into a response by app/main.py."""

    def __init__(
        self,
        status: int,
        code: str,
        message: str,
        retry_after: int | None = None,
    ) -> None:
        super().__init__(message)
        self.status = status
        self.code = code
        self.message = message
        self.retry_after = retry_after
        self.session_id: str | None = None
        self.request_id: str | None = None


def chat_error_response(exc: ChatRequestError) -> JSONResponse:
    headers = {"X-Request-ID": exc.request_id} if exc.request_id else {}
    if exc.retry_after is not None:
        headers["Retry-After"] = str(exc.retry_after)
    return JSONResponse(
        status_code=exc.status,
        headers=headers,
        content={
            "success": False,
            "data": {
                "sessionId": exc.session_id or "unknown",
                "messages": [
                    {"type": "error", "message": exc.message, "code": exc.code}
                ],
            },
            "error": exc.message,
        },
    )


# One of each per process; tests replace them with app.dependency_overrides.
_service: ChatService | None = None
_limiter: RateLimiter | None = None


def get_chat_service() -> ChatService:
    global _service
    if _service is None:
        settings = get_settings()
        _service = ChatService(
            create_engine(),
            InMemorySessionStore(settings.CHAT_SESSION_TTL_MINUTES * 60),
            settings.CHAT_HISTORY_LIMIT,
        )
    return _service


def get_rate_limiter() -> RateLimiter:
    global _limiter
    if _limiter is None:
        _limiter = InMemoryRateLimiter(get_settings().CHAT_RATE_LIMIT_PER_MINUTE)
    return _limiter


async def _read_body(request: Request, limit: int) -> bytes:
    declared = request.headers.get("content-length")
    if declared and declared.isdigit() and int(declared) > limit:
        raise ChatRequestError(413, "too_large", "That message is too long.")
    body = await request.body()
    if len(body) > limit:
        raise ChatRequestError(413, "too_large", "That message is too long.")
    return body


def _validation_message(exc: ValidationError) -> str:
    """Which fields are wrong, without echoing what was sent."""
    fields = sorted(
        {".".join(str(p) for p in e["loc"]) or "body" for e in exc.errors()}
    )
    return f"Invalid chat request: {', '.join(fields)}"


@router.post("", response_model=ApiResponse[ChatResponse])
async def chat(
    request: Request,
    db: Annotated[Session, Depends(get_db)],
    settings: Annotated[Settings, Depends(get_settings)],
    service: Annotated[ChatService, Depends(get_chat_service)],
    limiter: Annotated[RateLimiter, Depends(get_rate_limiter)],
) -> JSONResponse:
    """Answer one chat turn for the signed-in user."""
    incoming = request.headers.get("x-request-id", "")
    request_id = incoming if REQUEST_ID.match(incoming) else uuid.uuid4().hex
    started = time.perf_counter()
    log: dict[str, Any] = {
        "event": "chat_request",
        "request_id": request_id,
        "engine": settings.CHAT_ENGINE,
        "intent": None,
    }
    session_id: str | None = None
    try:
        user = user_from_request(request, settings)
        if user is None:
            raise ChatRequestError(401, "unauthorized", "Please sign in to chat.")
        if user != settings.OWNER_USER_ID:
            raise ChatRequestError(403, "forbidden", "Not allowed")

        wait = limiter.check(user)
        if wait is not None:
            raise ChatRequestError(
                429,
                "rate_limited",
                "Too many messages. Please wait a moment.",
                retry_after=max(1, math.ceil(wait)),
            )

        body = await _read_body(request, settings.CHAT_MAX_BODY_BYTES)
        try:
            data = json.loads(body)
        except ValueError:
            raise ChatRequestError(
                400, "invalid_json", "Invalid chat request"
            ) from None
        if isinstance(data, dict) and isinstance(data.get("sessionId"), str):
            session_id = data["sessionId"][:100] or None
        try:
            chat_request = parse_chat_request(data)
        except ValidationError as exc:
            raise ChatRequestError(
                422, "invalid_request", _validation_message(exc)
            ) from None

        try:
            # The engine runs in a worker thread; if it overruns, the reply
            # is a timeout error and the thread's result is discarded.
            response, intent = await asyncio.wait_for(
                run_in_threadpool(service.handle, db, user, chat_request),
                timeout=settings.CHAT_TIMEOUT_SECONDS,
            )
        except TimeoutError:
            raise ChatRequestError(
                504, "timeout", "That took too long. Please try again."
            ) from None

        log.update(status=200, intent=intent, session_id=session_id)
        return JSONResponse(
            status_code=200,
            headers={"X-Request-ID": request_id},
            content={
                "success": True,
                "data": dump_chat_response(response),
                "error": None,
            },
        )
    except ChatRequestError as exc:
        log.update(status=exc.status, code=exc.code, session_id=session_id)
        exc.session_id, exc.request_id = session_id, request_id
        raise
    except Exception as exc:  # anything unexpected: a bug
        # Only the exception type is logged; its text could contain amounts.
        log.update(status=500, code="internal", error_type=type(exc).__name__)
        error = ChatRequestError(
            500, "internal", "Something went wrong. Please try again."
        )
        error.session_id, error.request_id = session_id, request_id
        raise error from None
    finally:
        log["latency_ms"] = round((time.perf_counter() - started) * 1000, 1)
        logger.info(json.dumps(log, sort_keys=True))
