"""
FuelOS — Station (İstasyon) modeli.
Bir şirkete ait fiziksel akaryakıt istasyonu.
"""

import uuid
from datetime import datetime
from typing import TYPE_CHECKING, List

from sqlalchemy import Boolean, DateTime, ForeignKey, Numeric, String
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base
from app.models.base import TimestampMixin, generate_uuid

if TYPE_CHECKING:
    from app.models.company import Company
    from app.models.pump import Pump
    from app.models.shift import Shift
    from app.models.transaction import Transaction
    from app.models.user import User


class Station(TimestampMixin, Base):
    __tablename__ = "stations"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        default=generate_uuid,
    )
    company_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("companies.id", ondelete="RESTRICT"),
        nullable=False,
        comment="Bağlı olduğu şirket",
    )
    name: Mapped[str] = mapped_column(
        String(255),
        nullable=False,
        comment="İstasyon adı (örn: Ankara Merkez)",
    )
    code: Mapped[str] = mapped_column(
        String(20),
        unique=True,
        nullable=False,
        comment="İstasyon kodu (örn: IST-001)",
    )
    city: Mapped[str] = mapped_column(
        String(100),
        nullable=False,
        comment="Şehir",
    )
    district: Mapped[str | None] = mapped_column(
        String(100),
        nullable=True,
        comment="İlçe",
    )
    address: Mapped[str | None] = mapped_column(
        String(500),
        nullable=True,
        comment="Açık adres",
    )
    is_active: Mapped[bool] = mapped_column(
        Boolean,
        default=True,
        nullable=False,
        comment="Aktif/pasif durumu",
    )
    subscription_status: Mapped[str] = mapped_column(
        String(50),
        default="active",
        nullable=False,
        comment="SaaS lisans abonelik durumu: active, past_due, suspended",
    )
    subscription_plan: Mapped[str] = mapped_column(
        String(50),
        default="Pro SaaS",
        nullable=False,
        comment="Abonelik paketi: Standart, Pro SaaS, Kurumsal",
    )
    subscription_expires_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
        comment="Lisans bitiş tarihi / vade",
    )
    monthly_fee: Mapped[float] = mapped_column(
        Numeric(10, 2),
        default=4990.00,
        nullable=False,
        comment="Aylık lisans bedeli (TL)",
    )

    # ── İlişkiler ──
    company: Mapped["Company"] = relationship(
        "Company",
        back_populates="stations",
    )
    users: Mapped[List["User"]] = relationship(
        "User",
        back_populates="station",
        lazy="selectin",
    )
    shifts: Mapped[List["Shift"]] = relationship(
        "Shift",
        back_populates="station",
        lazy="selectin",
    )
    transactions: Mapped[List["Transaction"]] = relationship(
        "Transaction",
        back_populates="station",
        lazy="selectin",
    )
    pumps: Mapped[List["Pump"]] = relationship(
        "Pump",
        back_populates="station",
        lazy="selectin",
        cascade="all, delete-orphan",
    )

    def __repr__(self) -> str:
        return f"<Station(id={self.id}, code='{self.code}', name='{self.name}')>"
