"""add two-step sign-in columns to owner

Revision ID: c9d0e1f2a3b4
Revises: b8c9d0e1f2a3
Create Date: 2026-11-14

"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "c9d0e1f2a3b4"
down_revision: str | Sequence[str] | None = "b8c9d0e1f2a3"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

COLUMNS = {
    "totp_secret": sa.String(64),
    "totp_last_counter": sa.Integer(),
    "backup_code_hashes": sa.Text(),
}


def upgrade() -> None:
    # A database made by the app at startup may already have them.
    existing = {c["name"] for c in sa.inspect(op.get_bind()).get_columns("owner")}
    for name, type_ in COLUMNS.items():
        if name not in existing:
            op.add_column("owner", sa.Column(name, type_, nullable=True))


def downgrade() -> None:
    with op.batch_alter_table("owner") as batch:
        for name in COLUMNS:
            batch.drop_column(name)
