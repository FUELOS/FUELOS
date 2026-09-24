"""
FuelOS — Transaction Pydantic şemaları.
"""

import uuid
from datetime import datetime
from decimal import Decimal

from pydantic import BaseModel, field_validator

from app.models.base import PaymentMethod, TransactionType


class TransactionCreate(BaseModel):
    """Yeni satış/işlem kaydı oluşturma."""
    shift_id: uuid.UUID
    type: TransactionType
    payment_method: PaymentMethod
    amount: Decimal
    liters: Decimal | None = None
    fuel_type: str | None = None
    description: str | None = None
    transaction_time: datetime | None = None  # None ise sunucu zamanı kullanılır

    @field_validator("liters")
    @classmethod
    def validate_liters(cls, v, info):
        """fuel türünde liters zorunlu olmalı."""
        # Not: Bu validator sadece liters'ın negatif olmamasını kontrol eder.
        # fuel türü + liters birlikte kontrolü API katmanında yapılır.
        if v is not None and v < 0:
            raise ValueError("Litre negatif olamaz")
        return v

    @field_validator("amount")
    @classmethod
    def validate_amount(cls, v):
        """Tutar pozitif olmalı."""
        if v <= 0:
            raise ValueError("Tutar sıfırdan büyük olmalıdır")
        return v


class TransactionResponse(BaseModel):
    """İşlem kaydı yanıtı."""
    id: uuid.UUID
    shift_id: uuid.UUID
    station_id: uuid.UUID
    type: TransactionType
    payment_method: PaymentMethod
    amount: Decimal
    liters: Decimal | None = None
    fuel_type: str | None = None
    description: str | None = None
    transaction_time: datetime
    created_at: datetime

    model_config = {"from_attributes": True}


class TransactionSummary(BaseModel):
    """Vardiya/gün bazlı işlem özeti — Dashboard için."""
    total_amount: Decimal = Decimal("0.00")
    total_fuel_liters: Decimal = Decimal("0.00")
    transaction_count: int = 0
    cash_total: Decimal = Decimal("0.00")
    credit_card_total: Decimal = Decimal("0.00")
    eft_total: Decimal = Decimal("0.00")
    veresiye_total: Decimal = Decimal("0.00")
