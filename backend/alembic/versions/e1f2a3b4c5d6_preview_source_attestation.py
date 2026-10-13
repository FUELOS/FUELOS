"""Store two public signatures over a finalized Preview reconciliation statement."""

from alembic import op
import sqlalchemy as sa

revision = "e1f2a3b4c5d6"
down_revision = "c0d1e2f3a4b5"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("zk_preview_handoffs", sa.Column("source_signature", sa.String(88)))
    op.add_column("zk_preview_handoffs", sa.Column("manager_signature", sa.String(88)))
    op.add_column("zk_preview_handoffs", sa.Column("source_key_fingerprint", sa.String(64)))
    op.add_column("zk_preview_handoffs", sa.Column("manager_key_fingerprint", sa.String(64)))
    op.add_column("zk_preview_handoffs", sa.Column("attested_at", sa.DateTime(timezone=True)))


def downgrade() -> None:
    op.drop_column("zk_preview_handoffs", "attested_at")
    op.drop_column("zk_preview_handoffs", "manager_key_fingerprint")
    op.drop_column("zk_preview_handoffs", "source_key_fingerprint")
    op.drop_column("zk_preview_handoffs", "manager_signature")
    op.drop_column("zk_preview_handoffs", "source_signature")
