"""initial_schema

Revision ID: 714ea594f9e0
Revises:
Create Date: 2026-09-22

FuelOS Faz 1 — Tüm temel tabloların oluşturulması:
- companies, stations, users, shifts, transactions
- PostgreSQL enum tipleri: user_role, shift_status, transaction_type, payment_method
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql
from sqlalchemy.dialects.postgresql import UUID

# revision identifiers, used by Alembic.
revision: str = "714ea594f9e0"
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # ─── Enum tipleri ───
    user_role_enum = postgresql.ENUM("super_admin", "station_manager", "cashier", name="user_role")
    shift_status_enum = postgresql.ENUM("open", "closed", name="shift_status")
    transaction_type_enum = postgresql.ENUM("fuel", "market", "other", name="transaction_type")
    payment_method_enum = postgresql.ENUM("cash", "credit_card", "eft", "veresiye", name="payment_method")

    # Native enum'ları oluştur
    user_role_enum.create(op.get_bind(), checkfirst=True)
    shift_status_enum.create(op.get_bind(), checkfirst=True)
    transaction_type_enum.create(op.get_bind(), checkfirst=True)
    payment_method_enum.create(op.get_bind(), checkfirst=True)

    # Kolonlarda create_type=False ile kullan (tekrar oluşturulmasın)
    user_role_col = postgresql.ENUM("super_admin", "station_manager", "cashier", name="user_role", create_type=False)
    shift_status_col = postgresql.ENUM("open", "closed", name="shift_status", create_type=False)
    transaction_type_col = postgresql.ENUM("fuel", "market", "other", name="transaction_type", create_type=False)
    payment_method_col = postgresql.ENUM("cash", "credit_card", "eft", "veresiye", name="payment_method", create_type=False)

    # ─── 1. companies ───
    op.create_table(
        "companies",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("name", sa.String(255), nullable=False, comment="Şirket adı"),
        sa.Column("tax_number", sa.String(20), unique=True, nullable=False, comment="Vergi numarası"),
        sa.Column("address", sa.String(500), nullable=True, comment="Genel merkez adresi"),
        sa.Column("phone", sa.String(20), nullable=True, comment="İletişim telefonu"),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.text("true"), comment="Aktif/pasif durumu"),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    )

    # ─── 2. stations ───
    op.create_table(
        "stations",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("company_id", UUID(as_uuid=True), sa.ForeignKey("companies.id", ondelete="RESTRICT"), nullable=False),
        sa.Column("name", sa.String(255), nullable=False, comment="İstasyon adı"),
        sa.Column("code", sa.String(20), unique=True, nullable=False, comment="İstasyon kodu"),
        sa.Column("city", sa.String(100), nullable=False, comment="Şehir"),
        sa.Column("district", sa.String(100), nullable=True, comment="İlçe"),
        sa.Column("address", sa.String(500), nullable=True, comment="Açık adres"),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.text("true"), comment="Aktif/pasif durumu"),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    )

    # ─── 3. users ───
    op.create_table(
        "users",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("company_id", UUID(as_uuid=True), sa.ForeignKey("companies.id", ondelete="RESTRICT"), nullable=False),
        sa.Column("station_id", UUID(as_uuid=True), sa.ForeignKey("stations.id", ondelete="RESTRICT"), nullable=True),
        sa.Column("email", sa.String(255), unique=True, nullable=False, comment="E-posta"),
        sa.Column("hashed_password", sa.String(255), nullable=False, comment="Hashlenmiş şifre"),
        sa.Column("full_name", sa.String(255), nullable=False, comment="Ad Soyad"),
        sa.Column("role", user_role_col, nullable=False, comment="Kullanıcı rolü"),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.text("true"), comment="Hesap aktif/pasif"),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    )
    op.create_index("ix_users_email", "users", ["email"])

    # ─── 4. shifts ───
    op.create_table(
        "shifts",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("station_id", UUID(as_uuid=True), sa.ForeignKey("stations.id", ondelete="RESTRICT"), nullable=False),
        sa.Column("user_id", UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="RESTRICT"), nullable=False),
        sa.Column("start_time", sa.DateTime(timezone=True), nullable=False, comment="Vardiya başlangıcı"),
        sa.Column("end_time", sa.DateTime(timezone=True), nullable=True, comment="Vardiya bitişi"),
        sa.Column("status", shift_status_col, nullable=False, server_default="open", comment="Vardiya durumu"),
        sa.Column("opening_cash", sa.Numeric(12, 2), nullable=False, server_default=sa.text("0"), comment="Açılış nakit (TL)"),
        sa.Column("closing_cash", sa.Numeric(12, 2), nullable=True, comment="Kapanış nakit (TL)"),
        sa.Column("notes", sa.Text(), nullable=True, comment="Vardiya notları"),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    )
    op.create_index("ix_shifts_station_id", "shifts", ["station_id"])
    op.create_index("ix_shifts_user_id", "shifts", ["user_id"])

    # ─── 5. transactions ───
    op.create_table(
        "transactions",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("shift_id", UUID(as_uuid=True), sa.ForeignKey("shifts.id", ondelete="RESTRICT"), nullable=False),
        sa.Column("station_id", UUID(as_uuid=True), sa.ForeignKey("stations.id", ondelete="RESTRICT"), nullable=False),
        sa.Column("type", transaction_type_col, nullable=False, comment="İşlem türü"),
        sa.Column("payment_method", payment_method_col, nullable=False, comment="Ödeme yöntemi"),
        sa.Column("amount", sa.Numeric(12, 2), nullable=False, comment="Tutar (TL)"),
        sa.Column("liters", sa.Numeric(10, 3), nullable=True, comment="Satılan litre"),
        sa.Column("fuel_type", sa.String(50), nullable=True, comment="Yakıt türü"),
        sa.Column("description", sa.String(500), nullable=True, comment="Açıklama"),
        sa.Column("transaction_time", sa.DateTime(timezone=True), nullable=False, comment="İşlem zamanı"),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    )
    op.create_index("ix_transactions_shift_id", "transactions", ["shift_id"])
    op.create_index("ix_transactions_station_id", "transactions", ["station_id"])


def downgrade() -> None:
    # Tabloları bağımlılık sırasının tersine göre sil
    op.drop_table("transactions")
    op.drop_table("shifts")
    op.drop_table("users")
    op.drop_table("stations")
    op.drop_table("companies")

    # Enum tiplerini sil
    sa.Enum(name="payment_method").drop(op.get_bind(), checkfirst=True)
    sa.Enum(name="transaction_type").drop(op.get_bind(), checkfirst=True)
    sa.Enum(name="shift_status").drop(op.get_bind(), checkfirst=True)
    sa.Enum(name="user_role").drop(op.get_bind(), checkfirst=True)
