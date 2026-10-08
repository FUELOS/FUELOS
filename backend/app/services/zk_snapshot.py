"""Versioned, application-level snapshot of the records used for a ZK proof.

The digest detects later drift in FuelOS source records. It is not a circuit
constraint, an independent proof verification, or a public commitment.
"""

from __future__ import annotations

import hashlib
import json
from decimal import Decimal
from typing import Iterable

from app.models.base import PaymentMethod
from app.services.zk_service import to_kurus_int


def reconciliation_snapshot(shift, transactions: Iterable, tolerance: Decimal) -> tuple[dict[str, Decimal], str]:
    """Derive the witness and digest from exactly the same sorted transaction rows."""
    totals = {method.value: 0 for method in PaymentMethod}
    records = []
    for transaction in transactions:
        method = transaction.payment_method
        method_name = method.value if isinstance(method, PaymentMethod) else str(method)
        if method_name not in totals:
            raise ValueError("Unknown transaction payment method")
        amount = to_kurus_int(transaction.amount)
        totals[method_name] += amount
        records.append([str(transaction.id).lower(), method_name, str(amount)])
    records.sort(key=lambda row: row[0])

    opening = to_kurus_int(shift.opening_cash)
    closing = to_kurus_int(shift.closing_cash)
    if closing < opening:
        raise ValueError("Closing cash is below opening cash")
    declarations = {
        "pos": None if shift.declared_pos is None else to_kurus_int(shift.declared_pos),
        "eft": None if shift.declared_eft is None else to_kurus_int(shift.declared_eft),
        "credit": None if shift.declared_credit is None else to_kurus_int(shift.declared_credit),
    }
    payload = {
        "domain": "FUELOS_ZK_SOURCE_SNAPSHOT_V1",
        "shiftId": str(shift.id).lower(),
        "openingCashKurus": str(opening),
        "closingCashKurus": str(closing),
        "declaredKurus": {key: None if value is None else str(value) for key, value in declarations.items()},
        "toleranceKurus": str(to_kurus_int(tolerance)),
        "transactions": records,
    }
    canonical = json.dumps(payload, sort_keys=True, separators=(",", ":"), ensure_ascii=True)
    digest = hashlib.sha256(canonical.encode("ascii")).hexdigest()
    inputs = {
        "total_sales": Decimal(sum(totals.values())) / 100,
        "pos": Decimal(declarations["pos"] if declarations["pos"] is not None else totals[PaymentMethod.CREDIT_CARD.value]) / 100,
        "cash": Decimal(closing - opening) / 100,
        "eft": Decimal(declarations["eft"] if declarations["eft"] is not None else totals[PaymentMethod.EFT.value]) / 100,
        "credit": Decimal(declarations["credit"] if declarations["credit"] is not None else totals[PaymentMethod.VERESIYE.value]) / 100,
    }
    return inputs, digest
