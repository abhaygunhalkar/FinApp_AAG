"""replace ticker unique constraint with composite ticker holding_type broker

Revision ID: 48f023481dbb
Revises: 5a95785ba58c
Create Date: 2026-10-01 15:21:38.384381

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '48f023481dbb'
down_revision: Union[str, Sequence[str], None] = '5a95785ba58c'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


NAMING_CONVENTION = {"uq": "uq_%(table_name)s_%(column_0_name)s"}


def upgrade() -> None:
    """Replace the single-column unique constraint on holdings.ticker with a
    composite unique constraint on (ticker, holding_type, broker), so the same
    ticker can be held under multiple brokers.
    """
    with op.batch_alter_table(
        'holdings', schema=None, naming_convention=NAMING_CONVENTION
    ) as batch_op:
        batch_op.drop_constraint('uq_holdings_ticker', type_='unique')
        batch_op.create_unique_constraint(
            'uq_holdings_ticker_type_broker', ['ticker', 'holding_type', 'broker']
        )


def downgrade() -> None:
    """Restore the single-column unique constraint on holdings.ticker."""
    with op.batch_alter_table('holdings', schema=None) as batch_op:
        batch_op.drop_constraint('uq_holdings_ticker_type_broker', type_='unique')
        batch_op.create_unique_constraint('uq_holdings_ticker', ['ticker'])
