"""add_pump_id_to_transactions

Revision ID: b9c1d2e3f4a5
Revises: a8b9c0d1e2f3
Create Date: 2026-10-11

Pompa bazlı analiz için yakıt satışlarına pompa referansı:
- transactions.pump_id (nullable UUID, FK -> pumps.id ON DELETE SET NULL)
- Mevcut kayıtlar NULL kalır; veri uydurulmaz.
- Market/diğer satışlarında ve eski kayıtlarda alan boş kalabilir.
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID


# revision identifiers, used by Alembic.
revision: str = "b9c1d2e3f4a5"
down_revision: Union[str, None] = "a8b9c0d1e2f3"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "transactions",
        sa.Column(
            "pump_id",
            UUID(as_uuid=True),
            nullable=True,
            comment="Hangi pompadan (yalnızca akaryakıt satışlarında; market/diğer satışlarda NULL)",
        ),
    )
    op.create_index(
        "ix_transactions_pump_id",
        "transactions",
        ["pump_id"],
    )
    op.create_foreign_key(
        "fk_transactions_pump_id",
        "transactions",
        "pumps",
        ["pump_id"],
        ["id"],
        ondelete="SET NULL",
    )


def downgrade() -> None:
    op.drop_constraint("fk_transactions_pump_id", "transactions", type_="foreignkey")
    op.drop_index("ix_transactions_pump_id", table_name="transactions")
    op.drop_column("transactions", "pump_id")
