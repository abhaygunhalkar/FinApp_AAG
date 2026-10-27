"""add pay schedule columns to income_sources

Revision ID: e6f7a8b9c0d1
Revises: d5e6f7a8b9c0
Create Date: 2026-10-26

"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "e6f7a8b9c0d1"
down_revision: str | Sequence[str] | None = "d5e6f7a8b9c0"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    with op.batch_alter_table("income_sources") as batch:
        batch.add_column(sa.Column("pay_date", sa.Date(), nullable=True))
        batch.add_column(sa.Column("pay_day_1", sa.Integer(), nullable=True))
        batch.add_column(sa.Column("pay_day_2", sa.Integer(), nullable=True))
        batch.add_column(
            sa.Column(
                "weekend_rule",
                sa.String(length=10),
                nullable=False,
                server_default="before",
            )
        )


def downgrade() -> None:
    with op.batch_alter_table("income_sources") as batch:
        batch.drop_column("weekend_rule")
        batch.drop_column("pay_day_2")
        batch.drop_column("pay_day_1")
        batch.drop_column("pay_date")
