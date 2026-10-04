"""
FuelOS — Shift Pydantic şemaları.
"""

import uuid
from datetime import datetime
from decimal import Decimal
from typing import Literal

from pydantic import BaseModel, Field

from app.models.base import ShiftStatus


class ShiftOpen(BaseModel):
    """Vardiya açma isteği."""
    station_id: uuid.UUID
    user_id: uuid.UUID | None = None  # SuperAdmin / Müdür başka personel adına açabilir
    opening_cash: Decimal = Decimal("0.00")
    notes: str | None = None
    pump_id: uuid.UUID | None = None  # Bağlı pompa (nullable)
    worker_name: str | None = None    # İşçi adı (serbest metin)
    worker_avatar: str | None = None  # İşçi avatarı — base64 veya avatar kodu
    planned_end_time: datetime | None = None  # Otomatik bitiş saati (opsiyonel)


class ShiftClose(BaseModel):
    """Vardiya kapama isteği.

    Kanal ilanları (DEC-002): kapanışta ilan edilen kanal tutarları.
    Girilmeyen kanal, kayıtlı satışlarla mutabakata katılır (geriye uyumludur).
    """
    closing_cash: Decimal
    notes: str | None = None
    declared_pos: Decimal | None = Field(
        default=None, ge=0, description="POS cihaz raporundan ilan edilen tahsilat (TL)"
    )
    declared_eft: Decimal | None = Field(
        default=None, ge=0, description="EFT dökümünden ilan edilen tahsilat (TL)"
    )
    declared_credit: Decimal | None = Field(
        default=None, ge=0, description="Veresiye fişlerinden ilan edilen tutar (TL)"
    )


class ChannelBreakdown(BaseModel):
    """Tek bir ödeme kanalının mutabakat dökümü (DEC-002).

    difference = kayıtlı − ilan; pozitif = kanalda açık, negatif = fazla.
    """
    channel: str  # 'pos' | 'cash' | 'eft' | 'credit'
    declared: Decimal
    recorded: Decimal
    difference: Decimal


class ReconciliationInfo(BaseModel):
    """K-001 mutabakat motoru sonuç özeti (DEC-002)."""
    status: Literal["matched", "shortage", "surplus"]
    difference: Decimal
    tolerance: Decimal
    channels: list[ChannelBreakdown]


class ShiftResponse(BaseModel):
    """Vardiya bilgisi yanıtı — Akıllı Mutabakat analiz alanlarıyla zenginleştirilmiş."""
    id: uuid.UUID
    station_id: uuid.UUID
    user_id: uuid.UUID
    start_time: datetime
    end_time: datetime | None = None
    status: ShiftStatus
    opening_cash: Decimal
    closing_cash: Decimal | None = None
    notes: str | None = None
    created_at: datetime
    updated_at: datetime

    # ── Akıllı Kasa Mutabakatı Alanları ──
    total_sales: Decimal = Decimal("0.00")
    cash_sales: Decimal = Decimal("0.00")
    expected_cash: Decimal | None = None
    cash_difference: Decimal | None = None
    reconciliation_status: str | None = None  # 'matched' | 'shortage' | 'surplus' | 'open'
    reconciliation: ReconciliationInfo | None = None  # K-001 motor özeti (DEC-002)
    planned_end_time: datetime | None = None
    worker_name: str | None = None
    worker_avatar: str | None = None
    pump_id: uuid.UUID | None = None

    # ── Zero-Knowledge / Midnight Doğrulama Alanları ──
    zk_proof_status: str = "none"  # 'none' | 'proved' | 'verified' | 'failed'
    zk_reconciliation_class: str | None = None
    zk_tolerance: Decimal | None = None
    zk_commitment: str | None = None
    zk_verified: bool = False
    zk_verified_at: datetime | None = None
    zk_proof_hash: str | None = None

    model_config = {"from_attributes": True}


class ZKVerificationResponse(BaseModel):
    """Zero-Knowledge bağımsız doğrulama çıktısı."""
    shift_id: uuid.UUID
    verified: bool
    public_class: str
    tolerance_tl: Decimal
    shift_commitment: str
    proof_hash: str
    verified_at: datetime
    privacy_notice: str = "Tüm finansal tutarlar (ciro, POS, nakit) gizli tutulmuş, yalnızca eşitlik matematiksel olarak Zero-Knowledge kanıtı ile doğrulanmıştır."

