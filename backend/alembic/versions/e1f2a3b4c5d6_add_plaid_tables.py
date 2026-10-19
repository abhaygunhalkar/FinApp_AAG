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
    op.add_column('financial_accounts', sa.Column('plaid_account_id', sa.String(100), nullable=True))
    op.add_column('financial_accounts', sa.Column('plaid_item_id', sa.Integer(), sa.ForeignKey('plaid_items.id'), nullable=True))
    op.create_unique_constraint('uq_financial_accounts_plaid_account_id', 'financial_accounts', ['plaid_account_id'])


def downgrade() -> None:
    op.drop_constraint('uq_financial_accounts_plaid_account_id', 'financial_accounts', type_='unique')
    op.drop_column('financial_accounts', 'plaid_item_id')
    op.drop_column('financial_accounts', 'plaid_account_id')
    op.drop_table('plaid_items')
