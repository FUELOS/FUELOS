"""add_planned_end_time_to_shifts

Revision ID: b2c3d4e5f6a7
Revises: a1b2c3d4e5f6
Create Date: 2026-10-02

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'b2c3d4e5f6a7'
down_revision = 'a1b2c3d4e5f6'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        'shifts',
        sa.Column('planned_end_time', sa.DateTime(timezone=True), nullable=True, comment='Planlanan otomatik kapanış zamanı')
    )


def downgrade() -> None:
    op.drop_column('shifts', 'planned_end_time')
