"""add sell_lot_allocations and fill them in for existing sells

Each existing sell is matched to the oldest buy lots of the same holding
(one ticker at one broker). Sells whose holding was since closed lost their
holding link, so those are matched within the ticker, as before.

Revision ID: f7a8b9c0d1e2
Revises: e6f7a8b9c0d1
Create Date: 2026-10-27

"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "f7a8b9c0d1e2"
down_revision: str | Sequence[str] | None = "e6f7a8b9c0d1"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

EPSILON = 1e-6


def upgrade() -> None:
    conn = op.get_bind()
    # The app creates missing tables at startup, so it may already exist.
    if "sell_lot_allocations" not in sa.inspect(conn).get_table_names():
        op.create_table(
            "sell_lot_allocations",
            sa.Column("id", sa.Integer(), primary_key=True),
            sa.Column(
                "sell_transaction_id",
                sa.Integer(),
                sa.ForeignKey("transactions.id", ondelete="CASCADE"),
                nullable=False,
            ),
            sa.Column(
                "buy_transaction_id",
                sa.Integer(),
                sa.ForeignKey("transactions.id", ondelete="RESTRICT"),
                nullable=False,
            ),
            sa.Column("quantity", sa.Float(), nullable=False),
        )
        op.create_index(
            "ix_sell_lot_allocations_sell",
            "sell_lot_allocations",
            ["sell_transaction_id"],
        )
        op.create_index(
            "ix_sell_lot_allocations_buy",
            "sell_lot_allocations",
            ["buy_transaction_id"],
        )

    sold: dict[int, float] = {}
    allocated_sells: set[int] = set()
    for sell_id, buy_id, qty in conn.execute(
        sa.text(
            "SELECT sell_transaction_id, buy_transaction_id, quantity "
            "FROM sell_lot_allocations"
        )
    ):
        sold[buy_id] = sold.get(buy_id, 0.0) + qty
        allocated_sells.add(sell_id)

    rows = conn.execute(
        sa.text(
            "SELECT id, holding_id, ticker, transaction_type, quantity, "
            "transaction_date FROM transactions"
        )
    ).fetchall()
    rows = sorted(rows, key=lambda r: (str(r[5]), r[3] != "buy", r[0]))

    # holding (or ticker, when the holding is gone) -> [[buy id, shares left]]
    lots: dict[tuple[str, object], list[list[float]]] = {}
    inserts = []
    for txn_id, holding_id, ticker, txn_type, qty, _ in rows:
        key = ("h", holding_id) if holding_id is not None else ("t", ticker)
        queue = lots.setdefault(key, [])
        if txn_type == "buy":
            queue.append([txn_id, qty - sold.get(txn_id, 0.0)])
            continue
        if txn_id in allocated_sells:
            continue
        left = qty
        for lot in queue:
            if left <= EPSILON:
                break
            take = min(lot[1], left)
            if take <= EPSILON:
                continue
            lot[1] -= take
            left -= take
            inserts.append({"sell": txn_id, "buy": int(lot[0]), "qty": take})

    for row in inserts:
        conn.execute(
            sa.text(
                "INSERT INTO sell_lot_allocations "
                "(sell_transaction_id, buy_transaction_id, quantity) "
                "VALUES (:sell, :buy, :qty)"
            ),
            row,
        )


def downgrade() -> None:
    op.drop_index("ix_sell_lot_allocations_buy", table_name="sell_lot_allocations")
    op.drop_index("ix_sell_lot_allocations_sell", table_name="sell_lot_allocations")
    op.drop_table("sell_lot_allocations")
