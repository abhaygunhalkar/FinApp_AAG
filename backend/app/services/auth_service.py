"""Signing in and out of the app's one owner account.

A sign-in creates a session: a random token goes to the browser in a cookie,
and only its SHA-256 hash is stored. A session ends after
AUTH_SESSION_IDLE_MINUTES without requests, or AUTH_SESSION_MAX_HOURS after
sign-in, whichever comes first.
"""

import hashlib
import hmac
import logging
import math
import secrets
from datetime import UTC, datetime, timedelta

from fastapi import HTTPException
from sqlalchemy.orm import Session

from app.config import Settings
from app.models.auth_session import AuthSession
from app.models.owner import Owner
from app.repositories.auth_session_repository import AuthSessionRepository
from app.repositories.owner_repository import OwnerRepository
from app.services.passwords import (
    DUMMY_HASH,
    hash_password,
    password_problem,
    username_problem,
    verify_password,
)

logger = logging.getLogger(__name__)

WRONG_LOGIN = "Incorrect username or password."
# A request refreshes last_seen_at at most this often, to spare the database.
TOUCH_EVERY = timedelta(minutes=1)


def utcnow() -> datetime:
    return datetime.now(UTC).replace(tzinfo=None)


def token_hash(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


def _minutes_left(until: datetime, now: datetime) -> int:
    return max(1, math.ceil((until - now).total_seconds() / 60))


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
        ip_address: str | None = None,
        user_agent: str | None = None,
        now: datetime | None = None,
    ) -> tuple[str, Owner]:
        """Check the password and start a session. Returns (cookie token, owner)."""
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
            owner.failed_logins += 1
            locked = owner.failed_logins >= settings.AUTH_MAX_FAILED_LOGINS
            if locked:
                owner.failed_logins = 0
                owner.locked_until = now + timedelta(
                    minutes=settings.AUTH_LOCKOUT_MINUTES
                )
            OwnerRepository.save(db, owner)
            logger.warning("Failed sign-in from %s", ip_address or "unknown")
            if locked:
                raise HTTPException(
                    status_code=429,
                    detail="Too many failed sign-ins. Try again in "
                    f"{settings.AUTH_LOCKOUT_MINUTES} minutes.",
                )
            raise HTTPException(status_code=401, detail=WRONG_LOGIN)

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
        return token, owner

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
