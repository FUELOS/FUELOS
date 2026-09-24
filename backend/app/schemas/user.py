"""
FuelOS — User Pydantic şemaları.
User CRUD operasyonları için request/response modelleri.
"""

import uuid
from datetime import datetime

from pydantic import BaseModel

from app.models.base import UserRole


# ─── Response ───

class UserResponse(BaseModel):
    """Kullanıcı bilgisi yanıtı (şifre hariç)."""
    id: uuid.UUID
    company_id: uuid.UUID
    station_id: uuid.UUID | None = None
    email: str
    full_name: str
    role: UserRole
    is_active: bool
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


# ─── Request ───

class UserCreate(BaseModel):
    """Yeni kullanıcı oluşturma isteği."""
    email: str
    password: str
    full_name: str
    role: UserRole
    station_id: uuid.UUID | None = None


class UserUpdate(BaseModel):
    """Kullanıcı güncelleme isteği (tüm alanlar opsiyonel)."""
    email: str | None = None
    full_name: str | None = None
    role: UserRole | None = None
    station_id: uuid.UUID | None = None
    is_active: bool | None = None
    password: str | None = None
