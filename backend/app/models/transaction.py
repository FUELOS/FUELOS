"""
FuelOS — Transaction (Satış / İşlem Kaydı) modeli.
Bir vardiya süresince gerçekleşen her satış veya tahsilat kaydı.
"""

import uuid
from datetime import datetime, timezone

from sqlalchemy import (
    DateTime,
    Enum as SAEnum,
    ForeignKey,
    Numeric,
    String,
    func,
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base
from app.models.base import (
    PaymentMethod,
    TransactionType,
    generate_uuid,
)

from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from app.models.shift import Shift
    from app.models.station import Station


class Transaction(Base):
    """
    Transaction'lar değiştirilemez (immutable) kayıtlardır.
    Bu nedenle updated_at alanı yoktur — TimestampMixin kullanılmaz.
    Yalnızca created_at tutulur.
    """
    __tablename__ = "transactions"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        default=generate_uuid,
    )
    shift_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("shifts.id", ondelete="RESTRICT"),
        nullable=False,
        index=True,
        comment="Hangi vardiyada",
    )
    station_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("stations.id", ondelete="RESTRICT"),
        nullable=False,
        index=True,
        comment="Hangi istasyonda (denormalize — hızlı sorgulama)",
    )
    type: Mapped[TransactionType] = mapped_column(
        SAEnum(TransactionType, name="transaction_type", values_callable=lambda x: [e.value for e in x], create_constraint=True),
        nullable=False,
        comment="İşlem türü (fuel, market, other)",
    )
    payment_method: Mapped[PaymentMethod] = mapped_column(
        SAEnum(PaymentMethod, name="payment_method", values_callable=lambda x: [e.value for e in x], create_constraint=True),
        nullable=False,
        comment="Ödeme yöntemi",
    )
    amount: Mapped[float] = mapped_column(
        Numeric(12, 2),
        nullable=False,
        comment="Tutar (TL)",
    )
    liters: Mapped[float | None] = mapped_column(
        Numeric(10, 3),
        nullable=True,
        comment="Satılan litre (sadece fuel türünde)",
    )
    fuel_type: Mapped[str | None] = mapped_column(
        String(50),
        nullable=True,
        comment="Yakıt türü (serbest metin — örn: Motorin, Benzin 95)",
    )
    description: Mapped[str | None] = mapped_column(
        String(500),
        nullable=True,
        comment="Açıklama",
    )
    transaction_time: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        comment="İşlem zamanı",
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        server_default=func.now(),
        nullable=False,
    )

    # ── İlişkiler ──
    shift: Mapped["Shift"] = relationship(
        "Shift",
        back_populates="transactions",
    )
    station: Mapped["Station"] = relationship(
        "Station",
        back_populates="transactions",
    )

    def __repr__(self) -> str:
        return (
            f"<Transaction(id={self.id}, type={self.type.value}, "
            f"amount={self.amount}, method={self.payment_method.value})>"
        )
