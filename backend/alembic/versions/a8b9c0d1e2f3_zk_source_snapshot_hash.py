"""Store the source-record snapshot hash for newly generated ZK proofs.

Existing proofs have no recoverable proof-time source snapshot and remain NULL.
They must be regenerated before source-drift checks can be reported.
"""

from alembic import op
import sqlalchemy as sa


revision = "a8b9c0d1e2f3"
down_revision = "f7a8b9c0d2e3"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("shifts", sa.Column("zk_source_snapshot_hash", sa.String(64), nullable=True))


def downgrade() -> None:
    op.drop_column("shifts", "zk_source_snapshot_hash")
