"""Repository for AuthSession rows."""

from datetime import datetime

from sqlalchemy.orm import Session

from app.models.auth_session import AuthSession


class AuthSessionRepository:

    @staticmethod
    def get_by_token_hash(db: Session, token_hash: str) -> AuthSession | None:
        return (
            db.query(AuthSession).filter(AuthSession.token_hash == token_hash).first()
        )

    @staticmethod
    def create(db: Session, session: AuthSession) -> AuthSession:
        db.add(session)
        db.commit()
        db.refresh(session)
        return session

    @staticmethod
    def touch(db: Session, session: AuthSession, now: datetime) -> None:
        session.last_seen_at = now
        db.add(session)
        db.commit()

    @staticmethod
    def delete(db: Session, session: AuthSession) -> None:
        db.delete(session)
        db.commit()

    @staticmethod
    def delete_all(db: Session) -> int:
        count = db.query(AuthSession).delete()
        db.commit()
        return count

    @staticmethod
    def delete_all_except(db: Session, keep_token_hash: str | None) -> int:
        """Sign out every browser but the one with this token."""
        query = db.query(AuthSession)
        if keep_token_hash is not None:
            query = query.filter(AuthSession.token_hash != keep_token_hash)
        count = query.delete(synchronize_session=False)
        db.commit()
        return count

    @staticmethod
    def delete_expired(db: Session, now: datetime, idle_since: datetime) -> None:
        db.query(AuthSession).filter(
            (AuthSession.expires_at <= now) | (AuthSession.last_seen_at <= idle_since)
        ).delete(synchronize_session=False)
        db.commit()
