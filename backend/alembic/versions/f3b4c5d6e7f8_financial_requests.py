"""Persist financial request identifiers for safe retries."""
from alembic import op
import sqlalchemy as sa

revision = 'f3b4c5d6e7f8'
down_revision = 'f2a3b4c5d6e7'
branch_labels = None
depends_on = None


def upgrade():
    op.create_table('financial_requests',
        sa.Column('user_id', sa.UUID(), sa.ForeignKey('users.id', ondelete='CASCADE'), primary_key=True),
        sa.Column('operation', sa.String(32), primary_key=True),
        sa.Column('key', sa.UUID(), primary_key=True),
        sa.Column('fingerprint', sa.String(64), nullable=False),
        sa.Column('resource_id', sa.UUID(), nullable=False))


def downgrade():
    op.drop_table('financial_requests')
