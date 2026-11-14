"""Shared test fixtures for the Personal Finance Dashboard backend tests."""

from collections.abc import Generator

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import StaticPool

from app.auth import require_csrf_header, require_session
from app.database import Base, get_db
from app.main import app
from app.models.owner import Owner

# In-memory SQLite engine for tests — uses StaticPool to keep a single
# connection alive across the test session (required for in-memory DBs).
TEST_DATABASE_URL = "sqlite://"

engine = create_engine(
    TEST_DATABASE_URL,
    connect_args={"check_same_thread": False},
    poolclass=StaticPool,
)

TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


@pytest.fixture(autouse=True)
def setup_database() -> Generator[None, None, None]:
    """Create all tables before each test and drop them after."""
    Base.metadata.create_all(bind=engine)
    yield
    Base.metadata.drop_all(bind=engine)


@pytest.fixture(autouse=True)
def signed_in() -> Generator[None, None, None]:
    """API tests run as the signed-in owner, without the CSRF header check.

    Tests of sign-in itself use the `real_auth` fixture to turn both back on.
    Fixtures that clear app.dependency_overrides at teardown are fine: this
    sets them again before the next test.
    """
    app.dependency_overrides[require_session] = lambda: Owner(
        id=1, username="owner", password_hash="x"
    )
    app.dependency_overrides[require_csrf_header] = lambda: None
    yield
    app.dependency_overrides.pop(require_session, None)
    app.dependency_overrides.pop(require_csrf_header, None)


@pytest.fixture()
def real_auth() -> None:
    """Check sessions and the CSRF header for real in this test."""
    app.dependency_overrides.pop(require_session, None)
    app.dependency_overrides.pop(require_csrf_header, None)


@pytest.fixture()
def offline_market(monkeypatch: pytest.MonkeyPatch) -> None:
    """No live Yahoo Finance lookups: quotes and RSI come back empty."""
    from app.services.market_data_service import MarketDataService

    monkeypatch.setattr(MarketDataService, "fetch_quote", staticmethod(lambda t: None))
    monkeypatch.setattr(
        MarketDataService, "fetch_rsi", staticmethod(lambda t: (None, None))
    )


@pytest.fixture()
def db_session() -> Generator[Session, None, None]:
    """Provide a transactional database session for tests.

    Each test gets a fresh session that is rolled back after the test completes,
    ensuring test isolation.
    """
    session = TestingSessionLocal()
    try:
        yield session
    finally:
        session.rollback()
        session.close()


@pytest.fixture()
def client(db_session: Session) -> Generator[TestClient, None, None]:
    """Provide an HTTP test client with the test database session injected.

    Overrides the FastAPI `get_db` dependency so that API tests use the
    in-memory test database instead of the production SQLite file.
    """

    def _override_get_db() -> Generator[Session, None, None]:
        yield db_session

    app.dependency_overrides[get_db] = _override_get_db
    with TestClient(app) as tc:
        yield tc

    app.dependency_overrides.clear()
