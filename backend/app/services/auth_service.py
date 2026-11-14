"""Signing in and out of the app's one owner account.

A sign-in creates a session: a random token goes to the browser in a cookie,
and only its SHA-256 hash is stored. A session ends after
AUTH_SESSION_IDLE_MINUTES without requests, or AUTH_SESSION_MAX_HOURS after
sign-in, whichever comes first.

With two-step sign-in on, a password is not enough: the sign-in also needs a
current code from an authenticator app, or one of the backup codes.
"""

import hashlib
import hmac
import json
import logging
import math
import secrets
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from typing import NoReturn

from fastapi import HTTPException
from sqlalchemy.orm import Session

from app.config import Settings
from app.models.auth_session import AuthSession
from app.models.owner import Owner
from app.repositories.auth_session_repository import AuthSessionRepository
from app.repositories.owner_repository import OwnerRepository
from app.services import totp
from app.services.passwords import (
    DUMMY_HASH,
    hash_password,
    password_problem,
    username_problem,
    verify_password,
)

logger = logging.getLogger(__name__)

WRONG_LOGIN = "Incorrect username or password."
WRONG_CODE = "That code didn't work. Check your authenticator app and try again."
WRONG_CURRENT = "Your current password is incorrect."
# A request refreshes last_seen_at at most this often, to spare the database.
TOUCH_EVERY = timedelta(minutes=1)


def utcnow() -> datetime:
    return datetime.now(UTC).replace(tzinfo=None)


def token_hash(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


def _minutes_left(until: datetime, now: datetime) -> int:
    return max(1, math.ceil((until - now).total_seconds() / 60))


def _timestamp(now: datetime) -> float:
    return now.replace(tzinfo=UTC).timestamp()


def backup_codes_left(owner: Owner) -> int:
    return len(json.loads(owner.backup_code_hashes or "[]"))


@dataclass
class LoginResult:
    owner: Owner
    # None when a code is still needed.
    token: str | None
    code_required: bool


def _failed(
    db: Session,
    settings: Settings,
    owner: Owner,
    now: datetime,
    ip_address: str | None,
    message: str,
) -> NoReturn:
    """Count a failed sign-in, locking after too many, and refuse it."""
    owner.failed_logins += 1
    locked = owner.failed_logins >= settings.AUTH_MAX_FAILED_LOGINS
    if locked:
        owner.failed_logins = 0
        owner.locked_until = now + timedelta(minutes=settings.AUTH_LOCKOUT_MINUTES)
    OwnerRepository.save(db, owner)
    logger.warning("Failed sign-in from %s", ip_address or "unknown")
    if locked:
        raise HTTPException(
            status_code=429,
            detail="Too many failed sign-ins. Try again in "
            f"{settings.AUTH_LOCKOUT_MINUTES} minutes.",
        )
    raise HTTPException(status_code=401, detail=message)


def _use_code(owner: Owner, code: str, now: datetime) -> bool:
    """Check an authenticator or backup code, and spend it so it can't be reused."""
    assert owner.totp_secret is not None
    counter = totp.matching_counter(owner.totp_secret, code, _timestamp(now))
    if counter is not None:
        if owner.totp_last_counter is not None and counter <= owner.totp_last_counter:
            return False
        owner.totp_last_counter = counter
        return True
    hashes = json.loads(owner.backup_code_hashes or "[]")
    wanted = totp.backup_code_hash(code)
    for stored in hashes:
        if hmac.compare_digest(stored, wanted):
            hashes.remove(stored)
            owner.backup_code_hashes = json.dumps(hashes)
            return True
    return False


class AuthService:

    @staticmethod
    def create_owner(db: Session, username: str, password: str) -> Owner:
        """One-time setup. Raises ValueError if an owner exists or input is weak."""
        if OwnerRepository.get(db) is not None:
            raise ValueError("An owner account already exists. Use --reset instead.")
        problem = username_problem(username) or password_problem(password, username)
        if problem:
            raise ValueError(problem)
        return OwnerRepository.create(db, username, hash_password(password))

    @staticmethod
    def reset_password(
        db: Session, password: str, now: datetime | None = None
    ) -> Owner:
        """New password; also unlocks sign-in and signs out every browser."""
        owner = OwnerRepository.get(db)
        if owner is None:
            raise ValueError("No owner account yet. Run without --reset first.")
        problem = password_problem(password, owner.username)
        if problem:
            raise ValueError(problem)
        owner.password_hash = hash_password(password)
        owner.password_changed_at = now or utcnow()
        owner.failed_logins = 0
        owner.locked_until = None
        OwnerRepository.save(db, owner)
        AuthSessionRepository.delete_all(db)
        return owner

    @staticmethod
    def change_password(
        db: Session,
        settings: Settings,
        owner: Owner,
        current_password: str,
        new_password: str,
        code: str | None,
        keep_token: str | None,
        now: datetime | None = None,
    ) -> int:
        """Change the password from Settings; returns browsers signed out.

        Needs the current password, and a code when two-step sign-in is on.
        Wrong ones count toward the sign-in lockout, so this can't be used to
        guess. Every browser except the one asking is signed out.
        """
        now = now or utcnow()
        if owner.locked_until is not None and now < owner.locked_until:
            raise HTTPException(
                status_code=429,
                detail="Too many failed attempts. Try again in "
                f"{_minutes_left(owner.locked_until, now)} minutes.",
            )
        if not verify_password(current_password, owner.password_hash):
            _failed(db, settings, owner, now, None, WRONG_CURRENT)
        if owner.totp_secret:
            if not code or not code.strip():
                raise HTTPException(
                    status_code=422,
                    detail="Enter the code from your authenticator app.",
                )
            if not _use_code(owner, code, now):
                _failed(db, settings, owner, now, None, WRONG_CODE)

        problem = password_problem(new_password, owner.username)
        if problem is None and verify_password(new_password, owner.password_hash):
            problem = "Choose a password different from your current one."
        if problem:
            # A rule failure isn't a wrong guess; the code (if used) still is.
            OwnerRepository.save(db, owner)
            raise HTTPException(status_code=422, detail=problem)

        owner.password_hash = hash_password(new_password)
        owner.password_changed_at = now
        owner.failed_logins = 0
        OwnerRepository.save(db, owner)
        keep = token_hash(keep_token) if keep_token else None
        signed_out = AuthSessionRepository.delete_all_except(db, keep)
        logger.info("Password changed; %d other sessions signed out", signed_out)
        return signed_out

    @staticmethod
    def unlock(db: Session) -> Owner:
        owner = OwnerRepository.get(db)
        if owner is None:
            raise ValueError("No owner account yet.")
        owner.failed_logins = 0
        owner.locked_until = None
        OwnerRepository.save(db, owner)
        return owner

    @staticmethod
    def login(
        db: Session,
        settings: Settings,
        username: str,
        password: str,
        code: str | None = None,
        ip_address: str | None = None,
        user_agent: str | None = None,
        now: datetime | None = None,
    ) -> LoginResult:
        """Check the password (and code, with two-step on) and start a session.

        With two-step on and no code sent, the result asks for one and no
        session starts. A wrong code counts toward the lockout like a wrong
        password.
        """
        now = now or utcnow()
        owner = OwnerRepository.get(db)
        if owner is None:
            verify_password(password, DUMMY_HASH)
            raise HTTPException(
                status_code=503,
                detail="Sign-in isn't set up yet. Run scripts/create_owner.py "
                "on the server.",
            )

        if owner.locked_until is not None and now < owner.locked_until:
            raise HTTPException(
                status_code=429,
                detail="Too many failed sign-ins. Try again in "
                f"{_minutes_left(owner.locked_until, now)} minutes.",
            )

        right_name = hmac.compare_digest(
            username.strip().lower().encode(), owner.username.lower().encode()
        )
        # The hash is always checked, so a wrong username takes as long.
        right_password = verify_password(
            password, owner.password_hash if right_name else DUMMY_HASH
        )
        if not (right_name and right_password):
            _failed(db, settings, owner, now, ip_address, WRONG_LOGIN)

        if owner.totp_secret:
            if not code or not code.strip():
                return LoginResult(owner=owner, token=None, code_required=True)
            if not _use_code(owner, code, now):
                _failed(db, settings, owner, now, ip_address, WRONG_CODE)

        owner.failed_logins = 0
        owner.locked_until = None
        owner.last_login_at = now
        OwnerRepository.save(db, owner)
        AuthSessionRepository.delete_expired(
            db, now, now - timedelta(minutes=settings.AUTH_SESSION_IDLE_MINUTES)
        )

        token = secrets.token_urlsafe(32)
        AuthSessionRepository.create(
            db,
            AuthSession(
                owner_id=owner.id,
                token_hash=token_hash(token),
                created_at=now,
                last_seen_at=now,
                expires_at=now + timedelta(hours=settings.AUTH_SESSION_MAX_HOURS),
                ip_address=(ip_address or "")[:64] or None,
                user_agent=(user_agent or "")[:200] or None,
            ),
        )
        logger.info("Signed in from %s", ip_address or "unknown")
        return LoginResult(owner=owner, token=token, code_required=False)

    # --- two-step sign-in --------------------------------------------------

    @staticmethod
    def enable_two_step(
        db: Session, secret: str, code: str, now: datetime | None = None
    ) -> list[str]:
        """Turn two-step on once a code from the new secret checks out.

        Returns the backup codes, which are shown once. Every browser is
        signed out, so each signs in again with a code.
        """
        owner = OwnerRepository.get(db)
        if owner is None:
            raise ValueError("No owner account yet.")
        counter = totp.matching_counter(secret, code, _timestamp(now or utcnow()))
        if counter is None:
            raise ValueError(
                "That code didn't match. Check the key and your phone's clock."
            )
        owner.totp_secret = secret
        owner.totp_last_counter = counter
        codes = totp.new_backup_codes()
        owner.backup_code_hashes = json.dumps([totp.backup_code_hash(c) for c in codes])
        OwnerRepository.save(db, owner)
        AuthSessionRepository.delete_all(db)
        return codes

    @staticmethod
    def disable_two_step(db: Session) -> Owner:
        owner = OwnerRepository.get(db)
        if owner is None:
            raise ValueError("No owner account yet.")
        owner.totp_secret = None
        owner.totp_last_counter = None
        owner.backup_code_hashes = None
        OwnerRepository.save(db, owner)
        return owner

    @staticmethod
    def new_backup_codes(db: Session) -> list[str]:
        """Replace all backup codes; the old ones stop working."""
        owner = OwnerRepository.get(db)
        if owner is None or not owner.totp_secret:
            raise ValueError("Two-step sign-in isn't on.")
        codes = totp.new_backup_codes()
        owner.backup_code_hashes = json.dumps([totp.backup_code_hash(c) for c in codes])
        OwnerRepository.save(db, owner)
        return codes

    @staticmethod
    def authenticate(
        db: Session,
        settings: Settings,
        token: str | None,
        now: datetime | None = None,
    ) -> Owner | None:
        """The owner a cookie token belongs to, or None if it isn't a live session."""
        if not token:
            return None
        now = now or utcnow()
        session = AuthSessionRepository.get_by_token_hash(db, token_hash(token))
        if session is None:
            return None
        idle = timedelta(minutes=settings.AUTH_SESSION_IDLE_MINUTES)
        if now >= session.expires_at or now - session.last_seen_at >= idle:
            AuthSessionRepository.delete(db, session)
            return None
        if now - session.last_seen_at >= TOUCH_EVERY:
            AuthSessionRepository.touch(db, session, now)
        return OwnerRepository.get_by_id(db, session.owner_id)

    @staticmethod
    def logout(db: Session, token: str | None) -> None:
        if not token:
            return
        session = AuthSessionRepository.get_by_token_hash(db, token_hash(token))
        if session is not None:
            AuthSessionRepository.delete(db, session)
