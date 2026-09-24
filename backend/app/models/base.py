"""
FuelOS — Ortak model bileşenleri.
Tüm modellerin paylaştığı mixin'ler ve enum tanımları burada tutulur.
"""

import enum
import uuid
from datetime import datetime, timezone

from sqlalchemy import DateTime, func
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


# ─────────────────────────── ENUM'LAR ───────────────────────────


class UserRole(str, enum.Enum):
    """Kullanıcı rolleri — RBAC sisteminin temelini oluşturur."""
    SUPER_ADMIN = "super_admin"
    STATION_MANAGER = "station_manager"
    CASHIER = "cashier"


class ShiftStatus(str, enum.Enum):
    """Vardiya durumları."""
    OPEN = "open"
    CLOSED = "closed"


class TransactionType(str, enum.Enum):
    """İşlem/satış türleri."""
    FUEL = "fuel"
    MARKET = "market"
    OTHER = "other"


class PaymentMethod(str, enum.Enum):
    """Ödeme yöntemleri."""
    CASH = "cash"
    CREDIT_CARD = "credit_card"
    EFT = "eft"
    VERESIYE = "veresiye"


# ─────────────────────────── MIXIN'LER ───────────────────────────


class TimestampMixin:
    """
    created_at ve updated_at alanlarını otomatik olarak yönetir.
    Tüm modeller bu mixin'i kullanır.
    """
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        server_default=func.now(),
        nullable=False,
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        server_default=func.now(),
        onupdate=lambda: datetime.now(timezone.utc),
        nullable=False,
    )


def generate_uuid() -> uuid.UUID:
    """Yeni UUID v4 üretir."""
    return uuid.uuid4()
