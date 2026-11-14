"""Tests for database configuration and startup verification."""

import contextlib
import os
import tempfile
from pathlib import Path
from unittest.mock import patch

import pytest
from sqlalchemy import Engine, create_engine, text
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import QueuePool

from app.database import Base, get_db, verify_database


class TestGetDb:
    """Tests for the get_db dependency generator."""

    def test_get_db_yields_session(self, db_session: Session) -> None:
        """get_db should yield a Session instance."""
        gen = get_db()
        session = next(gen)
        assert isinstance(session, Session)
        # Clean up
        with contextlib.suppress(StopIteration):
            next(gen)

    def test_get_db_closes_session_on_exit(self) -> None:
        """get_db should close the session after the generator exits."""
        gen = get_db()
        session = next(gen)
        # Exhaust the generator (triggers finally block with session.close())
        with contextlib.suppress(StopIteration):
            next(gen)
        # After close(), the session's connection should be released.
        # Attempting to use it for new work should fail or require re-opening.
        # We verify close was called by checking the session has no bound connection.
        bind = session.get_bind()
        assert isinstance(bind, Engine) and isinstance(bind.pool, QueuePool)
        assert not bind.pool.checkedout()


class TestVerifyDatabase:
    """Tests for the verify_database startup check."""

    def test_verify_creates_tables_when_db_not_exists(self) -> None:
        """verify_database should create the DB file and tables if it doesn't exist."""
        with tempfile.TemporaryDirectory() as tmpdir:
            db_path = os.path.join(tmpdir, "test_new.db")
            db_url = f"sqlite:///{db_path}"

            test_engine = create_engine(
                db_url, connect_args={"check_same_thread": False}
            )
            test_session_factory = sessionmaker(bind=test_engine)

            with (
                patch("app.database.settings") as mock_settings,
                patch("app.database.engine", test_engine),
                patch("app.database.SessionLocal", test_session_factory),
            ):
                mock_settings.DATABASE_URL = db_url

                verify_database()

                # Verify the file was created
                assert Path(db_path).exists()

                # Verify tables exist
                with test_engine.connect() as conn:
                    result = conn.execute(
                        text(
                            "SELECT name FROM sqlite_master "
                            "WHERE type='table' ORDER BY name"
                        )
                    )
                    tables = [row[0] for row in result.fetchall()]

                assert "holdings" in tables
                assert "transactions" in tables
                assert "watchlist" in tables
                assert "price_history" in tables
                assert "cash_balance" in tables

    def test_verify_passes_on_valid_existing_db(self) -> None:
        """verify_database should pass integrity check on a valid DB."""
        with tempfile.TemporaryDirectory() as tmpdir:
            db_path = os.path.join(tmpdir, "test_valid.db")
            db_url = f"sqlite:///{db_path}"

            test_engine = create_engine(
                db_url, connect_args={"check_same_thread": False}
            )
            test_session_factory = sessionmaker(bind=test_engine)

            # Create the database first
            Base.metadata.create_all(bind=test_engine)

            with (
                patch("app.database.settings") as mock_settings,
                patch("app.database.engine", test_engine),
                patch("app.database.SessionLocal", test_session_factory),
            ):
                mock_settings.DATABASE_URL = db_url

                # Should not raise or exit
                verify_database()

    def test_verify_exits_on_corrupted_db(self) -> None:
        """verify_database should exit with non-zero code on corrupted DB."""
        with tempfile.TemporaryDirectory() as tmpdir:
            db_path = os.path.join(tmpdir, "test_corrupt.db")

            # Create a corrupted file
            with open(db_path, "wb") as f:
                f.write(b"this is not a valid sqlite database file content")

            db_url = f"sqlite:///{db_path}"

            test_engine = create_engine(
                db_url, connect_args={"check_same_thread": False}
            )
            test_session_factory = sessionmaker(bind=test_engine)

            with (
                patch("app.database.settings") as mock_settings,
                patch("app.database.engine", test_engine),
                patch("app.database.SessionLocal", test_session_factory),
            ):
                mock_settings.DATABASE_URL = db_url

                with pytest.raises(SystemExit) as exc_info:
                    verify_database()

                assert exc_info.value.code == 1

    def test_verify_handles_in_memory_db(self) -> None:
        """verify_database should handle in-memory databases gracefully."""
        test_engine = create_engine(
            "sqlite://", connect_args={"check_same_thread": False}
        )
        test_session_factory = sessionmaker(bind=test_engine)

        with (
            patch("app.database.settings") as mock_settings,
            patch("app.database.engine", test_engine),
            patch("app.database.SessionLocal", test_session_factory),
        ):
            mock_settings.DATABASE_URL = "sqlite://"

            # Should not raise — creates tables in memory
            verify_database()

            # Verify tables were created
            with test_engine.connect() as conn:
                result = conn.execute(
                    text(
                        "SELECT name FROM sqlite_master "
                        "WHERE type='table' ORDER BY name"
                    )
                )
                tables = [row[0] for row in result.fetchall()]

            assert "holdings" in tables
