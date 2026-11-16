"""
FuelOS — Model registry.
Tüm modelleri tek noktadan dışa aktarır.
Alembic ve diğer modüller bu dosyayı import ederek tüm tablolara erişir.
"""

from app.models.base import (
    CollectionMethod,
    CreditAccountType,
    CreditDocumentKind,
    CreditEntryKind,
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
from app.models.pump import Pump
from app.models.zk_preview_handoff import ZKPreviewHandoff
from app.models.credit import (
    CreditCompany,
    CreditCustomer,
    CreditDocument,
    CreditDriver,
    CreditPayment,
    CreditSale,
    CreditVehicle,
)

__all__ = [
    # Modeller
    "Company",
    "Station",
    "User",
    "Shift",
    "Transaction",
    "Pump",
    "ZKPreviewHandoff",
    # Veresiye (cari) modelleri
    "CreditCompany",
    "CreditVehicle",
    "CreditDriver",
    "CreditCustomer",
    "CreditDocument",
    "CreditSale",
    "CreditPayment",
    # Enum'lar
    "UserRole",
    "ShiftStatus",
    "TransactionType",
    "PaymentMethod",
    "CreditAccountType",
    "CollectionMethod",
    "CreditEntryKind",
    "CreditDocumentKind",
]
