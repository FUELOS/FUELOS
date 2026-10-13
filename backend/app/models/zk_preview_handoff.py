"""One Preview transaction handoff per FuelOS proof snapshot."""

import uuid
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Integer, String
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class ZKPreviewHandoff(Base):
    __tablename__ = "zk_preview_handoffs"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    shift_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("shifts.id", ondelete="RESTRICT"), unique=True, nullable=False,
    )
    proof_hash: Mapped[str] = mapped_column(String(64), nullable=False)
    source_snapshot_hash: Mapped[str] = mapped_column(String(64), nullable=False)
    contract_address: Mapped[str] = mapped_column(String(64), nullable=False)
    verifier_key_sha256: Mapped[str] = mapped_column(String(64), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    pending_tx_id: Mapped[str | None] = mapped_column(String(66), unique=True)
    pending_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    submitted_tx_id: Mapped[str | None] = mapped_column(String(66), unique=True)
    tx_hash: Mapped[str | None] = mapped_column(String(64))
    block_hash: Mapped[str | None] = mapped_column(String(64))
    block_height: Mapped[int | None] = mapped_column(Integer)
    confirmed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
