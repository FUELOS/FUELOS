"""
FuelOS — Model registry.
Tüm modelleri tek noktadan dışa aktarır.
Alembic ve diğer modüller bu dosyayı import ederek tüm tablolara erişir.
"""

from app.models.base import (
    PaymentMethod,
    ShiftStatus,
    TransactionType,
    UserRole,
)
from app.models.company import Company
from app.models.station import Station
from app.models.user import User
from app.models.shift import Shift
from app.models.transaction import Transaction

__all__ = [
    # Modeller
    "Company",
    "Station",
    "User",
    "Shift",
    "Transaction",
    # Enum'lar
    "UserRole",
    "ShiftStatus",
    "TransactionType",
    "PaymentMethod",
]
