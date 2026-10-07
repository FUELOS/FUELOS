"""Freeze the reconciliation tolerance on each newly closed shift.

Historical closed shifts have no reliable record of their closing policy.
They remain NULL and the application applies the documented 1 TL legacy
fallback; current company settings must not silently rewrite history.
Existing proofs also keep NULL statement version because they predate the
Compact shift-context binding and must be regenerated for that assertion.
"""

from alembic import op
import sqlalchemy as sa


revision = "f7a8b9c0d2e3"
down_revision = "e6f7a8b9c0d1"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "shifts",
        sa.Column("reconciliation_tolerance", sa.Numeric(10, 2), nullable=True),
    )
    op.add_column("shifts", sa.Column("zk_statement_version", sa.String(50), nullable=True))


def downgrade() -> None:
    op.drop_column("shifts", "zk_statement_version")
    op.drop_column("shifts", "reconciliation_tolerance")
