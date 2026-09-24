"""
FuelOS — Shift Pydantic şemaları.
"""

import uuid
from datetime import datetime
from decimal import Decimal

from pydantic import BaseModel

from app.models.base import ShiftStatus


class ShiftOpen(BaseModel):
    """Vardiya açma isteği."""
    station_id: uuid.UUID
    user_id: uuid.UUID | None = None  # SuperAdmin / Müdür başka personel adına açabilir
    opening_cash: Decimal = Decimal("0.00")
    notes: str | None = None


class ShiftClose(BaseModel):
    """Vardiya kapama isteği."""
    closing_cash: Decimal
    notes: str | None = None


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

    model_config = {"from_attributes": True}
