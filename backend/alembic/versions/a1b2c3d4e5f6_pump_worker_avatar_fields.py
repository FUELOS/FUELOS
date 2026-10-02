"""pump_worker_avatar_fields

Revision ID: a1b2c3d4e5f6
Revises: c4d81e2ab7f3
Create Date: 2026-10-02

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = 'a1b2c3d4e5f6'
down_revision = 'c4d81e2ab7f3'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # ── pumps tablosu ──
    op.create_table(
        'pumps',
        sa.Column('id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('station_id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('pump_number', sa.Integer(), nullable=False),
        sa.Column('label', sa.String(length=100), nullable=False),
        sa.Column('fuel_types', sa.String(length=200), nullable=False, server_default='Motorin,Benzin'),
        sa.Column('is_active', sa.Boolean(), nullable=False, server_default='true'),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.ForeignKeyConstraint(['station_id'], ['stations.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index('ix_pumps_station_id', 'pumps', ['station_id'])

    # ── shifts tablosuna yeni kolonlar ──
    op.add_column('shifts', sa.Column('pump_id', postgresql.UUID(as_uuid=True), nullable=True))
    op.add_column('shifts', sa.Column('worker_name', sa.String(length=200), nullable=True))
    op.add_column('shifts', sa.Column('worker_avatar', sa.Text(), nullable=True))
    op.create_index('ix_shifts_pump_id', 'shifts', ['pump_id'])
    op.create_foreign_key('fk_shifts_pump_id', 'shifts', 'pumps', ['pump_id'], ['id'], ondelete='SET NULL')


def downgrade() -> None:
    op.drop_constraint('fk_shifts_pump_id', 'shifts', type_='foreignkey')
    op.drop_index('ix_shifts_pump_id', table_name='shifts')
    op.drop_column('shifts', 'worker_avatar')
    op.drop_column('shifts', 'worker_name')
    op.drop_column('shifts', 'pump_id')
    op.drop_index('ix_pumps_station_id', table_name='pumps')
    op.drop_table('pumps')
