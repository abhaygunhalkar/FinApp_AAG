"""Tests for passwords, sign-in, lockout and session expiry."""

import base64
from collections.abc import Generator
from datetime import UTC, datetime, timedelta

import pytest
from fastapi import HTTPException
from sqlalchemy.orm import Session

from app.config import Settings
from app.models.auth_session import AuthSession
from app.models.owner import Owner
from app.services import passwords, totp
from app.services.auth_service import AuthService, backup_codes_left, token_hash
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


def login(
    db: Session,
    username: str = "abhay",
    password: str = PASSWORD,
    now: datetime = NOW,
    code: str | None = None,
) -> tuple[str, Owner]:
    result = AuthService.login(db, SETTINGS, username, password, code=code, now=now)
    assert result.token is not None and not result.code_required
    return result.token, result.owner


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


# RFC 6238 appendix B, SHA-1: the ASCII key "12345678901234567890".
RFC_SECRET = base64.b32encode(b"12345678901234567890").decode()


class TestTotp:
    @pytest.mark.parametrize(
        ("timestamp", "eight_digits"),
        [
            (59, "94287082"),
            (1111111109, "07081804"),
            (1111111111, "14050471"),
            (1234567890, "89005924"),
            (2000000000, "69279037"),
            (20000000000, "65353130"),
        ],
    )
    def test_matches_the_rfc_test_values(
        self, timestamp: int, eight_digits: str
    ) -> None:
        counter = totp.counter_at(timestamp)
        assert totp.code_at(RFC_SECRET, counter, digits=8) == eight_digits
        # The usual 6 digits are the last six.
        assert totp.matching_counter(RFC_SECRET, eight_digits[2:], timestamp) == counter

    def test_accepts_one_step_either_side_only(self) -> None:
        t = 1_000_000_000
        now = totp.counter_at(t)
        for step, ok in [(-2, False), (-1, True), (0, True), (1, True), (2, False)]:
            code = totp.code_at(RFC_SECRET, now + step)
            assert (totp.matching_counter(RFC_SECRET, code, t) is not None) is ok

    @pytest.mark.parametrize("code", ["", "12345", "1234567", "abcdef", "12 34 5"])
    def test_malformed_codes(self, code: str) -> None:
        assert totp.matching_counter(RFC_SECRET, code, 59) is None

    def test_new_secrets_and_backup_codes(self) -> None:
        secret = totp.new_secret()
        assert len(secret) == 32 and secret != totp.new_secret()
        assert totp.setup_key(secret).count(" ") == 7
        assert "secret=" + secret in totp.otpauth_uri(secret, "abhay")
        codes = totp.new_backup_codes()
        assert len(set(codes)) == 10
        assert all(len(c) == 9 and c[4] == "-" for c in codes)
        assert totp.backup_code_hash(codes[0]) == totp.backup_code_hash(
            " " + codes[0].upper().replace("-", "") + " "
        )


def code_now(secret: str, now: datetime = NOW, step: int = 0) -> str:
    ts = now.replace(tzinfo=UTC).timestamp()
    return totp.code_at(secret, totp.counter_at(ts) + step)


class TestTwoStep:
    @pytest.fixture
    def secret(self, db_session: Session, owner: Owner) -> str:
        return totp.new_secret()

    @pytest.fixture
    def backup(self, db_session: Session, owner: Owner, secret: str) -> list[str]:
        # Enabled a minute before NOW, so NOW's code is still unused.
        earlier = NOW - timedelta(minutes=1)
        return AuthService.enable_two_step(
            db_session, secret, code_now(secret, earlier), now=earlier
        )

    def test_turning_on_needs_a_right_code(
        self, db_session: Session, owner: Owner, secret: str
    ) -> None:
        with pytest.raises(ValueError, match="didn't match"):
            AuthService.enable_two_step(db_session, secret, "000000", now=NOW)
        assert owner.totp_secret is None

    def test_turning_on_signs_everyone_out(
        self, db_session: Session, owner: Owner, secret: str
    ) -> None:
        token, _ = login(db_session)
        codes = AuthService.enable_two_step(
            db_session, secret, code_now(secret), now=NOW
        )
        assert len(codes) == 10 and backup_codes_left(owner) == 10
        assert AuthService.authenticate(db_session, SETTINGS, token, NOW) is None

    def test_password_alone_asks_for_a_code(
        self, db_session: Session, owner: Owner, backup: list[str]
    ) -> None:
        result = AuthService.login(db_session, SETTINGS, "abhay", PASSWORD, now=NOW)
        assert result.code_required and result.token is None
        assert db_session.query(AuthSession).count() == 0
        assert owner.failed_logins == 0

    def test_wrong_password_never_reveals_two_step(
        self, db_session: Session, owner: Owner, backup: list[str]
    ) -> None:
        with pytest.raises(HTTPException) as exc:
            AuthService.login(db_session, SETTINGS, "abhay", "nope", now=NOW)
        assert exc.value.detail == "Incorrect username or password."

    def test_right_code_signs_in(
        self, db_session: Session, owner: Owner, secret: str, backup: list[str]
    ) -> None:
        token, _ = login(db_session, code=code_now(secret))
        assert AuthService.authenticate(db_session, SETTINGS, token, NOW) is owner

    def test_a_code_works_only_once(
        self, db_session: Session, owner: Owner, secret: str, backup: list[str]
    ) -> None:
        code = code_now(secret)
        login(db_session, code=code)
        with pytest.raises(HTTPException) as exc:
            login(db_session, code=code)
        assert exc.value.status_code == 401
        # An older code, from before the one just used, is refused too.
        with pytest.raises(HTTPException):
            login(db_session, code=code_now(secret, step=-1))
        login(db_session, code=code_now(secret, step=1))

    def test_wrong_codes_count_toward_the_lockout(
        self, db_session: Session, owner: Owner, backup: list[str]
    ) -> None:
        for _ in range(2):
            with pytest.raises(HTTPException) as exc:
                login(db_session, code="000000")
            assert exc.value.status_code == 401
            assert "code didn't work" in str(exc.value.detail)
        with pytest.raises(HTTPException) as exc:
            login(db_session, code="000000")
        assert exc.value.status_code == 429

    def test_backup_code_works_once(
        self, db_session: Session, owner: Owner, backup: list[str]
    ) -> None:
        login(db_session, code=backup[3].upper())
        assert backup_codes_left(owner) == 9
        with pytest.raises(HTTPException):
            login(db_session, code=backup[3])
        login(db_session, code=backup[4])
        assert backup_codes_left(owner) == 8

    def test_new_backup_codes_replace_the_old(
        self, db_session: Session, owner: Owner, backup: list[str]
    ) -> None:
        fresh = AuthService.new_backup_codes(db_session)
        with pytest.raises(HTTPException):
            login(db_session, code=backup[0])
        login(db_session, code=fresh[0])

    def test_turning_off(
        self, db_session: Session, owner: Owner, backup: list[str]
    ) -> None:
        AuthService.disable_two_step(db_session)
        login(db_session)
        assert backup_codes_left(owner) == 0
        with pytest.raises(ValueError):
            AuthService.new_backup_codes(db_session)


NEW = "a brand new passphrase"


def change(
    db: Session,
    owner: Owner,
    current: str = PASSWORD,
    new: str = NEW,
    code: str | None = None,
    keep: str | None = None,
) -> int:
    return AuthService.change_password(
        db, SETTINGS, owner, current, new, code, keep_token=keep, now=NOW
    )


class TestChangePassword:
    def test_changes_it_and_signs_out_other_browsers_only(
        self, db_session: Session, owner: Owner
    ) -> None:
        this_one, _ = login(db_session)
        other, _ = login(db_session)
        assert change(db_session, owner, keep=this_one) == 1
        assert AuthService.authenticate(db_session, SETTINGS, this_one, NOW) is owner
        assert AuthService.authenticate(db_session, SETTINGS, other, NOW) is None
        login(db_session, password=NEW)
        with pytest.raises(HTTPException):
            login(db_session)

    def test_wrong_current_password_counts_toward_the_lockout(
        self, db_session: Session, owner: Owner
    ) -> None:
        for _ in range(2):
            with pytest.raises(HTTPException) as exc:
                change(db_session, owner, current="nope")
            assert exc.value.status_code == 401
            assert exc.value.detail == "Your current password is incorrect."
        with pytest.raises(HTTPException) as exc:
            change(db_session, owner, current="nope")
        assert exc.value.status_code == 429
        # Locked: even the right current password waits.
        with pytest.raises(HTTPException) as exc:
            change(db_session, owner)
        assert exc.value.status_code == 429
        assert verify_password(PASSWORD, owner.password_hash)

    @pytest.mark.parametrize(
        ("new", "problem"),
        [("short", "at least 12"), (PASSWORD, "different from your current")],
    )
    def test_new_password_must_follow_the_rules(
        self, db_session: Session, owner: Owner, new: str, problem: str
    ) -> None:
        with pytest.raises(HTTPException) as exc:
            change(db_session, owner, new=new)
        assert exc.value.status_code == 422
        assert problem in str(exc.value.detail)
        assert owner.failed_logins == 0

    def test_needs_a_code_when_two_step_is_on(
        self, db_session: Session, owner: Owner
    ) -> None:
        secret = totp.new_secret()
        earlier = NOW - timedelta(minutes=1)
        AuthService.enable_two_step(
            db_session, secret, code_now(secret, earlier), now=earlier
        )
        with pytest.raises(HTTPException) as exc:
            change(db_session, owner)
        assert exc.value.status_code == 422
        with pytest.raises(HTTPException) as exc:
            change(db_session, owner, code="000000")
        assert exc.value.status_code == 401 and owner.failed_logins == 1
        change(db_session, owner, code=code_now(secret))
        assert verify_password(NEW, owner.password_hash)
