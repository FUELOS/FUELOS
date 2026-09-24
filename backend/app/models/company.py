"""
FuelOS — Company (Şirket) modeli.
Bir FuelOS müşterisi — bir veya birden fazla istasyona sahip akaryakıt işletmesi.
"""

import uuid
from typing import TYPE_CHECKING, List

from sqlalchemy import Boolean, String
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base
from app.models.base import TimestampMixin, generate_uuid

if TYPE_CHECKING:
    from app.models.station import Station
    from app.models.user import User


class Company(TimestampMixin, Base):
    __tablename__ = "companies"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        default=generate_uuid,
    )
    name: Mapped[str] = mapped_column(
        String(255),
        nullable=False,
        comment="Şirket adı",
    )
    tax_number: Mapped[str] = mapped_column(
        String(20),
        unique=True,
        nullable=False,
        comment="Vergi numarası (benzersiz)",
    )
    address: Mapped[str | None] = mapped_column(
        String(500),
        nullable=True,
        comment="Genel merkez adresi",
    )
    phone: Mapped[str | None] = mapped_column(
        String(20),
        nullable=True,
        comment="İletişim telefonu",
    )
    is_active: Mapped[bool] = mapped_column(
        Boolean,
        default=True,
        nullable=False,
        comment="Aktif/pasif durumu",
    )

    # ── İlişkiler ──
    stations: Mapped[List["Station"]] = relationship(
        "Station",
        back_populates="company",
        lazy="selectin",
    )
    users: Mapped[List["User"]] = relationship(
        "User",
        back_populates="company",
        lazy="selectin",
    )

    def __repr__(self) -> str:
        return f"<Company(id={self.id}, name='{self.name}')>"
