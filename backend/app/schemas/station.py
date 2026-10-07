"""
FuelOS — Station Pydantic şemaları.
"""

import uuid
from datetime import datetime

from pydantic import BaseModel


class StationCreate(BaseModel):
    """Yeni istasyon oluşturma."""
    name: str
    code: str
    city: str
    district: str | None = None
    address: str | None = None


class StationUpdate(BaseModel):
    """İstasyon güncelleme (tüm alanlar opsiyonel)."""
    name: str | None = None
    code: str | None = None
    city: str | None = None
    district: str | None = None
    address: str | None = None
    is_active: bool | None = None
    subscription_status: str | None = None
    subscription_plan: str | None = None
    subscription_expires_at: datetime | None = None
    monthly_fee: float | None = None


class StationSubscriptionUpdate(BaseModel):
    """SuperAdmin istasyon aboneliği güncelleme şeması."""
    subscription_status: str  # active, past_due, suspended
    subscription_plan: str | None = None
    extend_days: int | None = None  # e.g. 30, 90, 365 gün uzatma
    monthly_fee: float | None = None


class StationResponse(BaseModel):
    """İstasyon bilgisi yanıtı."""
    id: uuid.UUID
    company_id: uuid.UUID
    name: str
    code: str
    city: str
    district: str | None = None
    address: str | None = None
    is_active: bool
    subscription_status: str = "active"
    subscription_plan: str = "Pro SaaS"
    subscription_expires_at: datetime | None = None
    monthly_fee: float = 4990.00
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}
