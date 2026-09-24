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

    model_config = {"from_attributes": True}
