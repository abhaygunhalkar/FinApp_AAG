"""add_plaid_tables

Revision ID: e1f2a3b4c5d6
Revises: d4e5f6a7b8c9
Create Date: 2026-10-19 12:00:00.000000

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = 'e1f2a3b4c5d6'
down_revision: Union[str, Sequence[str], None] = 'd4e5f6a7b8c9'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'plaid_items',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('item_id', sa.String(100), nullable=False, unique=True),
        sa.Column('access_token', sa.String(200), nullable=False),
        sa.Column('institution_id', sa.String(100), nullable=True),
        sa.Column('institution_name', sa.String(200), nullable=True),
        sa.Column('last_synced', sa.DateTime(), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=False, server_default=sa.func.now()),
    )
    # SQLite can't ALTER constraints in place, so use batch (copy-and-move) mode.
    with op.batch_alter_table('financial_accounts') as batch_op:
        batch_op.add_column(sa.Column('plaid_account_id', sa.String(100), nullable=True))
        batch_op.add_column(sa.Column('plaid_item_id', sa.Integer(), nullable=True))
        batch_op.create_foreign_key('fk_financial_accounts_plaid_item_id', 'plaid_items', ['plaid_item_id'], ['id'])
        batch_op.create_unique_constraint('uq_financial_accounts_plaid_account_id', ['plaid_account_id'])


def downgrade() -> None:
    with op.batch_alter_table('financial_accounts') as batch_op:
        batch_op.drop_constraint('uq_financial_accounts_plaid_account_id', type_='unique')
        batch_op.drop_constraint('fk_financial_accounts_plaid_item_id', type_='foreignkey')
        batch_op.drop_column('plaid_item_id')
        batch_op.drop_column('plaid_account_id')
    op.drop_table('plaid_items')
