"""add earnings_cache, which only the app's startup check used to create

Revision ID: d0e1f2a3b4c5
Revises: c9d0e1f2a3b4
Create Date: 2026-11-14

"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "d0e1f2a3b4c5"
down_revision: str | Sequence[str] | None = "c9d0e1f2a3b4"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # Existing databases already have it from the app's startup check.
    if "earnings_cache" in sa.inspect(op.get_bind()).get_table_names():
        return
    op.create_table(
        "earnings_cache",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("cache_date", sa.Date(), nullable=False, unique=True),
        sa.Column("data", sa.Text(), nullable=False),
        sa.Column("fetched_at", sa.DateTime(), nullable=False),
    )


def downgrade() -> None:
    op.drop_table("earnings_cache")
