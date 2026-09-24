"""kanal_ilani_alanlari

Revision ID: c4d81e2ab7f3
Revises: 714ea594f9e0
Create Date: 2026-09-25

DEC-002 — Vardiya kapanışı kanal ilanları:
- shifts.declared_pos / declared_eft / declared_credit (nullable Numeric(12,2))
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = "c4d81e2ab7f3"
down_revision: Union[str, None] = "714ea594f9e0"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "shifts",
        sa.Column("declared_pos", sa.Numeric(12, 2), nullable=True, comment="Kapanışta ilan edilen POS tahsilatı — cihaz raporu (DEC-002)"),
    )
    op.add_column(
        "shifts",
        sa.Column("declared_eft", sa.Numeric(12, 2), nullable=True, comment="Kapanışta ilan edilen EFT tahsilatı (DEC-002)"),
    )
    op.add_column(
        "shifts",
        sa.Column("declared_credit", sa.Numeric(12, 2), nullable=True, comment="Kapanışta ilan edilen veresiye tutarı (DEC-002)"),
    )


def downgrade() -> None:
    op.drop_column("shifts", "declared_credit")
    op.drop_column("shifts", "declared_eft")
    op.drop_column("shifts", "declared_pos")
