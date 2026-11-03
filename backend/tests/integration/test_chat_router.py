"""Integration tests for POST /api/chat."""

import json
import logging
import time
from collections.abc import Generator
from datetime import date
from typing import Any

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.config import Settings, get_settings
from app.database import get_db
from app.main import app
from app.models.financial_account import FinancialAccount
from app.models.recurring_expense import RecurringExpense
from app.routers.chat import get_chat_service, get_rate_limiter
from app.schemas.chat import ChatRequest, ChatResponse, parse_chat_response
from app.services.chat_engine import ChatSession, RuleBasedEngine
from app.services.chat_service import ChatService
from app.services.chat_sessions import InMemorySessionStore
from app.services.chat_tools import build_registry
from app.services.rate_limit import InMemoryRateLimiter

OWNER = "abhay"
SIGNED_IN = {"X-Remote-User": OWNER}


class FakeClock:
    def __init__(self) -> None:
        self.now = 1000.0

    def __call__(self) -> float:
        return self.now


class Env:
    """Everything a test may want to change or inspect."""

    def __init__(self) -> None:
        self.settings = Settings(
            OWNER_USER_ID=OWNER,
            # TestClient connects from host "testclient", standing in for nginx.
            AUTH_TRUSTED_PROXIES="testclient",
            AUTH_DEV_USER=None,
            CHAT_RATE_LIMIT_PER_MINUTE=100,
            CHAT_MAX_BODY_BYTES=2048,
            CHAT_TIMEOUT_SECONDS=5,
        )
        self.store = InMemorySessionStore(ttl_seconds=600)
        self.service = ChatService(
            RuleBasedEngine(build_registry(OWNER)), self.store, history_limit=4
        )
        self.clock = FakeClock()
        self.limiter = InMemoryRateLimiter(100, clock=self.clock)


@pytest.fixture
def env() -> Env:
    return Env()


@pytest.fixture
def client(db_session: Session, env: Env) -> Generator[TestClient, None, None]:
    def _db() -> Generator[Session, None, None]:
        yield db_session

    app.dependency_overrides[get_db] = _db
    app.dependency_overrides[get_settings] = lambda: env.settings
    app.dependency_overrides[get_chat_service] = lambda: env.service
    app.dependency_overrides[get_rate_limiter] = lambda: env.limiter
    with TestClient(app) as tc:
        yield tc
    app.dependency_overrides.clear()


@pytest.fixture
def data(db_session: Session) -> Session:
    db_session.add_all(
        [
            FinancialAccount(
                name="Total Checking",
                institution="Chase",
                account_type="checking",
                balance=4321.09,
            ),
            FinancialAccount(
                name="Sapphire",
                institution="Chase",
                account_type="credit_card",
                balance=876.54,
            ),
            RecurringExpense(
                name="Rent",
                category="Housing",
                amount=2400,
                frequency="monthly",
                next_due_date=date.today(),
            ),
        ]
    )
    db_session.commit()
    return db_session


def post(
    client: TestClient,
    body: Any,
    headers: dict[str, str] | None = None,
) -> Any:
    return client.post(
        "/api/chat", json=body, headers=SIGNED_IN if headers is None else headers
    )


def error_of(response: Any) -> dict[str, Any]:
    """Every failure is the envelope with one error BotMessage."""
    body = response.json()
    assert body["success"] is False
    parse_chat_response(body["data"])
    [message] = body["data"]["messages"]
    assert message["type"] == "error"
    assert body["error"] == message["message"]
    assert "Traceback" not in response.text
    return dict(message)


def chat_log(caplog: pytest.LogCaptureFixture) -> dict[str, Any]:
    [record] = [r for r in caplog.records if r.name == "app.chat"]
    return dict(json.loads(record.getMessage()))


# --- auth ------------------------------------------------------------------


class TestAuth:
    def test_no_user_is_401(self, client: TestClient) -> None:
        r = post(client, {"sessionId": "s", "message": "help"}, headers={})
        assert r.status_code == 401
        assert error_of(r)["code"] == "unauthorized"
        assert r.json()["data"]["sessionId"] == "unknown"

    def test_blank_user_header_is_401(self, client: TestClient) -> None:
        r = post(client, {"sessionId": "s", "message": "help"}, {"X-Remote-User": " "})
        assert r.status_code == 401

    def test_header_from_an_untrusted_host_is_ignored(
        self, client: TestClient, env: Env
    ) -> None:
        env.settings.AUTH_TRUSTED_PROXIES = "127.0.0.1"
        r = post(client, {"sessionId": "s", "message": "help"})
        assert r.status_code == 401

    def test_proxy_secret_proves_the_request_came_through_nginx(
        self, client: TestClient, env: Env
    ) -> None:
        # Behind nginx, uvicorn reports the browser's address, not nginx's,
        # so the address check fails; the shared secret is what counts.
        env.settings.AUTH_TRUSTED_PROXIES = "127.0.0.1"
        env.settings.AUTH_PROXY_SECRET = "s3cret"
        body = {"sessionId": "s", "message": "help"}
        ok = post(client, body, {**SIGNED_IN, "X-Proxy-Secret": "s3cret"})
        assert ok.status_code == 200

    @pytest.mark.parametrize("secret", [None, "", "wrong", "s3cret "])
    def test_wrong_or_missing_proxy_secret_is_401(
        self, client: TestClient, env: Env, secret: str | None
    ) -> None:
        env.settings.AUTH_PROXY_SECRET = "s3cret"
        headers = dict(SIGNED_IN)
        if secret is not None:
            headers["X-Proxy-Secret"] = secret
        # Even from a trusted address, the secret is now required.
        r = post(client, {"sessionId": "s", "message": "help"}, headers)
        assert r.status_code == 401

    def test_another_signed_in_user_is_403(self, client: TestClient) -> None:
        r = post(
            client, {"sessionId": "s", "message": "help"}, {"X-Remote-User": "eve"}
        )
        assert r.status_code == 403
        assert error_of(r)["code"] == "forbidden"

    def test_dev_user_for_local_development(self, client: TestClient, env: Env) -> None:
        env.settings.AUTH_DEV_USER = OWNER
        r = post(client, {"sessionId": "s", "message": "help"}, headers={})
        assert r.status_code == 200

    def test_user_cannot_be_set_in_the_body(self, client: TestClient) -> None:
        r = post(client, {"sessionId": "s", "message": "help", "userId": OWNER}, {})
        assert r.status_code == 401


# --- validation --------------------------------------------------------------


class TestValidation:
    @pytest.mark.parametrize(
        ("body", "fields"),
        [
            ({"message": "hi"}, "sessionId"),
            ({"sessionId": "s"}, "body"),
            ({"sessionId": "s", "message": "hi", "action": {"type": "x"}}, "body"),
            ({"sessionId": "s", "message": "   "}, "message"),
            ({"session_id": "s", "message": "hi"}, "sessionId, session_id"),
            ({"sessionId": "s", "action": {"type": ""}}, "action.type"),
            ([1, 2], "body"),
        ],
    )
    def test_invalid_body_is_422(
        self, client: TestClient, body: Any, fields: str
    ) -> None:
        r = post(client, body)
        assert r.status_code == 422
        message = error_of(r)
        assert message["code"] == "invalid_request"
        assert message["message"] == f"Invalid chat request: {fields}"

    def test_validation_errors_dont_echo_the_input(self, client: TestClient) -> None:
        r = post(client, {"sessionId": "s", "message": "x" * 2001})
        assert r.status_code in (413, 422)
        assert "xxxx" not in r.text

    def test_session_id_is_kept_on_errors(self, client: TestClient) -> None:
        r = post(client, {"sessionId": "s-9", "message": "   "})
        assert r.json()["data"]["sessionId"] == "s-9"

    def test_not_json_is_400(self, client: TestClient) -> None:
        r = client.post(
            "/api/chat",
            content=b"{not json",
            headers={**SIGNED_IN, "Content-Type": "application/json"},
        )
        assert r.status_code == 400
        assert error_of(r)["code"] == "invalid_json"

    def test_too_large_is_413(self, client: TestClient) -> None:
        r = post(client, {"sessionId": "s", "message": "y" * 3000})
        assert r.status_code == 413
        assert error_of(r)["code"] == "too_large"


# --- happy paths -------------------------------------------------------------


def nulls(value: Any, path: str = "") -> list[str]:
    """Where JSON has null, other than table cells (the only place allowed)."""
    if value is None:
        return [path]
    if isinstance(value, dict):
        if value.get("type") == "table":
            return []
        return [p for k, v in value.items() for p in nulls(v, f"{path}.{k}")]
    if isinstance(value, list):
        return [p for i, v in enumerate(value) for p in nulls(v, f"{path}[{i}]")]
    return []


def answer(client: TestClient, body: dict[str, Any]) -> dict[str, Any]:
    r = post(client, body)
    assert r.status_code == 200, r.text
    payload = r.json()
    assert payload["success"] is True and payload["error"] is None
    parse_chat_response(payload["data"])
    # Optional fields are left out, never null: the frontend's Zod schema
    # (and the contract) don't allow null there.
    assert nulls(payload["data"]) == []
    assert payload["data"]["sessionId"] == body["sessionId"]
    assert r.headers["X-Request-ID"]
    return dict(payload["data"])


class TestIntents:
    def test_net_worth(self, client: TestClient, data: Session) -> None:
        reply = answer(client, {"sessionId": "s", "message": "what's my net worth?"})
        stats = {
            m["label"]: m["value"] for m in reply["messages"] if m["type"] == "stat"
        }
        assert stats["Net worth"] == pytest.approx(3444.55)

    def test_balances(self, client: TestClient, data: Session) -> None:
        reply = answer(client, {"sessionId": "s", "message": "sapphire balance"})
        assert reply["messages"][0]["value"] == 876.54

    def test_upcoming_bills(self, client: TestClient, data: Session) -> None:
        reply = answer(client, {"sessionId": "s", "message": "bills due this week"})
        assert reply["messages"][0]["type"] == "stat"
        assert reply["messages"][1]["rows"][0][0] == "Rent"

    @pytest.mark.parametrize(
        ("message", "intent"),
        [
            ("will I have enough to cover my bills?", "cashFlowForecast"),
            ("when's my next paycheck?", "income"),
            ("credit card utilization", "debts"),
            ("how has my net worth changed this month?", "netWorthTrend"),
            ("how is my portfolio doing today?", "portfolio"),
        ],
    )
    def test_new_intents(
        self,
        client: TestClient,
        env: Env,
        data: Session,
        message: str,
        intent: str,
    ) -> None:
        reply = answer(client, {"sessionId": "s-new", "message": message})
        assert reply["messages"][-1]["type"] == "quickReplies"
        session = env.store.get(OWNER, "s-new")
        assert session is not None and session.state["intent"] == intent

    def test_help(self, client: TestClient) -> None:
        reply = answer(client, {"sessionId": "s", "message": "help"})
        assert reply["messages"][-1]["type"] == "quickReplies"

    def test_fallback(self, client: TestClient) -> None:
        reply = answer(client, {"sessionId": "s", "message": "tell me a joke"})
        assert reply["messages"][0]["text"].startswith("Sorry")

    def test_quick_reply_action(self, client: TestClient, data: Session) -> None:
        reply = answer(
            client,
            {
                "sessionId": "s",
                "action": {"type": "upcomingBills", "payload": {"withinDays": 60}},
            },
        )
        assert reply["messages"][0]["type"] == "stat"


# --- sessions ----------------------------------------------------------------


class TestSessions:
    def test_history_is_kept_per_user_and_session(
        self, client: TestClient, env: Env
    ) -> None:
        for text in ["help", "net worth", "balances"]:
            answer(client, {"sessionId": "s-1", "message": text})
        session = env.store.get(OWNER, "s-1")
        assert session is not None
        history = session.state["history"]
        # history_limit=4: the last two exchanges.
        assert [h.get("message") for h in history] == [
            "net worth",
            None,
            "balances",
            None,
        ]
        assert history[-1]["types"][-1] == "quickReplies"
        assert session.state["intent"] == "balances"
        # Same session id, other user: nothing.
        assert env.store.get("eve", "s-1") is None

    def test_sessions_expire(self) -> None:
        clock = FakeClock()
        store = InMemorySessionStore(ttl_seconds=60, clock=clock)
        store.save(OWNER, ChatSession("s"))
        clock.now += 59
        assert store.get(OWNER, "s") is not None
        clock.now += 2
        assert store.get(OWNER, "s") is None


# --- rate limiting -------------------------------------------------------------


class TestRateLimit:
    def test_over_the_limit_is_429_until_the_window_passes(
        self, client: TestClient, env: Env
    ) -> None:
        env.limiter = InMemoryRateLimiter(3, clock=env.clock)
        for _ in range(3):
            assert (
                post(client, {"sessionId": "s", "message": "help"}).status_code == 200
            )
        r = post(client, {"sessionId": "s", "message": "help"})
        assert r.status_code == 429
        assert error_of(r)["code"] == "rate_limited"
        assert r.headers["Retry-After"] == "60"
        env.clock.now += 30
        assert (
            post(client, {"sessionId": "s", "message": "help"}).headers["Retry-After"]
            == "30"
        )
        env.clock.now += 31
        assert post(client, {"sessionId": "s", "message": "help"}).status_code == 200

    def test_limit_is_per_user(self, client: TestClient, env: Env) -> None:
        env.limiter = InMemoryRateLimiter(1, clock=env.clock)
        assert post(client, {"sessionId": "s", "message": "help"}).status_code == 200
        assert env.limiter.check("someone-else") is None

    def test_unauthenticated_requests_dont_use_the_owners_quota(
        self, client: TestClient, env: Env
    ) -> None:
        env.limiter = InMemoryRateLimiter(1, clock=env.clock)
        for _ in range(3):
            post(client, {"sessionId": "s", "message": "help"}, headers={})
        assert post(client, {"sessionId": "s", "message": "help"}).status_code == 200


# --- failures and logging ------------------------------------------------------


class SlowService(ChatService):
    def handle(self, *args: Any, **kwargs: Any) -> tuple[ChatResponse, str | None]:
        time.sleep(0.5)
        return super().handle(*args, **kwargs)


class BrokenService(ChatService):
    def handle(
        self, db: Session, user_id: str, request: ChatRequest, today: Any = None
    ) -> tuple[ChatResponse, str | None]:
        raise RuntimeError("balance was 4321.09 for Total Checking")


class TestFailures:
    def test_timeout_is_504(self, client: TestClient, env: Env) -> None:
        env.settings.CHAT_TIMEOUT_SECONDS = 0.05
        env.service = SlowService(env.service.engine, env.store)
        r = post(client, {"sessionId": "s", "message": "help"})
        assert r.status_code == 504
        assert error_of(r)["code"] == "timeout"

    def test_a_bug_is_a_generic_500_without_details(
        self, client: TestClient, env: Env, caplog: pytest.LogCaptureFixture
    ) -> None:
        env.service = BrokenService(env.service.engine, env.store)
        with caplog.at_level(logging.INFO, logger="app.chat"):
            r = post(client, {"sessionId": "s", "message": "help"})
        assert r.status_code == 500
        message = error_of(r)
        assert message == {
            "type": "error",
            "message": "Something went wrong. Please try again.",
            "code": "internal",
        }
        assert "4321" not in r.text and "RuntimeError" not in r.text
        log = chat_log(caplog)
        assert (log["status"], log["error_type"]) == (500, "RuntimeError")
        assert "4321" not in json.dumps(log)


class TestLogging:
    def test_one_structured_line_without_content(
        self, client: TestClient, data: Session, caplog: pytest.LogCaptureFixture
    ) -> None:
        with caplog.at_level(logging.INFO, logger="app.chat"):
            r = client.post(
                "/api/chat",
                json={"sessionId": "s-7", "message": "what do I owe on sapphire"},
                headers={**SIGNED_IN, "X-Request-ID": "req-123"},
            )
        assert r.headers["X-Request-ID"] == "req-123"
        log = chat_log(caplog)
        assert log["event"] == "chat_request"
        assert (log["request_id"], log["engine"], log["intent"]) == (
            "req-123",
            "rules",
            "balances",
        )
        assert (log["status"], log["session_id"]) == (200, "s-7")
        assert isinstance(log["latency_ms"], float)
        text = json.dumps(log)
        assert "sapphire" not in text.lower() and "876" not in text

    def test_bad_request_ids_are_replaced(
        self, client: TestClient, caplog: pytest.LogCaptureFixture
    ) -> None:
        with caplog.at_level(logging.INFO, logger="app.chat"):
            r = client.post(
                "/api/chat",
                json={"sessionId": "s", "message": "help"},
                headers={**SIGNED_IN, "X-Request-ID": "bad id\nwith newline"},
            )
        assert len(r.headers["X-Request-ID"]) == 32
        assert chat_log(caplog)["request_id"] == r.headers["X-Request-ID"]

    def test_errors_are_logged_with_their_code(
        self, client: TestClient, caplog: pytest.LogCaptureFixture
    ) -> None:
        with caplog.at_level(logging.INFO, logger="app.chat"):
            post(client, {"sessionId": "s", "message": "help"}, headers={})
        log = chat_log(caplog)
        assert (log["status"], log["code"], log["intent"]) == (
            401,
            "unauthorized",
            None,
        )
