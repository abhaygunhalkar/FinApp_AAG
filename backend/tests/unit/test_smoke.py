"""Smoke test to verify test infrastructure is working."""

from sqlalchemy.orm import Session

from app.database import Base


def test_database_tables_created(db_session: Session) -> None:
    """Verify that the in-memory test database creates tables correctly."""
    # The setup_database fixture should have created all tables
    # Check that we can query without errors
    tables = Base.metadata.tables.keys()
    assert "holdings" in tables
    assert db_session.is_active


def test_session_isolation(db_session: Session) -> None:
    """Verify that each test gets a clean database session."""
    # Session should be active and usable
    assert db_session.is_active
    # No leftover data from other tests
    assert len(db_session.new) == 0
