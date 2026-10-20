"""add liability detail columns; reset net worth snapshots

Snapshots written before this revision excluded the stock/ETF portfolio from
assets, so they don't match the corrected net worth. They are deleted and the
trend restarts from the next snapshot.

Revision ID: a7b8c9d0e1f2
Revises: f1e2d3c4b5a6
Create Date: 2026-10-20

"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = 'a7b8c9d0e1f2'
down_revision: Union[str, Sequence[str], None] = 'f1e2d3c4b5a6'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

COLUMNS = [
    sa.Column('credit_limit', sa.Float(), nullable=True),
    sa.Column('original_amount', sa.Float(), nullable=True),
    sa.Column('apr', sa.Float(), nullable=True),
    sa.Column('due_date', sa.Date(), nullable=True),
    sa.Column('payoff_date', sa.Date(), nullable=True),
]


def upgrade() -> None:
    # verify_database() may already have added these at app startup.
    existing = {c['name'] for c in sa.inspect(op.get_bind()).get_columns('financial_accounts')}
    missing = [c for c in COLUMNS if c.name not in existing]
    if not missing:
        return
    with op.batch_alter_table('financial_accounts') as batch_op:
        for column in missing:
            batch_op.add_column(column)
    op.execute('DELETE FROM net_worth_snapshots')


def downgrade() -> None:
    with op.batch_alter_table('financial_accounts') as batch_op:
        for column in reversed(COLUMNS):
            batch_op.drop_column(column.name)
