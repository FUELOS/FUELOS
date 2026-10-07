"""A closed shift keeps the reconciliation policy that was effective at close."""

import asyncio
import uuid
from datetime import datetime, timezone
from decimal import Decimal
from types import SimpleNamespace
from unittest.mock import AsyncMock, Mock

from app.api.shifts import _build_shift_response, close_shift
from app.models.base import ShiftStatus, UserRole
from app.schemas.shift import ShiftClose


def _shift():
    now = datetime(2026, 10, 8, tzinfo=timezone.utc)
    return SimpleNamespace(
        id=uuid.uuid4(), station_id=uuid.uuid4(), user_id=uuid.uuid4(),
        start_time=now, end_time=None, created_at=now, updated_at=now,
        planned_end_time=None, worker_name=None, worker_avatar=None,
        pump_id=None, notes=None, status=ShiftStatus.OPEN,
        opening_cash=Decimal("0"), closing_cash=None,
        declared_pos=None, declared_eft=None, declared_credit=None,
        reconciliation_tolerance=None,
    )


def _sales_result():
    row = SimpleNamespace(
        total_sales=Decimal("3.00"), cash_sales=Decimal("0"),
        pos_sales=Decimal("0"), eft_sales=Decimal("0"), credit_sales=Decimal("0"),
    )
    return Mock(one=Mock(return_value=row))


def _close_with_tolerance(tolerance):
    shift = _shift()
    db = SimpleNamespace(
        execute=AsyncMock(side_effect=[Mock(scalar_one_or_none=Mock(return_value=shift)), _sales_result()]),
        scalar=AsyncMock(return_value=tolerance),
        flush=AsyncMock(), refresh=AsyncMock(),
    )
    cashier = SimpleNamespace(id=shift.user_id, role=UserRole.CASHIER)
    response = asyncio.run(close_shift(shift.id, ShiftClose(closing_cash=Decimal("0")), cashier, db))
    return shift, response


def test_close_freezes_company_tolerance():
    shift, response = _close_with_tolerance(Decimal("5.00"))
    assert shift.reconciliation_tolerance == Decimal("5.00")
    assert response.reconciliation.status == "matched"

    db_after_policy_change = SimpleNamespace(
        execute=AsyncMock(return_value=_sales_result()),
        scalar=AsyncMock(side_effect=AssertionError("closed shift must not read current company policy")),
    )
    again = asyncio.run(_build_shift_response(shift, db_after_policy_change))
    assert again.reconciliation.tolerance == Decimal("5.00")
    assert again.reconciliation.status == "matched"
    db_after_policy_change.scalar.assert_not_awaited()


def test_zero_tolerance_is_preserved():
    shift, response = _close_with_tolerance(Decimal("0"))
    assert shift.reconciliation_tolerance == Decimal("0")
    assert response.reconciliation.status == "shortage"
