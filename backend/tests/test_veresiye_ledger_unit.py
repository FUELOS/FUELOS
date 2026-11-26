"""Birim testleri: Veresiye ekstre üretimi, FIFO vade hesabı ve Istanbul dönem gruplaması."""

import uuid
from datetime import date, datetime, timedelta, timezone
from decimal import Decimal

from app.models.base import CollectionMethod, CreditAccountType, CreditEntryKind
from app.services.credit_ledger import (
    LedgerPaymentRecord,
    LedgerSaleRecord,
    build_statement,
    compute_overdue_amount,
)


def test_running_balance_opening_window_and_negative_adjustment():
    acc_id = uuid.uuid4()
    v1 = uuid.uuid4()
    sales = [
        LedgerSaleRecord(
            id=uuid.uuid4(),
            sale_time=datetime(2026, 10, 31, 10, 0, tzinfo=timezone.utc),
            amount=Decimal("1000.00"),
            liters=Decimal("20.000"),
            fuel_type="Motorin",
            vehicle_id=v1,
            plate="06ABC01",
        ),
        LedgerSaleRecord(
            id=uuid.uuid4(),
            sale_time=datetime(2026, 11, 2, 12, 0, tzinfo=timezone.utc),
            amount=Decimal("500.00"),
            liters=Decimal("10.000"),
            fuel_type="Benzin 95",
            vehicle_id=v1,
            plate="06ABC01",
        ),
    ]
    payments = [
        LedgerPaymentRecord(
            id=uuid.uuid4(),
            payment_date=datetime(2026, 10, 31, 15, 0, tzinfo=timezone.utc),
            amount=Decimal("400.00"),
            kind=CreditEntryKind.PAYMENT,
            method=CollectionMethod.CASH,
            note="Ön ödeme",
        ),
        LedgerPaymentRecord(
            id=uuid.uuid4(),
            payment_date=datetime(2026, 11, 3, 9, 0, tzinfo=timezone.utc),
            amount=Decimal("-150.00"),
            kind=CreditEntryKind.ADJUSTMENT,
            method=CollectionMethod.OTHER,
            note="Fatura düzeltme artışı",
        ),
        LedgerPaymentRecord(
            id=uuid.uuid4(),
            payment_date=datetime(2026, 11, 4, 9, 0, tzinfo=timezone.utc),
            amount=Decimal("200.00"),
            kind=CreditEntryKind.PAYMENT,
            method=CollectionMethod.EFT,
            voided_at=datetime(2026, 11, 4, 10, 0, tzinfo=timezone.utc),
        ),
    ]

    stmt = build_statement(
        account_type=CreditAccountType.CORPORATE,
        account_id=acc_id,
        account_name="Test A.Ş.",
        sales=sales,
        payments=payments,
        credit_limit=Decimal("2000.00"),
        payment_term_days=30,
        date_from=date(2026, 11, 1),
        date_to=date(2026, 11, 10),
        now=datetime(2026, 11, 15, 12, 0, tzinfo=timezone.utc),
    )

    assert stmt.opening_balance == Decimal("600.00")
    assert stmt.period_sales == Decimal("500.00")
    assert stmt.period_payments == Decimal("0.00")
    assert stmt.period_adjustments == Decimal("-150.00")
    assert stmt.closing_balance == Decimal("1250.00")

    assert len(stmt.entries) == 2
    assert stmt.entries[0].entry_type == "sale"
    assert stmt.entries[0].balance_after == Decimal("1100.00")
    assert stmt.entries[1].entry_type == "adjustment"
    assert stmt.entries[1].debit == Decimal("150.00")
    assert stmt.entries[1].credit == Decimal("0.00")
    assert stmt.entries[1].balance_after == Decimal("1250.00")
    assert stmt.balance.balance == Decimal("1250.00")
    assert stmt.balance.credit_limit_remaining == Decimal("750.00")


def test_fifo_overdue_cases():
    base = datetime(2026, 10, 1, 10, 0, tzinfo=timezone.utc)
    sales = [
        LedgerSaleRecord(id=uuid.uuid4(), sale_time=base, amount=Decimal("1000.00")),
        LedgerSaleRecord(id=uuid.uuid4(), sale_time=base + timedelta(days=5), amount=Decimal("600.00")),
        LedgerSaleRecord(id=uuid.uuid4(), sale_time=base + timedelta(days=25), amount=Decimal("500.00")),
    ]
    payments = [
        LedgerPaymentRecord(
            id=uuid.uuid4(),
            payment_date=base + timedelta(days=3),
            amount=Decimal("1200.00"),  # İlk 1000 tamamen öder, 2. satışın 200'ünü kapatır
        ),
        LedgerPaymentRecord(
            id=uuid.uuid4(),
            payment_date=base + timedelta(days=2),
            amount=Decimal("-100.00"),  # Geçmiş tarihli negatif düzeltme borç kalemi olur
            kind=CreditEntryKind.ADJUSTMENT,
            method=CollectionMethod.OTHER,
        ),
        LedgerPaymentRecord(
            id=uuid.uuid4(),
            payment_date=base + timedelta(days=10),
            amount=Decimal("999.00"),
            voided_at=base + timedelta(days=11),  # İptal edilmiş -> yok sayılır
        ),
    ]

    # Vade 10 gün, referans zaman = base + 20 gün:
    # Sıralı borçlar: base(1000), base+2(-100 -> 100), base+5(600), base+25(500)
    # 1200 alacak mahsup: 1000 kapanır, 100 kapanır, base+5'ten 100 ödenir -> 500 kalır
    # base+5 + 10 gün = base+15 < base+20 => 500 vadesi geçmiş; base+25 henüz vadesi gelmemiş
    overdue = compute_overdue_amount(
        sales,
        payments,
        payment_term_days=10,
        now=base + timedelta(days=20),
    )
    assert overdue == Decimal("500.00")
    assert compute_overdue_amount(sales, payments, payment_term_days=None) is None


def test_istanbul_day_boundary_and_vehicle_breakdown():
    acc_id = uuid.uuid4()
    # 21:30 UTC == 00:30 Europe/Istanbul (ertesi gün!)
    sales = [
        LedgerSaleRecord(
            id=uuid.uuid4(),
            sale_time=datetime(2026, 11, 10, 21, 30, tzinfo=timezone.utc),
            amount=Decimal("300.00"),
            liters=Decimal("10.000"),
            plate="06XYZ99",
        ),
        LedgerSaleRecord(
            id=uuid.uuid4(),
            sale_time=datetime(2026, 11, 10, 20, 30, tzinfo=timezone.utc),
            amount=Decimal("700.00"),
            liters=Decimal("20.000"),
            plate="34AAA11",
        ),
        LedgerSaleRecord(
            id=uuid.uuid4(),
            sale_time=datetime(2026, 11, 11, 10, 0, tzinfo=timezone.utc),
            amount=Decimal("200.00"),
            liters=Decimal("5.000"),
            plate=None,
        ),
    ]

    stmt = build_statement(
        account_type=CreditAccountType.CORPORATE,
        account_id=acc_id,
        account_name="İstanbul Sınır Testi",
        sales=sales,
        payments=[],
    )

    assert [(d.period, d.amount) for d in stmt.daily_spending] == [
        ("2026-11-10", Decimal("700.00")),
        ("2026-11-11", Decimal("500.00")),
    ]
    assert [(m.period, m.sale_count) for m in stmt.monthly_spending] == [("2026-11", 3)]

    assert [v.plate for v in stmt.vehicle_breakdown] == ["34AAA11", "06XYZ99", "Plakasız"]
    assert stmt.vehicle_breakdown[0].amount == Decimal("700.00")
