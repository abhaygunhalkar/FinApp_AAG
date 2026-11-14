"""add_holding_type_column

Revision ID: a1b2c3d4e5f6
Revises: 6c99e5b26de2
Create Date: 2026-05-22 00:00:00.000000
"""

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision = "a1b2c3d4e5f6"
down_revision = "6c99e5b26de2"
branch_labels = None
depend_on = None


def upgrade() -> None:
    # The app's startup check may have added it already (app/database.py).
    columns = {c["name"] for c in sa.inspect(op.get_bind()).get_columns("holdings")}
    if "holding_type" in columns:
        return
    # The default stays: SQLite can't drop a column default, so removing it
    # broke fresh installs.
    op.add_column(
        "holdings",
        sa.Column(
            "holding_type", sa.String(length=20), nullable=False, server_default="stock"
        ),
    )


def downgrade() -> None:
    op.drop_column("holdings", "holding_type")
