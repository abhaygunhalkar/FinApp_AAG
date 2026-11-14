"""add_options_trades_table

Revision ID: cf3d27a1b9e4
Revises: b2d88c8187fe
Create Date: 2026-06-04 12:00:00.000000

"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "cf3d27a1b9e4"
down_revision: str | Sequence[str] | None = "b2d88c8187fe"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Upgrade schema: add options_trades table."""
    op.create_table(
        "options_trades",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("ticker", sa.String(length=10), nullable=False),
        sa.Column("trade_type", sa.String(length=20), nullable=False),
        sa.Column("strike_price", sa.Float(), nullable=False),
        sa.Column("premium", sa.Float(), nullable=False),
        sa.Column("contracts", sa.Integer(), nullable=False),
        sa.Column("open_date", sa.Date(), nullable=False),
        sa.Column("expiry_date", sa.Date(), nullable=False),
        sa.Column("status", sa.String(length=30), nullable=False),
        sa.Column("close_price", sa.Float(), nullable=True),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )
    with op.batch_alter_table("options_trades", schema=None) as batch_op:
        batch_op.create_index(
            batch_op.f("ix_options_trades_expiry_date"), ["expiry_date"], unique=False
        )


def downgrade() -> None:
    """Downgrade schema: drop options_trades table."""
    with op.batch_alter_table("options_trades", schema=None) as batch_op:
        batch_op.drop_index(batch_op.f("ix_options_trades_expiry_date"))
    op.drop_table("options_trades")
