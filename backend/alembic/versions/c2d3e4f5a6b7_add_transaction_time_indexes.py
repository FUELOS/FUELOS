"""add_transaction_time_indexes

Revision ID: c2d3e4f5a6b7
Revises: b9c1d2e3f4a5
Create Date: 2026-10-11

Pompa satış analizi sorguları için bileşik indeksler:
- ix_transactions_station_time (station_id, transaction_time)
- ix_transactions_pump_time (pump_id, transaction_time)

Not: shift_id, station_id ve pump_id üzerinde zaten tekil indeksler var;
bu migration yalnızca transaction_time içeren bileşik indeksleri ekler.
"""

from typing import Sequence, Union

from alembic import op


# revision identifiers, used by Alembic.
revision: str = "c2d3e4f5a6b7"
down_revision: Union[str, None] = "b9c1d2e3f4a5"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_index(
        "ix_transactions_station_time",
        "transactions",
        ["station_id", "transaction_time"],
    )
    op.create_index(
        "ix_transactions_pump_time",
        "transactions",
        ["pump_id", "transaction_time"],
    )


def downgrade() -> None:
    op.drop_index("ix_transactions_pump_time", table_name="transactions")
    op.drop_index("ix_transactions_station_time", table_name="transactions")
