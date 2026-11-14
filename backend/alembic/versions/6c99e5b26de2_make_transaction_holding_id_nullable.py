"""make_transaction_holding_id_nullable

Revision ID: 6c99e5b26de2
Revises: 271004d5de41
Create Date: 2026-05-13 13:38:03.586926

"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "6c99e5b26de2"
down_revision: str | Sequence[str] | None = "271004d5de41"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Make holding_id nullable, keeping transaction history when holdings go."""
    # For SQLite, we need to recreate the table via batch mode
    # The naming_convention helps batch mode find the FK to drop
    with op.batch_alter_table(
        "transactions",
        schema=None,
        naming_convention={
            "fk": "fk_%(table_name)s_%(column_0_name)s_%(referred_table_name)s",
        },
    ) as batch_op:
        batch_op.alter_column("holding_id", existing_type=sa.INTEGER(), nullable=True)


def downgrade() -> None:
    """Revert holding_id to non-nullable."""
    with op.batch_alter_table("transactions", schema=None) as batch_op:
        batch_op.alter_column("holding_id", existing_type=sa.INTEGER(), nullable=False)
