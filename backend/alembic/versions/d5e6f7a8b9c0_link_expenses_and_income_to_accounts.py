"""link fixed costs and income to Net Worth accounts

Adds recurring_expenses.paid_from_account_id and
income_sources.deposited_to_account_id. Existing free-text values that match an
account's "Name (Institution)" label, or its name alone when that is unique,
are linked and their text cleared; anything else stays as text.

Revision ID: d5e6f7a8b9c0
Revises: c4d5e6f7a8b9
Create Date: 2026-10-26

"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = 'd5e6f7a8b9c0'
down_revision: Union[str, Sequence[str], None] = 'c4d5e6f7a8b9'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

# (table, account id column, text column, account types that may be linked)
LINKS = [
    ('recurring_expenses', 'paid_from_account_id', 'paid_from', ('checking', 'savings', 'credit_card')),
    ('income_sources', 'deposited_to_account_id', 'deposited_to', ('checking', 'savings')),
]


def _label(name: str, institution: str | None) -> str:
    return f"{name} ({institution})" if institution else name


def upgrade() -> None:
    for table, id_col, _text_col, _types in LINKS:
        with op.batch_alter_table(table) as batch:
            batch.add_column(sa.Column(id_col, sa.Integer(), nullable=True))
            batch.create_foreign_key(
                f'fk_{table}_{id_col}', 'financial_accounts', [id_col], ['id'], ondelete='SET NULL'
            )

    conn = op.get_bind()
    accounts = conn.execute(
        sa.text('SELECT id, name, institution, account_type FROM financial_accounts')
    ).fetchall()
    for table, id_col, text_col, types in LINKS:
        eligible = [a for a in accounts if a.account_type in types]
        by_label = {_label(a.name, a.institution).strip().lower(): a.id for a in eligible}
        names: dict[str, list[int]] = {}
        for a in eligible:
            names.setdefault(a.name.strip().lower(), []).append(a.id)
        rows = conn.execute(
            sa.text(f'SELECT id, {text_col} AS txt FROM {table} WHERE {text_col} IS NOT NULL')
        ).fetchall()
        for row in rows:
            key = row.txt.strip().lower()
            account_id = by_label.get(key)
            if account_id is None and len(names.get(key, [])) == 1:
                account_id = names[key][0]
            if account_id is not None:
                conn.execute(
                    sa.text(f'UPDATE {table} SET {id_col} = :a, {text_col} = NULL WHERE id = :r'),
                    {'a': account_id, 'r': row.id},
                )


def downgrade() -> None:
    conn = op.get_bind()
    for table, id_col, text_col, _types in LINKS:
        # Keep the account's name as text before the link column goes away.
        conn.execute(
            sa.text(
                f'UPDATE {table} SET {text_col} = ('
                "SELECT CASE WHEN fa.institution IS NOT NULL AND fa.institution != '' "
                "THEN fa.name || ' (' || fa.institution || ')' ELSE fa.name END "
                f'FROM financial_accounts fa WHERE fa.id = {table}.{id_col}'
                f') WHERE {id_col} IS NOT NULL'
            )
        )
        with op.batch_alter_table(table) as batch:
            batch.drop_constraint(f'fk_{table}_{id_col}', type_='foreignkey')
            batch.drop_column(id_col)
