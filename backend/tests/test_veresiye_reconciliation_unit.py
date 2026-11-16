"""Birim testleri: Günlük mutabakat sınıflandırması ve Europe/Istanbul gün sınırları."""

import uuid
from datetime import date, datetime, timezone
from decimal import Decimal

from app.models.base import (
    CollectionMethod,
    CreditAccountType,
    PaymentMethod,
    ShiftStatus,
)
from app.services.credit_reconciliation import (
    CHANNEL_ORDER,
    ReconCreditSaleRow,
    ReconPaymentRow,
    ReconShiftRow,
    ReconTxRow,
    classify_daily_reconciliation,
    istanbul_day_range,
)


def test_istanbul_day_range_utc_boundaries():
    resolved, start_utc, end_utc = istanbul_day_range(date(2026, 11, 15))
    assert resolved == date(2026, 11, 15)
    assert start_utc == datetime(2026, 11, 14, 21, 0, tzinfo=timezone.utc)
    assert end_utc == datetime(2026, 11, 15, 21, 0, tzinfo=timezone.utc)


def test_all_matched_day_and_channel_order():
    st_id = uuid.uuid4()
    sh_id = uuid.uuid4()
    t1, t2, t3 = uuid.uuid4(), uuid.uuid4(), uuid.uuid4()
    base = datetime(2026, 11, 15, 9, 0, tzinfo=timezone.utc)

    txs = [
        ReconTxRow(t1, sh_id, st_id, PaymentMethod.CASH, Decimal("1000.00"), Decimal("20.000"), base),
        ReconTxRow(t2, sh_id, st_id, PaymentMethod.VERESIYE, Decimal("500.00"), Decimal("10.000"), base),
        ReconTxRow(t3, sh_id, st_id, PaymentMethod.EFT, Decimal("300.00"), None, base),
    ]
    cs = [
        ReconCreditSaleRow(
            id=uuid.uuid4(),
            transaction_id=t2,
            shift_id=sh_id,
            station_id=st_id,
            account_type=CreditAccountType.CORPORATE,
            account_name="Alfa Lojistik",
            customer_id=None,
            customer_has_id_photo=True,
            amount=Decimal("500.00"),
            identity_verified=True,
            has_receipt=True,
            sale_time=base,
        )
    ]
    shifts = [
        ReconShiftRow(
            id=sh_id,
            worker_name="Kasiyer 1",
            status=ShiftStatus.CLOSED,
            start_time=base,
            end_time=datetime(2026, 11, 15, 16, 0, tzinfo=timezone.utc),
            declared_credit=Decimal("500.50"),  # Tolere edilebilir (| -0.50 | <= 1.00)
            tolerance=Decimal("1.00"),
        )
    ]
    collections = [
        ReconPaymentRow(uuid.uuid4(), CollectionMethod.EFT, Decimal("750.00")),
    ]

    report = classify_daily_reconciliation(
        target_date=date(2026, 11, 15),
        station_id=st_id,
        station_name="Merkez",
        transactions=txs,
        credit_sales=cs,
        shifts=shifts,
        collections=collections,
    )

    assert [c.channel for c in report.channels] == list(CHANNEL_ORDER)
    assert report.channels[1].amount == Decimal("0.00")  # credit_card sıfırla döner
    assert report.channels[3].amount == Decimal("500.00")
    assert report.total_sales == Decimal("1800.00")
    assert report.veresiye_difference == Decimal("0.00")
    assert report.collections_total == Decimal("750.00")
    assert report.issues == []
    assert report.status == "matched"


def test_issues_classification_dedupe_and_sort_order():
    st_id = uuid.uuid4()
    sh_id = uuid.uuid4()
    cust_id = uuid.uuid4()
    base = datetime(2026, 11, 15, 8, 0, tzinfo=timezone.utc)

    tx_cash_wrong = uuid.uuid4()
    tx_ind_1 = uuid.uuid4()
    tx_ind_2 = uuid.uuid4()
    tx_unlinked = uuid.uuid4()
    tx_mismatch = uuid.uuid4()

    txs = [
        ReconTxRow(tx_ind_1, sh_id, st_id, PaymentMethod.VERESIYE, Decimal("200.00"), Decimal("5.000"), base),
        ReconTxRow(tx_ind_2, sh_id, st_id, PaymentMethod.VERESIYE, Decimal("100.00"), Decimal("2.500"), base.replace(hour=9)),
        ReconTxRow(tx_unlinked, sh_id, st_id, PaymentMethod.VERESIYE, Decimal("400.00"), Decimal("8.000"), base.replace(hour=10)),
        ReconTxRow(tx_mismatch, sh_id, st_id, PaymentMethod.VERESIYE, Decimal("300.00"), Decimal("6.000"), base.replace(hour=11)),
        ReconTxRow(tx_cash_wrong, sh_id, st_id, PaymentMethod.CASH, Decimal("150.00"), Decimal("3.000"), base.replace(hour=12)),
    ]
    credit_sales = [
        ReconCreditSaleRow(
            id=uuid.uuid4(),
            transaction_id=tx_ind_1,
            shift_id=sh_id,
            station_id=st_id,
            account_type=CreditAccountType.INDIVIDUAL,
            account_name="Ayşe",
            customer_id=cust_id,
            customer_has_id_photo=False,
            amount=Decimal("200.00"),
            identity_verified=False,
            has_receipt=False,
            sale_time=base,
        ),
        ReconCreditSaleRow(
            id=uuid.uuid4(),
            transaction_id=tx_ind_2,
            shift_id=sh_id,
            station_id=st_id,
            account_type=CreditAccountType.INDIVIDUAL,
            account_name="Ayşe",
            customer_id=cust_id,
            customer_has_id_photo=False,  # Aynı müşteri -> 1 adet missing_id_photo uyarısı üretmeli
            amount=Decimal("100.00"),
            identity_verified=True,
            has_receipt=True,
            sale_time=base.replace(hour=9),
        ),
        ReconCreditSaleRow(
            id=uuid.uuid4(),
            transaction_id=tx_mismatch,
            shift_id=sh_id,
            station_id=st_id,
            account_type=CreditAccountType.CORPORATE,
            account_name="Beta",
            customer_id=None,
            customer_has_id_photo=True,
            amount=Decimal("250.00"),  # Tutar uyuşmuyor (300 vs 250)
            identity_verified=True,
            has_receipt=True,
            sale_time=base.replace(hour=11),
        ),
        ReconCreditSaleRow(
            id=uuid.uuid4(),
            transaction_id=tx_cash_wrong,  # Nakit işleme bağlı yetim kayıt
            shift_id=sh_id,
            station_id=st_id,
            account_type=CreditAccountType.CORPORATE,
            account_name="Yetim",
            customer_id=None,
            customer_has_id_photo=True,
            amount=Decimal("150.00"),
            identity_verified=True,
            has_receipt=True,
            sale_time=base.replace(hour=12),
        ),
    ]
    shifts = [
        ReconShiftRow(
            id=sh_id,
            worker_name="Ahmet",
            status=ShiftStatus.CLOSED,
            start_time=base,
            end_time=base.replace(hour=15),
            declared_credit=Decimal("900.00"),  # Kayıtlı 1000 vs beyan 900 -> fark 100 > tolerans 5
            tolerance=Decimal("5.00"),
        )
    ]

    report = classify_daily_reconciliation(
        target_date=date(2026, 11, 15),
        station_id=st_id,
        station_name="Merkez",
        transactions=txs,
        credit_sales=credit_sales,
        shifts=shifts,
    )

    assert report.status == "mismatch"
    codes = [i.code for i in report.issues]
    assert codes.count("unlinked_veresiye") == 1
    assert codes.count("amount_mismatch") == 1
    assert codes.count("orphan_ledger_entry") == 1
    assert codes.count("missing_receipt") == 1
    assert codes.count("identity_unverified") == 1
    assert codes.count("missing_id_photo") == 1  # Tekilleştirildi
    assert codes.count("declared_credit_mismatch") == 1

    # Önce tüm error'lar gelmeli, sonra warning'ler
    severities = [i.severity for i in report.issues]
    first_warn = severities.index("warning")
    assert all(s == "error" for s in severities[:first_warn])
    assert all(s == "warning" for s in severities[first_warn:])

    # Yalnızca warning olan günde status == "attention"
    warn_only = classify_daily_reconciliation(
        target_date=date(2026, 11, 15),
        station_id=st_id,
        station_name="Merkez",
        transactions=[txs[0]],
        credit_sales=[credit_sales[0]],
    )
    assert warn_only.status == "attention"
