"""Store public Preview handoff and transaction receipt without private witness bytes."""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "c0d1e2f3a4b5"
down_revision = "c2d3e4f5a6b7"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "zk_preview_handoffs",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("shift_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("shifts.id", ondelete="RESTRICT"), nullable=False, unique=True),
        sa.Column("proof_hash", sa.String(64), nullable=False),
        sa.Column("source_snapshot_hash", sa.String(64), nullable=False),
        sa.Column("contract_address", sa.String(64), nullable=False),
        sa.Column("verifier_key_sha256", sa.String(64), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("pending_tx_id", sa.String(66), unique=True),
        sa.Column("pending_at", sa.DateTime(timezone=True)),
        sa.Column("submitted_tx_id", sa.String(66), unique=True),
        sa.Column("tx_hash", sa.String(64)),
        sa.Column("block_hash", sa.String(64)),
        sa.Column("block_height", sa.Integer),
        sa.Column("confirmed_at", sa.DateTime(timezone=True)),
    )


def downgrade() -> None:
    op.drop_table("zk_preview_handoffs")
