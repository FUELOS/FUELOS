"""
FuelOS — User (Kullanıcı) modeli.
Sisteme giriş yapabilen kişiler: SuperAdmin, StationManager, Cashier.
"""

import uuid
from typing import TYPE_CHECKING, List

from sqlalchemy import Boolean, Enum as SAEnum, ForeignKey, String
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base
from app.models.base import TimestampMixin, UserRole, generate_uuid

if TYPE_CHECKING:
    from app.models.company import Company
    from app.models.shift import Shift
    from app.models.station import Station


class User(TimestampMixin, Base):
    __tablename__ = "users"

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
    station_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("stations.id", ondelete="RESTRICT"),
        nullable=True,
        comment="Bağlı olduğu istasyon (SuperAdmin için NULL)",
    )
    email: Mapped[str] = mapped_column(
        String(255),
        unique=True,
        nullable=False,
        index=True,
        comment="E-posta (giriş için kullanılır)",
    )
    hashed_password: Mapped[str] = mapped_column(
        String(255),
        nullable=False,
        comment="bcrypt ile hashlenmiş şifre",
    )
    full_name: Mapped[str] = mapped_column(
        String(255),
        nullable=False,
        comment="Ad Soyad",
    )
    role: Mapped[UserRole] = mapped_column(
        SAEnum(UserRole, name="user_role", values_callable=lambda x: [e.value for e in x], create_constraint=True),
        nullable=False,
        comment="Kullanıcı rolü (RBAC)",
    )
    is_active: Mapped[bool] = mapped_column(
        Boolean,
        default=True,
        nullable=False,
        comment="Hesap aktif/pasif durumu",
    )

    # ── İlişkiler ──
    company: Mapped["Company"] = relationship(
        "Company",
        back_populates="users",
    )
    station: Mapped["Station | None"] = relationship(
        "Station",
        back_populates="users",
    )
    shifts: Mapped[List["Shift"]] = relationship(
        "Shift",
        back_populates="user",
        lazy="selectin",
    )

    def __repr__(self) -> str:
        return f"<User(id={self.id}, email='{self.email}', role={self.role.value})>"
