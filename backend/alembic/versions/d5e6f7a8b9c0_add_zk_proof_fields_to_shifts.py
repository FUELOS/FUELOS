"""add_zk_proof_fields_to_shifts

Revision ID: d5e6f7a8b9c0
Revises: c3d4e5f6a7b8
Create Date: 2026-10-04

Midnight ZK Mutabakat Alanları:
- zk_proof_status, zk_reconciliation_class, zk_tolerance
- zk_commitment, zk_verified, zk_verified_at, zk_proof_hash
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "d5e6f7a8b9c0"
down_revision: Union[str, None] = "c3d4e5f6a7b8"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "shifts",
        sa.Column(
            "zk_proof_status",
            sa.String(50),
            nullable=False,
            server_default="none",
            comment="ZK mutabakat durumu: none, proved, verified, failed",
        ),
    )
    op.add_column(
        "shifts",
        sa.Column(
            "zk_reconciliation_class",
            sa.String(50),
            nullable=True,
            comment="Açıklanan ZK mutabakat sınıfı: matched, shortage, surplus",
        ),
    )
    op.add_column(
        "shifts",
        sa.Column(
            "zk_tolerance",
            sa.Numeric(12, 2),
            nullable=True,
            comment="ZK kanıtında kullanılan yetkili tolerans (TL)",
        ),
    )
    op.add_column(
        "shifts",
        sa.Column(
            "zk_commitment",
            sa.String(100),
            nullable=True,
            comment="Vardiya kriptografik taahhüt özeti (replay koruması)",
        ),
    )
    op.add_column(
        "shifts",
        sa.Column(
            "zk_verified",
            sa.Boolean(),
            nullable=False,
            server_default=sa.text("false"),
            comment="Midnight ledger doğrulaması başarılı mı",
        ),
    )
    op.add_column(
        "shifts",
        sa.Column(
            "zk_verified_at",
            sa.DateTime(timezone=True),
            nullable=True,
            comment="Midnight ledger doğrulama zamanı",
        ),
    )
    op.add_column(
        "shifts",
        sa.Column(
            "zk_proved_at",
            sa.DateTime(timezone=True),
            nullable=True,
            comment="Yerel proof server kanıt üretim zamanı",
        ),
    )
    op.add_column(
        "shifts",
        sa.Column(
            "zk_proof_hash",
            sa.String(100),
            nullable=True,
            comment="ZK kanıt özeti (SHA-256)",
        ),
    )
    op.add_column(
        "shifts",
        sa.Column(
            "zk_proof",
            sa.Text(),
            nullable=True,
            comment="Midnight proof bytes (base64); finansal witness içermez",
        ),
    )


def downgrade() -> None:
    op.drop_column("shifts", "zk_proof")
    op.drop_column("shifts", "zk_proof_hash")
    op.drop_column("shifts", "zk_proved_at")
    op.drop_column("shifts", "zk_verified_at")
    op.drop_column("shifts", "zk_verified")
    op.drop_column("shifts", "zk_commitment")
    op.drop_column("shifts", "zk_tolerance")
    op.drop_column("shifts", "zk_reconciliation_class")
    op.drop_column("shifts", "zk_proof_status")
