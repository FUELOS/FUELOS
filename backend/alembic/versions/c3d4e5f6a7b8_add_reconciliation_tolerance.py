"""add_reconciliation_tolerance_to_companies

Revision ID: c3d4e5f6a7b8
Revises: b2c3d4e5f6a7
Create Date: 2026-10-02

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'c3d4e5f6a7b8'
down_revision = 'b2c3d4e5f6a7'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        'companies',
        sa.Column(
            'reconciliation_tolerance',
            sa.Numeric(10, 2),
            nullable=False,
            server_default='1.00',
            comment='Kasa mutabakat tolerans limiti (TL)'
        )
    )


def downgrade() -> None:
    op.drop_column('companies', 'reconciliation_tolerance')
