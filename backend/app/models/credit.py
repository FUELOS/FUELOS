"""
FuelOS — Dijital Veresiye ve Borç Takip modelleri.

İki ayrı veresiye sistemi tek bir cari defter (ledger) yapısını paylaşır:

1. Kurumsal veresiye  → CreditCompany + CreditVehicle + CreditDriver
2. Bireysel veresiye  → CreditCustomer

Her iki hesap türünün borç tarafı CreditSale (veresiye satış kaydı), alacak
tarafı CreditPayment (tahsilat / düzeltme) kayıtlarından oluşur. Bakiye hiçbir
yerde saklanmaz; her zaman bu iki tablodan hesaplanır (sapma olamaz).

Not: `Company` modeli FuelOS kiracısını (istasyon işleten şirket) temsil eder.
Buradaki `CreditCompany` ise istasyonun veresiye yakıt verdiği MÜŞTERİ şirkettir.

Mahremiyet: T.C. kimlik numaraları düz metin saklanmaz. `tc_encrypted` şifreli
değeri, `tc_hash` ise eşleştirme için anahtarlı (HMAC) kör indeksi tutar.
"""

import uuid
from datetime import datetime, timezone
from decimal import Decimal
from typing import TYPE_CHECKING, List, Optional

from sqlalchemy import (
    Boolean,
    CheckConstraint,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    Numeric,
    String,
    Text,
    UniqueConstraint,
    func,
    text,
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base
from app.models.base import TimestampMixin, generate_uuid

if TYPE_CHECKING:
    from app.models.transaction import Transaction


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


# ─────────────────────────── BELGELER ───────────────────────────


class CreditDocument(Base):
    """Yüklenen imzalı fiş veya kimlik fotoğrafı (dosya diskte şifreli tutulur)."""

    __tablename__ = "credit_documents"
    __table_args__ = (
        CheckConstraint("kind IN ('receipt', 'id_photo')", name="ck_credit_documents_kind"),
        CheckConstraint("size_bytes > 0", name="ck_credit_documents_size"),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=generate_uuid)
    station_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("stations.id", ondelete="RESTRICT"), nullable=False, index=True,
    )
    kind: Mapped[str] = mapped_column(String(20), nullable=False, comment="receipt | id_photo")
    content_type: Mapped[str] = mapped_column(String(100), nullable=False)
    size_bytes: Mapped[int] = mapped_column(Integer, nullable=False, comment="Şifrelenmemiş dosya boyutu")
    sha256: Mapped[str] = mapped_column(String(64), nullable=False, comment="Şifrelenmemiş içeriğin SHA-256 özeti")
    storage_key: Mapped[str] = mapped_column(
        String(255), nullable=False, unique=True, comment="Yükleme dizinindeki rastgele dosya adı",
    )
    is_encrypted: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    uploaded_by: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True,
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=_utcnow, server_default=func.now(), nullable=False,
    )


# ─────────────────────────── KURUMSAL VERESİYE ───────────────────────────


class CreditCompany(TimestampMixin, Base):
    """İstasyonla anlaşmalı, veresiye yakıt alabilen müşteri şirket."""

    __tablename__ = "credit_companies"
    __table_args__ = (
        Index(
            "uq_credit_companies_station_tax", "station_id", "tax_number",
            unique=True, postgresql_where=text("tax_number IS NOT NULL"),
        ),
        CheckConstraint("credit_limit IS NULL OR credit_limit >= 0", name="ck_credit_companies_limit"),
        CheckConstraint(
            "payment_term_days IS NULL OR (payment_term_days >= 1 AND payment_term_days <= 365)",
            name="ck_credit_companies_term",
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=generate_uuid)
    station_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("stations.id", ondelete="RESTRICT"), nullable=False, index=True,
        comment="Anlaşmanın yapıldığı istasyon",
    )
    name: Mapped[str] = mapped_column(String(255), nullable=False, comment="Şirket adı / unvanı")
    tax_number: Mapped[str | None] = mapped_column(String(20), nullable=True, comment="Vergi kimlik numarası")
    tax_office: Mapped[str | None] = mapped_column(String(100), nullable=True, comment="Vergi dairesi")
    address: Mapped[str | None] = mapped_column(String(500), nullable=True)
    contact_name: Mapped[str | None] = mapped_column(String(255), nullable=True, comment="Yetkili kişi")
    phone: Mapped[str | None] = mapped_column(String(20), nullable=True)
    email: Mapped[str | None] = mapped_column(String(255), nullable=True)

    # Yakıt alım yetkisi — istasyon sahibi istediği an sonlandırabilir.
    is_authorized: Mapped[bool] = mapped_column(
        Boolean, default=True, nullable=False, comment="Veresiye yakıt alım yetkisi açık mı",
    )
    authorization_ended_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    authorization_ended_by: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True,
    )
    authorization_end_reason: Mapped[str | None] = mapped_column(String(500), nullable=True)

    # Opsiyonel: limit ve vade tanımlamak zorunlu değildir.
    credit_limit: Mapped[Decimal | None] = mapped_column(
        Numeric(14, 2), nullable=True, comment="Opsiyonel kredi limiti (TL); NULL = limitsiz",
    )
    payment_term_days: Mapped[int | None] = mapped_column(
        Integer, nullable=True, comment="Opsiyonel ödeme vadesi (gün); NULL = vadesiz",
    )
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_by: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True,
    )

    vehicles: Mapped[List["CreditVehicle"]] = relationship(
        "CreditVehicle", back_populates="company", lazy="selectin", order_by="CreditVehicle.plate",
    )
    drivers: Mapped[List["CreditDriver"]] = relationship(
        "CreditDriver", back_populates="company", lazy="selectin", order_by="CreditDriver.full_name",
    )

    def __repr__(self) -> str:
        return f"<CreditCompany(id={self.id}, name='{self.name}', authorized={self.is_authorized})>"


class CreditVehicle(TimestampMixin, Base):
    """Şirket adına veresiye yakıt alabilecek araç (plaka)."""

    __tablename__ = "credit_vehicles"
    __table_args__ = (
        UniqueConstraint("credit_company_id", "plate", name="uq_credit_vehicles_company_plate"),
        # Bir istasyonda aynı plaka aynı anda yalnızca tek şirkette aktif olabilir;
        # böylece plaka sorgusu her zaman tek bir şirkete çözülür.
        Index(
            "uq_credit_vehicles_station_active_plate", "station_id", "plate",
            unique=True, postgresql_where=text("is_active"),
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=generate_uuid)
    credit_company_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("credit_companies.id", ondelete="RESTRICT"), nullable=False, index=True,
    )
    station_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("stations.id", ondelete="RESTRICT"), nullable=False,
        comment="Şirketin istasyonu (plaka sorgusu için denormalize)",
    )
    plate: Mapped[str] = mapped_column(String(20), nullable=False, comment="Normalize plaka (örn: 06ABC123)")
    description: Mapped[str | None] = mapped_column(String(255), nullable=True, comment="Marka/model/not")
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)

    company: Mapped["CreditCompany"] = relationship("CreditCompany", back_populates="vehicles")


class CreditDriver(TimestampMixin, Base):
    """Şirketin yetkilendirdiği sürücü."""

    __tablename__ = "credit_drivers"
    __table_args__ = (
        UniqueConstraint("credit_company_id", "tc_hash", name="uq_credit_drivers_company_tc"),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=generate_uuid)
    credit_company_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("credit_companies.id", ondelete="RESTRICT"), nullable=False, index=True,
    )
    full_name: Mapped[str] = mapped_column(String(255), nullable=False)
    tc_encrypted: Mapped[str] = mapped_column(Text, nullable=False, comment="Şifreli T.C. kimlik no")
    tc_hash: Mapped[str] = mapped_column(String(64), nullable=False, index=True, comment="HMAC kör indeks")
    phone: Mapped[str | None] = mapped_column(String(20), nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)

    company: Mapped["CreditCompany"] = relationship("CreditCompany", back_populates="drivers")


# ─────────────────────────── BİREYSEL VERESİYE ───────────────────────────


class CreditCustomer(TimestampMixin, Base):
    """Herhangi bir şirket anlaşması olmadan kişisel veresiye alan müşteri."""

    __tablename__ = "credit_customers"
    __table_args__ = (
        UniqueConstraint("station_id", "tc_hash", name="uq_credit_customers_station_tc"),
        CheckConstraint("credit_limit IS NULL OR credit_limit >= 0", name="ck_credit_customers_limit"),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=generate_uuid)
    station_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("stations.id", ondelete="RESTRICT"), nullable=False, index=True,
    )
    full_name: Mapped[str] = mapped_column(String(255), nullable=False, comment="Adı soyadı")
    tc_encrypted: Mapped[str] = mapped_column(Text, nullable=False, comment="Şifreli T.C. kimlik no")
    tc_hash: Mapped[str] = mapped_column(String(64), nullable=False, index=True, comment="HMAC kör indeks")
    phone: Mapped[str] = mapped_column(String(20), nullable=False, comment="Cep telefonu")
    plate: Mapped[str | None] = mapped_column(String(20), nullable=True, index=True, comment="Varsa araç plakası")
    id_photo_document_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("credit_documents.id", ondelete="SET NULL"), nullable=True,
        comment="Kimlik fotoğrafı",
    )
    is_active: Mapped[bool] = mapped_column(
        Boolean, default=True, nullable=False, comment="Veresiye alım yetkisi açık mı",
    )
    credit_limit: Mapped[Decimal | None] = mapped_column(
        Numeric(14, 2), nullable=True, comment="Opsiyonel kredi limiti (TL); NULL = limitsiz",
    )
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_by: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True,
    )

    @property
    def has_id_photo(self) -> bool:
        return self.id_photo_document_id is not None

    def __repr__(self) -> str:
        return f"<CreditCustomer(id={self.id}, name='{self.full_name}')>"


# ─────────────────────────── CARİ DEFTER ───────────────────────────


class CreditSale(Base):
    """
    Veresiye satış kaydı — cari hesabın BORÇ tarafı.

    Her kayıt tam olarak bir `Transaction` (ödeme yöntemi: veresiye) ile eşleşir.
    Transaction otomasyon/satış tarafını, CreditSale ise cari defter tarafını
    temsil eder; günlük mutabakat bu ikisini karşılaştırır. Tutar/litre/yakıt
    alanları satış anındaki değerlerin değişmez kopyasıdır.
    """

    __tablename__ = "credit_sales"
    __table_args__ = (
        CheckConstraint(
            "(account_type = 'corporate' AND credit_company_id IS NOT NULL AND credit_customer_id IS NULL)"
            " OR (account_type = 'individual' AND credit_customer_id IS NOT NULL AND credit_company_id IS NULL)",
            name="ck_credit_sales_account",
        ),
        CheckConstraint("amount > 0", name="ck_credit_sales_amount"),
        Index("ix_credit_sales_station_time", "station_id", "sale_time"),
        Index("ix_credit_sales_company_time", "credit_company_id", "sale_time"),
        Index("ix_credit_sales_customer_time", "credit_customer_id", "sale_time"),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=generate_uuid)
    transaction_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("transactions.id", ondelete="RESTRICT"), nullable=False, unique=True,
        comment="Eşleşen satış/otomasyon kaydı (1:1)",
    )
    station_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("stations.id", ondelete="RESTRICT"), nullable=False,
    )
    shift_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("shifts.id", ondelete="RESTRICT"), nullable=False, index=True,
    )
    account_type: Mapped[str] = mapped_column(String(20), nullable=False, comment="corporate | individual")
    credit_company_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("credit_companies.id", ondelete="RESTRICT"), nullable=True,
    )
    credit_customer_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("credit_customers.id", ondelete="RESTRICT"), nullable=True,
    )

    # Araç ve sürücü — satış anındaki değerlerin kopyası da tutulur.
    vehicle_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("credit_vehicles.id", ondelete="SET NULL"), nullable=True,
    )
    plate: Mapped[str | None] = mapped_column(String(20), nullable=True, comment="Satış anındaki plaka")
    driver_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("credit_drivers.id", ondelete="SET NULL"), nullable=True,
    )
    driver_name: Mapped[str | None] = mapped_column(String(255), nullable=True, comment="Satış anındaki sürücü adı")
    identity_verified: Mapped[bool] = mapped_column(
        Boolean, default=False, nullable=False,
        comment="Sürücü/müşteri T.C. kimlik no satış anında sistemdeki kayıtla eşleşti mi",
    )

    amount: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False, comment="Satış tutarı (TL)")
    liters: Mapped[Decimal | None] = mapped_column(Numeric(10, 3), nullable=True)
    fuel_type: Mapped[str | None] = mapped_column(String(50), nullable=True)
    sale_time: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)

    # İmzalı fiş fotoğrafı (satıştan sonra yüklenebilir).
    receipt_document_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("credit_documents.id", ondelete="SET NULL"), nullable=True,
    )
    receipt_uploaded_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    # Mahremiyet katmanı: kaydın gizleyici taahhüdü ve özel nonce değeri.
    commitment: Mapped[str] = mapped_column(
        String(64), nullable=False, comment="Kaydın SHA-256 taahhüdü (kimlik/tutar açıklamaz)",
    )
    commitment_nonce: Mapped[str] = mapped_column(
        String(64), nullable=False, comment="Taahhüdün özel nonce değeri; genel API yanıtlarına dahil edilmez",
    )

    created_by: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True,
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=_utcnow, server_default=func.now(), nullable=False,
    )

    transaction: Mapped["Transaction"] = relationship("Transaction", back_populates="credit_sale")
    company: Mapped[Optional["CreditCompany"]] = relationship("CreditCompany", lazy="joined")
    customer: Mapped[Optional["CreditCustomer"]] = relationship("CreditCustomer", lazy="joined")

    @property
    def account_name(self) -> str | None:
        """Hesap sahibinin görünen adı (şirket unvanı veya müşteri adı soyadı)."""
        if self.company is not None:
            return self.company.name
        if self.customer is not None:
            return self.customer.full_name
        return None

    @property
    def has_receipt(self) -> bool:
        return self.receipt_document_id is not None

    def __repr__(self) -> str:
        return f"<CreditSale(id={self.id}, type={self.account_type}, amount={self.amount})>"


class CreditPayment(Base):
    """
    Tahsilat / düzeltme kaydı — cari hesabın ALACAK tarafı.

    `kind = payment`    → tahsilat, tutar > 0, borcu azaltır.
    `kind = adjustment` → düzeltme; pozitif tutar borcu azaltır, negatif artırır.
    Kayıtlar silinmez; hatalı kayıt `voided_at` ile iptal edilir ve bakiyeye girmez.
    Tahsilatlar vardiya kasasına ve K-001 vardiya mutabakatına dahil DEĞİLDİR.
    """

    __tablename__ = "credit_payments"
    __table_args__ = (
        CheckConstraint(
            "(account_type = 'corporate' AND credit_company_id IS NOT NULL AND credit_customer_id IS NULL)"
            " OR (account_type = 'individual' AND credit_customer_id IS NOT NULL AND credit_company_id IS NULL)",
            name="ck_credit_payments_account",
        ),
        CheckConstraint("kind IN ('payment', 'adjustment')", name="ck_credit_payments_kind"),
        CheckConstraint("method IN ('cash', 'credit_card', 'eft', 'other')", name="ck_credit_payments_method"),
        CheckConstraint(
            "(kind = 'payment' AND amount > 0) OR (kind = 'adjustment' AND amount <> 0)",
            name="ck_credit_payments_amount",
        ),
        Index("ix_credit_payments_station_date", "station_id", "payment_date"),
        Index("ix_credit_payments_company_date", "credit_company_id", "payment_date"),
        Index("ix_credit_payments_customer_date", "credit_customer_id", "payment_date"),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=generate_uuid)
    station_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("stations.id", ondelete="RESTRICT"), nullable=False,
    )
    account_type: Mapped[str] = mapped_column(String(20), nullable=False, comment="corporate | individual")
    credit_company_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("credit_companies.id", ondelete="RESTRICT"), nullable=True,
    )
    credit_customer_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("credit_customers.id", ondelete="RESTRICT"), nullable=True,
    )
    kind: Mapped[str] = mapped_column(String(20), default="payment", nullable=False)
    amount: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False, comment="Tutar (TL)")
    method: Mapped[str] = mapped_column(String(20), nullable=False, comment="cash | credit_card | eft | other")
    payment_date: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    reference: Mapped[str | None] = mapped_column(String(100), nullable=True, comment="Dekont / makbuz no")
    note: Mapped[str | None] = mapped_column(String(500), nullable=True)

    recorded_by: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True,
    )
    voided_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    voided_by: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True,
    )
    void_reason: Mapped[str | None] = mapped_column(String(500), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=_utcnow, server_default=func.now(), nullable=False,
    )

    company: Mapped[Optional["CreditCompany"]] = relationship("CreditCompany", lazy="joined")
    customer: Mapped[Optional["CreditCustomer"]] = relationship("CreditCustomer", lazy="joined")

    @property
    def account_name(self) -> str | None:
        if self.company is not None:
            return self.company.name
        if self.customer is not None:
            return self.customer.full_name
        return None

    @property
    def is_void(self) -> bool:
        return self.voided_at is not None

    def __repr__(self) -> str:
        return f"<CreditPayment(id={self.id}, kind={self.kind}, amount={self.amount})>"
