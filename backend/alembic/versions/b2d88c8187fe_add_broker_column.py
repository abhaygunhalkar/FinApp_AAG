"""add_broker_column

Revision ID: b2d88c8187fe
Revises: 6c99e5b26de2
Create Date: 2026-05-13 14:09:30.195931

"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "b2d88c8187fe"
down_revision: str | Sequence[str] | None = "6c99e5b26de2"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Add broker column to holdings and transactions."""
    with op.batch_alter_table("holdings", schema=None) as batch_op:
        batch_op.add_column(sa.Column("broker", sa.String(length=50), nullable=True))

    with op.batch_alter_table("transactions", schema=None) as batch_op:
        batch_op.add_column(sa.Column("broker", sa.String(length=50), nullable=True))


def downgrade() -> None:
    """Remove broker column."""
    with op.batch_alter_table("transactions", schema=None) as batch_op:
        batch_op.drop_column("broker")

    with op.batch_alter_table("holdings", schema=None) as batch_op:
        batch_op.drop_column("broker")
