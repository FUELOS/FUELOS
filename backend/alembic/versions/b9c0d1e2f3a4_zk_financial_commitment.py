"""Persist the circuit-bound, salted public financial commitment for v4 proofs."""

from alembic import op
import sqlalchemy as sa

revision = "b9c0d1e2f3a4"
down_revision = "a8b9c0d1e2f3"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("shifts", sa.Column("zk_financial_commitment", sa.String(64), nullable=True))
    op.add_column("shifts", sa.Column("zk_financial_nonce", sa.String(64), nullable=True))


def downgrade() -> None:
    op.drop_column("shifts", "zk_financial_nonce")
    op.drop_column("shifts", "zk_financial_commitment")
