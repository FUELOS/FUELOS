"""
FuelOS — Company Pydantic şemaları.
"""

import uuid
from datetime import datetime

from pydantic import BaseModel


class CompanyCreate(BaseModel):
    """Yeni şirket oluşturma."""
    name: str
    tax_number: str
    address: str | None = None
    phone: str | None = None


class CompanyUpdate(BaseModel):
    """Şirket güncelleme (tüm alanlar opsiyonel)."""
    name: str | None = None
    tax_number: str | None = None
    address: str | None = None
    phone: str | None = None
    is_active: bool | None = None


class CompanyResponse(BaseModel):
    """Şirket bilgisi yanıtı."""
    id: uuid.UUID
    name: str
    tax_number: str
    address: str | None = None
    phone: str | None = None
    is_active: bool
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}
