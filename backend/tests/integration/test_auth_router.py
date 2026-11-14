"""Integration tests for /api/auth and the sign-in wall around the API."""

from collections.abc import Generator

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.config import Settings, get_settings
from app.database import get_db
from app.main import app
from app.routers.auth import get_login_limiter
from app.services import passwords
from app.services.auth_service import AuthService
from app.services.rate_limit import InMemoryRateLimiter

PASSWORD = "correct horse battery"
CSRF = {"X-Requested-With": "FinApp"}
CREDS = {"username": "abhay", "password": PASSWORD}


@pytest.fixture
def client(
    db_session: Session, real_auth: None, monkeypatch: pytest.MonkeyPatch
) -> Generator[TestClient, None, None]:
    monkeypatch.setattr(passwords, "SCRYPT_N", 2**10)
    AuthService.create_owner(db_session, "abhay", PASSWORD)

    def _db() -> Generator[Session, None, None]:
        yield db_session

    app.dependency_overrides[get_db] = _db
    app.dependency_overrides[get_settings] = lambda: Settings(
        AUTH_COOKIE_SECURE=True, AUTH_MAX_FAILED_LOGINS=50
    )
    app.dependency_overrides[get_login_limiter] = lambda: InMemoryRateLimiter(100)
    # https so the Secure cookie comes back on later requests.
    with TestClient(app, base_url="https://testserver") as tc:
        yield tc
    app.dependency_overrides.clear()


def sign_in(client: TestClient) -> None:
    r = client.post("/api/auth/login", json=CREDS, headers=CSRF)
    assert r.status_code == 200, r.text


class TestSignIn:
    def test_sets_a_locked_down_session_cookie(self, client: TestClient) -> None:
        r = client.post("/api/auth/login", json=CREDS, headers=CSRF)
        assert r.json() == {
            "success": True,
            "data": {"username": "abhay"},
            "error": None,
        }
        cookie = r.headers["set-cookie"].lower()
        assert cookie.startswith("finapp_session=")
        for flag in ("httponly", "secure", "samesite=strict", "path=/"):
            assert flag in cookie
        # A browser-session cookie: the server enforces how long it lasts.
        assert "max-age" not in cookie and "expires" not in cookie

    def test_wrong_password(self, client: TestClient) -> None:
        r = client.post(
            "/api/auth/login", json={**CREDS, "password": "nope"}, headers=CSRF
        )
        assert r.status_code == 401
        assert r.json()["error"] == "Incorrect username or password."
        assert "set-cookie" not in r.headers

    def test_me_needs_a_session(self, client: TestClient) -> None:
        assert client.get("/api/auth/me").status_code == 401
        sign_in(client)
        assert client.get("/api/auth/me").json()["data"] == {"username": "abhay"}

    def test_sign_out(self, client: TestClient) -> None:
        sign_in(client)
        r = client.post("/api/auth/logout", headers=CSRF)
        assert r.status_code == 200
        assert 'finapp_session=""' in r.headers["set-cookie"]
        assert client.get("/api/auth/me").status_code == 401

    def test_too_many_attempts_from_one_address(self, client: TestClient) -> None:
        limiter = InMemoryRateLimiter(2)
        app.dependency_overrides[get_login_limiter] = lambda: limiter
        bad = {**CREDS, "password": "nope"}
        for _ in range(2):
            client.post("/api/auth/login", json=bad, headers=CSRF)
        r = client.post("/api/auth/login", json=CREDS, headers=CSRF)
        assert r.status_code == 429


class TestTheApiIsClosedWithoutASession:
    @pytest.mark.parametrize(
        "path",
        [
            "/api/holdings",
            "/api/net-worth/accounts",
            "/api/dashboard/summary",
            "/api/recurring-expenses",
        ],
    )
    def test_data_needs_a_session(self, client: TestClient, path: str) -> None:
        r = client.get(path)
        assert r.status_code == 401
        assert r.json() == {"success": False, "data": None, "error": "Please sign in."}
        sign_in(client)
        assert client.get(path).status_code == 200

    def test_a_made_up_cookie_is_refused(self, client: TestClient) -> None:
        client.cookies.set("finapp_session", "guess")
        assert client.get("/api/holdings").status_code == 401

    def test_health_check_stays_open(self, client: TestClient) -> None:
        assert client.get("/health").status_code == 200


class TestCsrfHeader:
    def test_changes_need_the_header(self, client: TestClient) -> None:
        sign_in(client)
        body = {"name": "Cash", "account_type": "checking", "balance": 10}
        r = client.post("/api/net-worth/accounts", json=body)
        assert r.status_code == 403
        assert client.post(
            "/api/net-worth/accounts", json=body, headers=CSRF
        ).status_code in (200, 201)

    def test_sign_in_needs_it_too(self, client: TestClient) -> None:
        assert client.post("/api/auth/login", json=CREDS).status_code == 403

    def test_reads_dont(self, client: TestClient) -> None:
        sign_in(client)
        assert client.get("/api/holdings").status_code == 200
