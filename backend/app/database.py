"""Database engine and session configuration."""

import logging
import sys
from collections.abc import Generator
from pathlib import Path

from sqlalchemy import create_engine, text
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker

from app.config import get_settings

logger = logging.getLogger(__name__)

settings = get_settings()

engine = create_engine(
    settings.DATABASE_URL,
    connect_args={"check_same_thread": False},
    echo=False,
)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


class Base(DeclarativeBase):
    """Base class for all SQLAlchemy models."""

    pass


def get_db() -> Generator[Session, None, None]:
    """Provide a transactional database session as a FastAPI dependency."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def verify_database() -> None:
    """Verify the database file exists and is accessible.

    If the database file does not exist, create it with all tables.
    If the database file is corrupted, log the error and exit with
    a non-zero exit code within 5 seconds.
    """
    # Import models to ensure they are registered with Base.metadata
    import app.models  # noqa: F401

    db_url = settings.DATABASE_URL

    # Extract file path from sqlite URL
    if db_url.startswith("sqlite:///"):
        db_path_str = db_url.replace("sqlite:///", "")
        # Handle relative paths (e.g., ./finance_tracker.db)
        if db_path_str.startswith("./"):
            db_path_str = db_path_str[2:]
        db_path = Path(db_path_str)
    else:
        # Non-file databases (e.g., in-memory) don't need file verification
        logger.info("Non-file database URL detected, skipping file verification.")
        Base.metadata.create_all(bind=engine)
        return

    if not db_path.exists():
        logger.info(
            "Database file '%s' not found. Creating with all tables.", db_path
        )
        # Ensure parent directory exists
        db_path.parent.mkdir(parents=True, exist_ok=True)
        Base.metadata.create_all(bind=engine)
        logger.info("Database created successfully.")
        return

    # Database file exists — check for corruption with an integrity check
    try:
        with engine.connect() as conn:
            result = conn.execute(text("PRAGMA integrity_check"))
            row = result.fetchone()
            if row is None or row[0] != "ok":
                integrity_result = row[0] if row else "no response"
                logger.error(
                    "Database corruption detected: %s. Exiting.",
                    integrity_result,
                )
                sys.exit(1)

            # Ensure the holdings table has the new holding_type column.
            pragma_result = conn.execute(text("PRAGMA table_info('holdings')"))
            columns = [row[1] for row in pragma_result.fetchall()]
            if 'holding_type' not in columns:
                logger.info(
                    "Existing database is missing holdings.holding_type; applying compatibility patch."
                )
                conn.execute(
                    text(
                        "ALTER TABLE holdings ADD COLUMN holding_type VARCHAR(20) NOT NULL DEFAULT 'stock'"
                    )
                )
                logger.info("Added missing holdings.holding_type column.")

        logger.info("Database integrity check passed.")

        # Create any missing tables, including earnings_cache.
        Base.metadata.create_all(bind=engine)
    except Exception as exc:
        logger.error(
            "Failed to open or verify database file '%s': %s. Exiting.",
            db_path,
            exc,
        )
        sys.exit(1)
