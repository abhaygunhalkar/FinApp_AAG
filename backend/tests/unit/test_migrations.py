"""Migrations must build a working database from nothing (a fresh install)."""

import os
import sqlite3
import subprocess
import sys
from pathlib import Path

from app.database import Base

BACKEND = Path(__file__).resolve().parents[2]


def _alembic(db: Path, *args: str) -> subprocess.CompletedProcess[str]:
    env = {**os.environ, "DATABASE_URL": f"sqlite:///{db}"}
    return subprocess.run(
        [sys.executable, "-m", "alembic", *args],
        cwd=BACKEND,
        env=env,
        capture_output=True,
        text=True,
        timeout=120,
    )


def test_every_migration_runs_on_an_empty_database(tmp_path: Path) -> None:
    db = tmp_path / "fresh.db"
    result = _alembic(db, "upgrade", "head")
    assert result.returncode == 0, result.stderr[-2000:]

    import app.models  # noqa: F401  (registers every model)

    with sqlite3.connect(db) as conn:
        tables = {
            r[0]
            for r in conn.execute("SELECT name FROM sqlite_master WHERE type='table'")
        }
    # Every table the app uses exists without the app's own startup check.
    assert set(Base.metadata.tables) <= tables


def test_a_database_the_app_creates_is_marked_up_to_date(tmp_path: Path) -> None:
    db = tmp_path / "app-first.db"
    code = (
        "import logging; log = logging.getLogger('app.chat');"
        "from app.database import verify_database; verify_database();"
        "assert not log.disabled, 'stamping switched off the app loggers'"
    )
    env = {**os.environ, "DATABASE_URL": f"sqlite:///{db}"}
    made = subprocess.run(
        [sys.executable, "-c", code],
        cwd=BACKEND,
        env=env,
        capture_output=True,
        text=True,
    )
    assert made.returncode == 0, made.stderr[-2000:]
    # Migrations afterwards have nothing to do, instead of failing on
    # tables that already exist.
    result = _alembic(db, "upgrade", "head")
    assert result.returncode == 0, result.stderr[-2000:]
    assert "(head)" in _alembic(db, "current").stdout
