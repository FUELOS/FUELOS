"""Regressions for the independently reproduced financial audit findings."""

import asyncio
import uuid
from datetime import datetime, timedelta, timezone
from decimal import Decimal
from types import SimpleNamespace
from unittest.mock import AsyncMock, Mock

from app.api.shifts import _build_shift_response
from app.models.base import CreditAccountType, CreditEntryKind, ShiftStatus
from app.services.credit_ledger import LedgerPaymentRecord, LedgerSaleRecord, build_statement
from test_shift_tolerance_snapshot import _shift


def test_declared_pos_shortage_cannot_be_overwritten_by_matching_cash():
    shift = _shift()
    shift.status = ShiftStatus.CLOSED
    shift.closing_cash = Decimal('0')
    shift.declared_pos = Decimal('900')
    row = SimpleNamespace(total_sales=Decimal('1000'), pos_sales=Decimal('1000'),
                          cash_sales=Decimal('0'), eft_sales=Decimal('0'), credit_sales=Decimal('0'))
    db = SimpleNamespace(execute=AsyncMock(return_value=Mock(one=Mock(return_value=row))))
    response = asyncio.run(_build_shift_response(shift, db))
    assert response.reconciliation_status == response.reconciliation.status == 'shortage'


def test_collections_exclude_adjustments_but_balance_includes_both_signs():
    now = datetime.now(timezone.utc)
    stmt = build_statement(
        account_type=CreditAccountType.INDIVIDUAL, account_id=uuid.uuid4(), account_name='Test',
        sales=[LedgerSaleRecord(uuid.uuid4(), now - timedelta(days=2), Decimal('1000'))],
        payments=[LedgerPaymentRecord(uuid.uuid4(), now - timedelta(days=1), Decimal(amount), kind=kind)
                  for amount, kind in [('200', CreditEntryKind.PAYMENT), ('300', CreditEntryKind.ADJUSTMENT),
                                       ('-50', CreditEntryKind.ADJUSTMENT)]], now=now,
    )
    assert stmt.balance.balance == Decimal('550')
    assert stmt.balance.total_payments == Decimal('200')
    assert stmt.balance.total_adjustments == Decimal('250')
    assert stmt.period_payments == Decimal('200')
    assert stmt.period_adjustments == Decimal('250')


def test_future_legacy_payments_do_not_reduce_current_balance_or_overdue():
    now = datetime.now(timezone.utc)
    stmt = build_statement(
        account_type=CreditAccountType.INDIVIDUAL, account_id=uuid.uuid4(), account_name='Test',
        sales=[LedgerSaleRecord(uuid.uuid4(), now - timedelta(days=10), Decimal('500'))],
        payments=[LedgerPaymentRecord(uuid.uuid4(), now + timedelta(hours=12), Decimal('500'))],
        payment_term_days=1, now=now,
    )
    assert stmt.balance.balance == Decimal('500')
    assert stmt.balance.total_payments == Decimal('0')
    assert stmt.balance.overdue_amount == Decimal('500')
    assert len(stmt.entries) == 1
