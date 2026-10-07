"""add_station_subscription_fields

Revision ID: e6f7a8b9c0d1
Revises: d5e6f7a8b9c0
Create Date: 2026-10-07

FuelOS SaaS Lisans & İstasyon Abonelik Alanları:
- subscription_status (active, past_due, suspended)
- subscription_plan (Standart, Pro SaaS, Kurumsal)
- subscription_expires_at (TIMESTAMP WITH TIME ZONE)
- monthly_fee (NUMERIC(10, 2))
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "e6f7a8b9c0d1"
down_revision: Union[str, None] = "d5e6f7a8b9c0"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "stations",
        sa.Column(
            "subscription_status",
            sa.String(50),
            nullable=False,
            server_default="active",
            comment="SaaS lisans abonelik durumu: active, past_due, suspended",
        ),
    )
    op.add_column(
        "stations",
        sa.Column(
            "subscription_plan",
            sa.String(50),
            nullable=False,
            server_default="Pro SaaS",
            comment="Abonelik paketi: Standart, Pro SaaS, Kurumsal",
        ),
    )
    op.add_column(
        "stations",
        sa.Column(
            "subscription_expires_at",
            sa.DateTime(timezone=True),
            nullable=True,
            comment="Lisans bitiş tarihi / vade",
        ),
    )
    op.add_column(
        "stations",
        sa.Column(
            "monthly_fee",
            sa.Numeric(10, 2),
            nullable=False,
            server_default="4990.00",
            comment="Aylık lisans bedeli (TL)",
        ),
    )


def downgrade() -> None:
    op.drop_column("stations", "monthly_fee")
    op.drop_column("stations", "subscription_expires_at")
    op.drop_column("stations", "subscription_plan")
    op.drop_column("stations", "subscription_status")
