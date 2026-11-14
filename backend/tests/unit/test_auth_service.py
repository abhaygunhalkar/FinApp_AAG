"""Tests for passwords, sign-in, lockout and session expiry."""

from collections.abc import Generator
from datetime import datetime, timedelta

import pytest
from fastapi import HTTPException
from sqlalchemy.orm import Session

from app.config import Settings
from app.models.auth_session import AuthSession
from app.models.owner import Owner
from app.services import passwords
from app.services.auth_service import AuthService, token_hash
from app.services.passwords import hash_password, password_problem, verify_password

PASSWORD = "correct horse battery"
NOW = datetime(2026, 11, 13, 9, 0)
SETTINGS = Settings(
    AUTH_SESSION_IDLE_MINUTES=60,
    AUTH_SESSION_MAX_HOURS=12,
    AUTH_MAX_FAILED_LOGINS=3,
    AUTH_LOCKOUT_MINUTES=15,
)


@pytest.fixture(autouse=True)
def fast_hashing(monkeypatch: pytest.MonkeyPatch) -> Generator[None, None, None]:
    # The real cost is ~50 ms a hash; tests don't need it.
    monkeypatch.setattr(passwords, "SCRYPT_N", 2**10)
    yield


@pytest.fixture
def owner(db_session: Session) -> Owner:
    return AuthService.create_owner(db_session, "abhay", PASSWORD)


def login(db: Session, username: str = "abhay", password: str = PASSWORD, **kw):  # type: ignore[no-untyped-def]
    return AuthService.login(db, SETTINGS, username, password, now=kw.pop("now", NOW))


class TestPasswords:
    def test_hash_round_trip_with_a_fresh_salt(self) -> None:
        a, b = hash_password(PASSWORD), hash_password(PASSWORD)
        assert a != b
        assert a.startswith("scrypt$1024$8$1$")
        assert verify_password(PASSWORD, a)
        assert not verify_password(PASSWORD + "x", a)

    @pytest.mark.parametrize(
        "stored", ["", "plain", "bcrypt$1$2$3$4$5", "scrypt$x$8$1$a$b"]
    )
    def test_unreadable_hash_never_matches(self, stored: str) -> None:
        assert not verify_password(PASSWORD, stored)

    @pytest.mark.parametrize(
        ("password", "problem"),
        [
            ("short1!", "at least 12"),
            ("x" * 129, "at most 128"),
            (" leading space ok", "space"),
            ("myname-abhay-2026", "username"),
            ("abababababababab", "variety"),
        ],
    )
    def test_weak_passwords_are_refused(self, password: str, problem: str) -> None:
        assert problem in (password_problem(password, "abhay") or "")

    def test_good_password(self) -> None:
        assert password_problem(PASSWORD, "abhay") is None


class TestSetup:
    def test_creates_one_owner_with_a_hashed_password(self, owner: Owner) -> None:
        assert owner.username == "abhay"
        assert PASSWORD not in owner.password_hash
        assert verify_password(PASSWORD, owner.password_hash)

    def test_only_one_owner(self, db_session: Session, owner: Owner) -> None:
        with pytest.raises(ValueError, match="already exists"):
            AuthService.create_owner(db_session, "eve", PASSWORD)

    def test_bad_username_or_password_is_refused(self, db_session: Session) -> None:
        with pytest.raises(ValueError, match="Username"):
            AuthService.create_owner(db_session, "a b", PASSWORD)
        with pytest.raises(ValueError, match="12"):
            AuthService.create_owner(db_session, "abhay", "short")

    def test_reset_signs_out_everywhere_and_unlocks(
        self, db_session: Session, owner: Owner
    ) -> None:
        token, _ = login(db_session)
        owner.locked_until = NOW + timedelta(minutes=5)
        db_session.commit()
        AuthService.reset_password(db_session, "a brand new passphrase", now=NOW)
        assert AuthService.authenticate(db_session, SETTINGS, token, NOW) is None
        assert owner.locked_until is None
        login(db_session, password="a brand new passphrase")
        with pytest.raises(HTTPException):
            login(db_session)

    def test_reset_without_owner(self, db_session: Session) -> None:
        with pytest.raises(ValueError, match="No owner"):
            AuthService.reset_password(db_session, PASSWORD)


class TestLogin:
    def test_right_password_starts_a_session(
        self, db_session: Session, owner: Owner
    ) -> None:
        token, who = login(db_session, username=" ABHAY ")
        assert who.id == owner.id
        [session] = db_session.query(AuthSession).all()
        # Only the token's hash is stored.
        assert session.token_hash == token_hash(token) != token
        assert session.expires_at == NOW + timedelta(hours=12)
        assert owner.last_login_at == NOW

    @pytest.mark.parametrize(
        ("username", "password"), [("abhay", "nope"), ("eve", PASSWORD)]
    )
    def test_wrong_username_or_password_gives_the_same_answer(
        self, db_session: Session, owner: Owner, username: str, password: str
    ) -> None:
        with pytest.raises(HTTPException) as exc:
            login(db_session, username, password)
        assert (exc.value.status_code, exc.value.detail) == (
            401,
            "Incorrect username or password.",
        )
        assert db_session.query(AuthSession).count() == 0

    def test_no_owner_yet(self, db_session: Session) -> None:
        with pytest.raises(HTTPException) as exc:
            login(db_session)
        assert exc.value.status_code == 503

    def test_locks_after_repeated_failures(
        self, db_session: Session, owner: Owner
    ) -> None:
        for _ in range(2):
            with pytest.raises(HTTPException) as exc:
                login(db_session, password="nope")
            assert exc.value.status_code == 401
        with pytest.raises(HTTPException) as exc:
            login(db_session, password="nope")
        assert exc.value.status_code == 429
        assert owner.locked_until == NOW + timedelta(minutes=15)

        # Even the right password waits out the lock.
        with pytest.raises(HTTPException) as exc:
            login(db_session, now=NOW + timedelta(minutes=10))
        assert exc.value.status_code == 429
        assert "5 minutes" in str(exc.value.detail)

        login(db_session, now=NOW + timedelta(minutes=15))
        assert owner.locked_until is None and owner.failed_logins == 0

    def test_success_resets_the_failure_count(
        self, db_session: Session, owner: Owner
    ) -> None:
        for _ in range(2):
            with pytest.raises(HTTPException):
                login(db_session, password="nope")
        login(db_session)
        assert owner.failed_logins == 0

    def test_unlock(self, db_session: Session, owner: Owner) -> None:
        owner.locked_until = NOW + timedelta(minutes=15)
        db_session.commit()
        AuthService.unlock(db_session)
        login(db_session)


class TestSessions:
    def test_live_session_finds_the_owner(
        self, db_session: Session, owner: Owner
    ) -> None:
        token, _ = login(db_session)
        assert AuthService.authenticate(db_session, SETTINGS, token, NOW) is owner

    @pytest.mark.parametrize("token", [None, "", "made-up"])
    def test_unknown_token(
        self, db_session: Session, owner: Owner, token: str | None
    ) -> None:
        login(db_session)
        assert AuthService.authenticate(db_session, SETTINGS, token, NOW) is None

    def test_ends_after_an_hour_idle(self, db_session: Session, owner: Owner) -> None:
        token, _ = login(db_session)
        later = NOW + timedelta(minutes=59)
        assert AuthService.authenticate(db_session, SETTINGS, token, later) is owner
        # That request counted as activity, so the hour restarts from it.
        almost = later + timedelta(minutes=59)
        assert AuthService.authenticate(db_session, SETTINGS, token, almost) is owner
        gone = almost + timedelta(minutes=60)
        assert AuthService.authenticate(db_session, SETTINGS, token, gone) is None
        assert db_session.query(AuthSession).count() == 0

    def test_ends_after_twelve_hours_even_if_active(
        self, db_session: Session, owner: Owner
    ) -> None:
        token, _ = login(db_session)
        t = NOW
        while t < NOW + timedelta(hours=11, minutes=30):
            t += timedelta(minutes=30)
            assert AuthService.authenticate(db_session, SETTINGS, token, t) is owner
        t = NOW + timedelta(hours=12)
        assert AuthService.authenticate(db_session, SETTINGS, token, t) is None

    def test_logout_ends_only_that_session(
        self, db_session: Session, owner: Owner
    ) -> None:
        first, _ = login(db_session)
        second, _ = login(db_session)
        AuthService.logout(db_session, first)
        AuthService.logout(db_session, None)
        assert AuthService.authenticate(db_session, SETTINGS, first, NOW) is None
        assert AuthService.authenticate(db_session, SETTINGS, second, NOW) is owner

    def test_sign_in_clears_out_old_sessions(
        self, db_session: Session, owner: Owner
    ) -> None:
        login(db_session)
        login(db_session, now=NOW + timedelta(hours=13))
        assert db_session.query(AuthSession).count() == 1
