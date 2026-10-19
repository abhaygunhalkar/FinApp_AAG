"""add_net_worth_tables

Revision ID: d4e5f6a7b8c9
Revises: 6c99e5b26de2
Create Date: 2026-10-19 10:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'd4e5f6a7b8c9'
down_revision: Union[str, Sequence[str], None] = '6c99e5b26de2'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'financial_accounts',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('name', sa.String(200), nullable=False),
        sa.Column('institution', sa.String(200), nullable=True),
        sa.Column('account_type', sa.String(50), nullable=False),
        sa.Column('balance', sa.Float(), nullable=False, server_default='0.0'),
        sa.Column('notes', sa.Text(), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.Column('updated_at', sa.DateTime(), nullable=False, server_default=sa.func.now()),
    )
    op.create_table(
        'net_worth_snapshots',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('date', sa.Date(), nullable=False),
        sa.Column('total_assets', sa.Float(), nullable=False, server_default='0.0'),
        sa.Column('total_liabilities', sa.Float(), nullable=False, server_default='0.0'),
        sa.Column('net_worth', sa.Float(), nullable=False, server_default='0.0'),
        sa.Column('created_at', sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.UniqueConstraint('date', name='uq_net_worth_snapshots_date'),
    )


def downgrade() -> None:
    op.drop_table('net_worth_snapshots')
    op.drop_table('financial_accounts')
