"""
FuelOS — Pump (Pompa) modeli.
Bir istasyondaki fiziksel yakıt pompası.
"""
import uuid
from typing import TYPE_CHECKING, List
from sqlalchemy import Boolean, ForeignKey, Integer, String
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.database import Base
from app.models.base import TimestampMixin, generate_uuid

if TYPE_CHECKING:
    from app.models.station import Station
    from app.models.shift import Shift


class Pump(TimestampMixin, Base):
    __tablename__ = "pumps"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=generate_uuid)
    station_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("stations.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    pump_number: Mapped[int] = mapped_column(Integer, nullable=False, comment="Pompa numarası (1, 2, 3...)")
    label: Mapped[str] = mapped_column(String(100), nullable=False, comment="Etiket örn: Pompa 1")
    fuel_types: Mapped[str] = mapped_column(
        String(200),
        nullable=False,
        default="Motorin,Benzin",
        comment="Desteklenen yakıt türleri, virgülle ayrılmış",
    )
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)

    # ── İlişkiler ──
    station: Mapped["Station"] = relationship("Station", back_populates="pumps")
    shifts: Mapped[List["Shift"]] = relationship("Shift", back_populates="pump", lazy="selectin")

    def __repr__(self) -> str:
        return f"<Pump(id={self.id}, label='{self.label}', station={self.station_id})>"
