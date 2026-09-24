"""
FuelOS — Shift (Vardiya) modeli.
Bir istasyondaki bir kasiyerin çalışma periyodu.
Vardiya açılır → satışlar kaydedilir → vardiya kapatılır.
"""

import uuid
from datetime import datetime
from typing import TYPE_CHECKING, List

from sqlalchemy import (
    DateTime,
    Enum as SAEnum,
    ForeignKey,
    Numeric,
    Text,
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base
from app.models.base import ShiftStatus, TimestampMixin, generate_uuid

if TYPE_CHECKING:
    from app.models.station import Station
    from app.models.transaction import Transaction
    from app.models.user import User


class Shift(TimestampMixin, Base):
    __tablename__ = "shifts"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        default=generate_uuid,
    )
    station_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("stations.id", ondelete="RESTRICT"),
        nullable=False,
        index=True,
        comment="Hangi istasyonda",
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="RESTRICT"),
        nullable=False,
        index=True,
        comment="Vardiyayı açan kasiyer/yönetici",
    )
    start_time: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        comment="Vardiya başlangıç zamanı",
    )
    end_time: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
        comment="Vardiya bitiş zamanı (açıkken NULL)",
    )
    status: Mapped[ShiftStatus] = mapped_column(
        SAEnum(ShiftStatus, name="shift_status", values_callable=lambda x: [e.value for e in x], create_constraint=True),
        default=ShiftStatus.OPEN,
        nullable=False,
        comment="Vardiya durumu",
    )
    opening_cash: Mapped[float] = mapped_column(
        Numeric(12, 2),
        nullable=False,
        default=0,
        comment="Vardiya açılışındaki kasa nakit tutarı (TL)",
    )
    closing_cash: Mapped[float | None] = mapped_column(
        Numeric(12, 2),
        nullable=True,
        comment="Vardiya kapanışındaki kasa nakit tutarı (TL)",
    )
    notes: Mapped[str | None] = mapped_column(
        Text,
        nullable=True,
        comment="Vardiya notları",
    )

    # ── İlişkiler ──
    station: Mapped["Station"] = relationship(
        "Station",
        back_populates="shifts",
    )
    user: Mapped["User"] = relationship(
        "User",
        back_populates="shifts",
    )
    transactions: Mapped[List["Transaction"]] = relationship(
        "Transaction",
        back_populates="shift",
        lazy="selectin",
    )

    def __repr__(self) -> str:
        return f"<Shift(id={self.id}, station={self.station_id}, status={self.status.value})>"
