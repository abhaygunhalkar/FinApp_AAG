"""Merge net-worth/plaid branch with main branch.

Revision ID: f1e2d3c4b5a6
Revises: 48f023481dbb, e1f2a3b4c5d6
Create Date: 2026-10-19

"""

from typing import Sequence, Union

revision: str = 'f1e2d3c4b5a6'
down_revision: Union[str, Sequence[str], None] = ('48f023481dbb', 'e1f2a3b4c5d6')
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    pass


def downgrade() -> None:
    pass
