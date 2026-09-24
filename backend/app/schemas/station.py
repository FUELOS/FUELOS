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
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}
