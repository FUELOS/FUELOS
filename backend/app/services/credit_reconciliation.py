"""
FuelOS — Günlük Mutabakat (Nakit, POS, EFT, Kurumsal ve Bireysel Veresiye) servisi.

Saf sınıflandırma fonksiyonları veritabanı oturumundan bağımsızdır ve doğrudan
birim testlerle doğrulanabilir; `build_daily_reconciliation` ise az sayıda toplu
sorgu ile günün tüm hareketlerini okuyup saf motoru besler.
"""

from __future__ import annotations

import uuid
from dataclasses import dataclass
from datetime import date, datetime, time, timedelta, timezone
from decimal import Decimal
from typing import Sequence
from zoneinfo import ZoneInfo

from sqlalchemy import and_, case, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.base import (
    CreditAccountType,
    CreditEntryKind,
    CollectionMethod,
    PaymentMethod,
    ShiftStatus,
)
from app.models.credit import (
    CreditCompany,
    CreditCustomer,
    CreditPayment,
    CreditSale,
)
from app.models.shift import Shift
from app.models.station import Station
from app.models.transaction import Transaction
from app.models.user import User
from app.schemas.credit import (
    ChannelTotal,
    CollectionTotal,
    DailyReconciliation,
    ReconciliationIssue,
    SalesChannel,
    ShiftCreditCheck,
)
from app.services import credit_access
from app.services.reconciliation import DEFAULT_TOLERANCE

ISTANBUL_TZ = ZoneInfo("Europe/Istanbul")
ZERO = Decimal("0.00")
KURUS = Decimal("0.01")
LITERS_ZERO = Decimal("0.000")
LITERS_Q = Decimal("0.001")

CHANNEL_ORDER: tuple[SalesChannel, ...] = (
    "cash",
    "credit_card",
    "eft",
    "corporate_veresiye",
    "individual_veresiye",
    "unlinked_veresiye",
)
COLLECTION_METHOD_ORDER: tuple[CollectionMethod, ...] = (
    CollectionMethod.CASH,
    CollectionMethod.CREDIT_CARD,
    CollectionMethod.EFT,
    CollectionMethod.OTHER,
)


@dataclass(frozen=True)
class ReconTxRow:
    id: uuid.UUID
    shift_id: uuid.UUID
    station_id: uuid.UUID
    payment_method: PaymentMethod
    amount: Decimal
    liters: Decimal | None
    transaction_time: datetime


@dataclass(frozen=True)
class ReconCreditSaleRow:
    id: uuid.UUID
    transaction_id: uuid.UUID
    shift_id: uuid.UUID
    station_id: uuid.UUID
    account_type: CreditAccountType
    account_name: str | None
    customer_id: uuid.UUID | None
    customer_has_id_photo: bool
    amount: Decimal
    identity_verified: bool
    has_receipt: bool
    sale_time: datetime


@dataclass(frozen=True)
class ReconShiftRow:
    id: uuid.UUID
    worker_name: str | None
    status: ShiftStatus
    start_time: datetime
    end_time: datetime | None
    declared_credit: Decimal | None
    tolerance: Decimal = DEFAULT_TOLERANCE
    shift_recorded_credit: Decimal | None = None
    shift_ledger_credit: Decimal | None = None
    shift_corporate_credit: Decimal | None = None
    shift_individual_credit: Decimal | None = None
    shift_unlinked_credit: Decimal | None = None
    shift_sale_count: int | None = None
    shift_missing_receipt_count: int | None = None


@dataclass(frozen=True)
class ReconPaymentRow:
    id: uuid.UUID
    method: CollectionMethod
    amount: Decimal


def istanbul_day_range(target_date: date | None = None) -> tuple[date, datetime, datetime]:
    """
    Türkiye (Europe/Istanbul) gününü çözümler ve yarı-açık UTC sınırlarını
    [start_utc, end_utc) olarak döndürür.
    """
    resolved = target_date or datetime.now(ISTANBUL_TZ).date()
    start_utc = datetime.combine(resolved, time.min, tzinfo=ISTANBUL_TZ).astimezone(timezone.utc)
    end_utc = datetime.combine(resolved + timedelta(days=1), time.min, tzinfo=ISTANBUL_TZ).astimezone(timezone.utc)
    return resolved, start_utc, end_utc


def _q2(val: Decimal | int | float | str | None) -> Decimal:
    return Decimal(str(val or 0)).quantize(KURUS)


def _q3(val: Decimal | int | float | str | None) -> Decimal:
    return Decimal(str(val or 0)).quantize(LITERS_Q)


def classify_daily_reconciliation(
    *,
    target_date: date,
    station_id: uuid.UUID | None,
    station_name: str,
    transactions: Sequence[ReconTxRow],
    credit_sales: Sequence[ReconCreditSaleRow],
    orphan_credit_sales: Sequence[ReconCreditSaleRow] = (),
    shifts: Sequence[ReconShiftRow] = (),
    collections: Sequence[ReconPaymentRow] = (),
) -> DailyReconciliation:
    """
    Gün içi işlemleri, cari defter kayıtlarını, vardiyaları ve tahsilatları
    saf bellek içi veri yapıları üzerinden sınıflandırarak `DailyReconciliation` üretir.
    """
    channel_acc: dict[SalesChannel, dict[str, Decimal | int]] = {
        ch: {"amount": ZERO, "count": 0, "liters": LITERS_ZERO}
        for ch in CHANNEL_ORDER
    }

    tx_by_id: dict[uuid.UUID, ReconTxRow] = {tx.id: tx for tx in transactions}
    sale_by_tx_id: dict[uuid.UUID, ReconCreditSaleRow] = {}
    for cs in credit_sales:
        sale_by_tx_id[cs.transaction_id] = cs

    total_sales = ZERO
    total_liters = LITERS_ZERO
    tx_count = len(transactions)

    automation_veresiye_total = ZERO
    ledger_veresiye_total = ZERO
    corporate_veresiye_total = ZERO
    individual_veresiye_total = ZERO
    unlinked_veresiye_total = ZERO
    missing_receipt_count = 0

    issues: list[ReconciliationIssue] = []
    missing_id_seen: set[uuid.UUID] = set()

    # İşlemleri kanallara dağıt
    for tx in transactions:
        amt = _q2(tx.amount)
        ltr = _q3(tx.liters) if tx.liters is not None else LITERS_ZERO
        total_sales = (total_sales + amt).quantize(KURUS)
        total_liters = (total_liters + ltr).quantize(LITERS_Q)

        if tx.payment_method == PaymentMethod.CASH:
            ch: SalesChannel = "cash"
        elif tx.payment_method == PaymentMethod.CREDIT_CARD:
            ch = "credit_card"
        elif tx.payment_method == PaymentMethod.EFT:
            ch = "eft"
        else:
            automation_veresiye_total = (automation_veresiye_total + amt).quantize(KURUS)
            cs = sale_by_tx_id.get(tx.id)
            if cs is None:
                ch = "unlinked_veresiye"
                unlinked_veresiye_total = (unlinked_veresiye_total + amt).quantize(KURUS)
                issues.append(
                    ReconciliationIssue(
                        code="unlinked_veresiye",
                        severity="error",
                        message=f"Cari hesaba bağlanmamış veresiye satış ({amt} TL)",
                        transaction_id=tx.id,
                        shift_id=tx.shift_id,
                        amount=amt,
                        occurred_at=tx.transaction_time,
                    )
                )
            elif cs.account_type == CreditAccountType.CORPORATE:
                ch = "corporate_veresiye"
                corporate_veresiye_total = (corporate_veresiye_total + amt).quantize(KURUS)
            else:
                ch = "individual_veresiye"
                individual_veresiye_total = (individual_veresiye_total + amt).quantize(KURUS)

        bucket = channel_acc[ch]
        bucket["amount"] = (bucket["amount"] + amt).quantize(KURUS)  # type: ignore[operator]
        bucket["count"] = int(bucket["count"]) + 1
        bucket["liters"] = (bucket["liters"] + ltr).quantize(LITERS_Q)  # type: ignore[operator]

    # Günün işlemlerine bağlı veya güne düşen CreditSale kayıtlarını denetle
    day_credit_sales_seen: set[uuid.UUID] = set()
    for cs in credit_sales:
        day_credit_sales_seen.add(cs.id)
        cs_amt = _q2(cs.amount)
        linked_tx = tx_by_id.get(cs.transaction_id)

        if cs.transaction_id in tx_by_id:
            ledger_veresiye_total = (ledger_veresiye_total + cs_amt).quantize(KURUS)

        if linked_tx is not None and linked_tx.payment_method != PaymentMethod.VERESIYE:
            issues.append(
                ReconciliationIssue(
                    code="orphan_ledger_entry",
                    severity="error",
                    message="Cari defter kaydı veresiye olmayan bir satış işlemine bağlı",
                    transaction_id=linked_tx.id,
                    credit_sale_id=cs.id,
                    shift_id=cs.shift_id,
                    account_name=cs.account_name,
                    amount=cs_amt,
                    occurred_at=cs.sale_time,
                )
            )
        elif linked_tx is not None and cs_amt != _q2(linked_tx.amount):
            issues.append(
                ReconciliationIssue(
                    code="amount_mismatch",
                    severity="error",
                    message=f"Satış ({_q2(linked_tx.amount)} TL) ile cari defter ({cs_amt} TL) tutarı uyuşmuyor",
                    transaction_id=linked_tx.id,
                    credit_sale_id=cs.id,
                    shift_id=cs.shift_id,
                    account_name=cs.account_name,
                    amount=cs_amt,
                    occurred_at=cs.sale_time,
                )
            )

        if not cs.has_receipt:
            missing_receipt_count += 1
            issues.append(
                ReconciliationIssue(
                    code="missing_receipt",
                    severity="warning",
                    message="İmzalı satış fişi henüz yüklenmemiş",
                    transaction_id=cs.transaction_id,
                    credit_sale_id=cs.id,
                    shift_id=cs.shift_id,
                    account_name=cs.account_name,
                    amount=cs_amt,
                    occurred_at=cs.sale_time,
                )
            )

        if not cs.identity_verified:
            issues.append(
                ReconciliationIssue(
                    code="identity_unverified",
                    severity="warning",
                    message="Satış anında T.C. kimlik doğrulaması yapılmadı",
                    transaction_id=cs.transaction_id,
                    credit_sale_id=cs.id,
                    shift_id=cs.shift_id,
                    account_name=cs.account_name,
                    amount=cs_amt,
                    occurred_at=cs.sale_time,
                )
            )

        if (
            cs.account_type == CreditAccountType.INDIVIDUAL
            and cs.customer_id is not None
            and not cs.customer_has_id_photo
            and cs.customer_id not in missing_id_seen
        ):
            missing_id_seen.add(cs.customer_id)
            issues.append(
                ReconciliationIssue(
                    code="missing_id_photo",
                    severity="warning",
                    message="Bireysel müşterinin kimlik fotoğrafı sisteme yüklenmemiş",
                    transaction_id=cs.transaction_id,
                    credit_sale_id=cs.id,
                    shift_id=cs.shift_id,
                    account_name=cs.account_name,
                    amount=None,
                    occurred_at=cs.sale_time,
                )
            )

    for orphan in orphan_credit_sales:
        if orphan.id in day_credit_sales_seen:
            continue
        o_amt = _q2(orphan.amount)
        issues.append(
            ReconciliationIssue(
                code="orphan_ledger_entry",
                severity="error",
                message="Cari defter kaydının bağlı olduğu satış veresiye değil",
                transaction_id=orphan.transaction_id,
                credit_sale_id=orphan.id,
                shift_id=orphan.shift_id,
                account_name=orphan.account_name,
                amount=o_amt,
                occurred_at=orphan.sale_time,
            )
        )

    # Vardiya kontrolleri
    shift_checks: list[ShiftCreditCheck] = []
    for sh in sorted(shifts, key=lambda item: item.start_time):
        if sh.shift_recorded_credit is not None:
            rec_cred = _q2(sh.shift_recorded_credit)
            led_cred = _q2(sh.shift_ledger_credit)
            corp_cred = _q2(sh.shift_corporate_credit)
            ind_cred = _q2(sh.shift_individual_credit)
            unl_cred = _q2(sh.shift_unlinked_credit)
            s_count = int(sh.shift_sale_count or 0)
            m_count = int(sh.shift_missing_receipt_count or 0)
        else:
            rec_cred = ZERO
            led_cred = ZERO
            corp_cred = ZERO
            ind_cred = ZERO
            unl_cred = ZERO
            s_count = 0
            m_count = 0
            for tx in transactions:
                if tx.shift_id != sh.id or tx.payment_method != PaymentMethod.VERESIYE:
                    continue
                t_amt = _q2(tx.amount)
                rec_cred = (rec_cred + t_amt).quantize(KURUS)
                cs = sale_by_tx_id.get(tx.id)
                if cs is None:
                    unl_cred = (unl_cred + t_amt).quantize(KURUS)
                else:
                    s_count += 1
                    led_cred = (led_cred + _q2(cs.amount)).quantize(KURUS)
                    if cs.account_type == CreditAccountType.CORPORATE:
                        corp_cred = (corp_cred + _q2(cs.amount)).quantize(KURUS)
                    else:
                        ind_cred = (ind_cred + _q2(cs.amount)).quantize(KURUS)
                    if not cs.has_receipt:
                        m_count += 1

        decl_diff = None
        if sh.declared_credit is not None:
            decl_val = _q2(sh.declared_credit)
            decl_diff = (rec_cred - decl_val).quantize(KURUS)
            if sh.status == ShiftStatus.CLOSED and abs(decl_diff) > _q2(sh.tolerance):
                issues.append(
                    ReconciliationIssue(
                        code="declared_credit_mismatch",
                        severity="warning",
                        message=f"Vardiya kapanışında beyan edilen veresiye ({decl_val} TL) ile kayıtlı veresiye ({rec_cred} TL) arasında fark var",
                        shift_id=sh.id,
                        account_name=sh.worker_name,
                        amount=abs(decl_diff),
                        occurred_at=sh.end_time or sh.start_time,
                    )
                )

        shift_checks.append(
            ShiftCreditCheck(
                shift_id=sh.id,
                worker_name=sh.worker_name,
                shift_status=sh.status.value if isinstance(sh.status, ShiftStatus) else str(sh.status),
                start_time=sh.start_time,
                end_time=sh.end_time,
                recorded_credit=rec_cred,
                ledger_credit=led_cred,
                corporate_credit=corp_cred,
                individual_credit=ind_cred,
                unlinked_credit=unl_cred,
                declared_credit=_q2(sh.declared_credit) if sh.declared_credit is not None else None,
                declared_difference=decl_diff,
                sale_count=s_count,
                missing_receipt_count=m_count,
            )
        )

    # Tahsilatlar (bilgi amaçlı)
    coll_map: dict[CollectionMethod, dict[str, Decimal | int]] = {}
    collections_total = ZERO
    for pay in collections:
        p_amt = _q2(pay.amount)
        collections_total = (collections_total + p_amt).quantize(KURUS)
        bucket = coll_map.setdefault(pay.method, {"amount": ZERO, "count": 0})
        bucket["amount"] = (bucket["amount"] + p_amt).quantize(KURUS)  # type: ignore[operator]
        bucket["count"] = int(bucket["count"]) + 1

    collection_rows = [
        CollectionTotal(
            method=method,
            amount=coll_map[method]["amount"],  # type: ignore[arg-type]
            count=int(coll_map[method]["count"]),
        )
        for method in COLLECTION_METHOD_ORDER
        if method in coll_map
    ]

    # Sorunları sırala: önce error'lar, sonra zamana göre
    epoch_min = datetime.min.replace(tzinfo=timezone.utc)
    issues.sort(key=lambda item: (0 if item.severity == "error" else 1, item.occurred_at or epoch_min, item.code))

    if any(i.severity == "error" for i in issues):
        recon_status = "mismatch"
    elif issues:
        recon_status = "attention"
    else:
        recon_status = "matched"

    return DailyReconciliation(
        date=target_date,
        station_id=station_id,
        station_name=station_name,
        channels=[
            ChannelTotal(
                channel=ch,
                amount=channel_acc[ch]["amount"],  # type: ignore[arg-type]
                count=int(channel_acc[ch]["count"]),
                liters=channel_acc[ch]["liters"],  # type: ignore[arg-type]
            )
            for ch in CHANNEL_ORDER
        ],
        total_sales=total_sales,
        total_liters=total_liters,
        transaction_count=tx_count,
        automation_veresiye_total=automation_veresiye_total,
        ledger_veresiye_total=ledger_veresiye_total,
        veresiye_difference=(automation_veresiye_total - ledger_veresiye_total).quantize(KURUS),
        corporate_veresiye_total=corporate_veresiye_total,
        individual_veresiye_total=individual_veresiye_total,
        unlinked_veresiye_total=unlinked_veresiye_total,
        missing_receipt_count=missing_receipt_count,
        collections=collection_rows,
        collections_total=collections_total,
        shifts=shift_checks,
        issues=issues,
        status=recon_status,
    )


async def build_daily_reconciliation(
    db: AsyncSession,
    *,
    user: User,
    target_date: date | None = None,
    station_id: uuid.UUID | None = None,
) -> DailyReconciliation:
    """Kapsamdaki istasyon(lar) için seçili günün tam kanal + veresiye mutabakatını oluşturur."""
    resolved_date, start_utc, end_utc = istanbul_day_range(target_date)
    scoped_station = await credit_access.optional_station_filter(db, user, station_id)

    station_name = "Tüm İstasyonlar"
    if scoped_station is not None:
        station_name = (
            await db.scalar(select(Station.name).where(Station.id == scoped_station))
            or "İstasyon"
        )
        station_pred_tx = Transaction.station_id == scoped_station
        station_pred_cs = CreditSale.station_id == scoped_station
        station_pred_pay = CreditPayment.station_id == scoped_station
        station_pred_shift = Shift.station_id == scoped_station
    else:
        acc_stations = credit_access.accessible_station_ids(user)
        station_pred_tx = Transaction.station_id.in_(acc_stations)
        station_pred_cs = CreditSale.station_id.in_(acc_stations)
        station_pred_pay = CreditPayment.station_id.in_(acc_stations)
        station_pred_shift = Shift.station_id.in_(acc_stations)

    # 1. Günün tüm işlemleri
    tx_rows = (
        await db.execute(
            select(Transaction)
            .where(
                station_pred_tx,
                Transaction.transaction_time >= start_utc,
                Transaction.transaction_time < end_utc,
            )
            .order_by(Transaction.transaction_time.asc())
        )
    ).scalars().all()
    tx_ids = [t.id for t in tx_rows]

    # 2. Günün işlemlerine bağlı CreditSale kayıtları + şirket/müşteri bilgisi
    day_credit_sales: list[ReconCreditSaleRow] = []
    if tx_ids:
        cs_res = await db.execute(
            select(
                CreditSale,
                CreditCompany.name.label("company_name"),
                CreditCustomer.full_name.label("customer_name"),
                CreditCustomer.id_photo_document_id.label("customer_id_photo"),
            )
            .outerjoin(CreditCompany, CreditSale.credit_company_id == CreditCompany.id)
            .outerjoin(CreditCustomer, CreditSale.credit_customer_id == CreditCustomer.id)
            .where(CreditSale.transaction_id.in_(tx_ids))
        )
        for cs, comp_name, cust_name, cust_photo in cs_res.all():
            day_credit_sales.append(
                ReconCreditSaleRow(
                    id=cs.id,
                    transaction_id=cs.transaction_id,
                    shift_id=cs.shift_id,
                    station_id=cs.station_id,
                    account_type=cs.account_type,
                    account_name=comp_name or cust_name,
                    customer_id=cs.credit_customer_id,
                    customer_has_id_photo=cust_photo is not None,
                    amount=cs.amount,
                    identity_verified=cs.identity_verified,
                    has_receipt=cs.receipt_document_id is not None,
                    sale_time=cs.sale_time,
                )
            )

    # 3. Yetim cari kayıtlar: bağlı Transaction'ı veresiye olmayan ve sale_time günü kapsayan kayıtlar
    orphan_res = await db.execute(
        select(
            CreditSale,
            CreditCompany.name.label("company_name"),
            CreditCustomer.full_name.label("customer_name"),
        )
        .join(Transaction, CreditSale.transaction_id == Transaction.id)
        .outerjoin(CreditCompany, CreditSale.credit_company_id == CreditCompany.id)
        .outerjoin(CreditCustomer, CreditSale.credit_customer_id == CreditCustomer.id)
        .where(
            station_pred_cs,
            CreditSale.sale_time >= start_utc,
            CreditSale.sale_time < end_utc,
            Transaction.payment_method != PaymentMethod.VERESIYE,
        )
    )
    orphan_rows = [
        ReconCreditSaleRow(
            id=cs.id,
            transaction_id=cs.transaction_id,
            shift_id=cs.shift_id,
            station_id=cs.station_id,
            account_type=cs.account_type,
            account_name=comp_name or cust_name,
            customer_id=cs.credit_customer_id,
            customer_has_id_photo=True,
            amount=cs.amount,
            identity_verified=cs.identity_verified,
            has_receipt=cs.receipt_document_id is not None,
            sale_time=cs.sale_time,
        )
        for cs, comp_name, cust_name in orphan_res.all()
    ]

    # 4. Günün vardiyaları (günde işlemi olanlar + günde kapananlar)
    shift_ids_from_tx = list({t.shift_id for t in tx_rows})
    shift_cond = and_(
        Shift.status == ShiftStatus.CLOSED,
        Shift.end_time >= start_utc,
        Shift.end_time < end_utc,
    )
    if shift_ids_from_tx:
        shift_cond = or_(shift_cond, Shift.id.in_(shift_ids_from_tx))

    shift_res = await db.execute(
        select(Shift, User.full_name.label("user_full_name"))
        .join(User, Shift.user_id == User.id)
        .where(station_pred_shift, shift_cond)
        .order_by(Shift.start_time.asc())
    )
    shift_objs = shift_res.all()
    all_shift_ids = [sh.id for sh, _ in shift_objs]

    # Vardiya başı toplamlar (gece yarısını aşan vardiyalar için tam vardiya doğrulaması)
    shift_agg_map: dict[uuid.UUID, dict[str, Decimal | int]] = {}
    if all_shift_ids:
        agg_res = await db.execute(
            select(
                Transaction.shift_id,
                func.coalesce(
                    func.sum(case((Transaction.payment_method == PaymentMethod.VERESIYE, Transaction.amount), else_=0)),
                    0,
                ).label("recorded_credit"),
                func.coalesce(
                    func.sum(case((Transaction.payment_method == PaymentMethod.VERESIYE, CreditSale.amount), else_=0)),
                    0,
                ).label("ledger_credit"),
                func.coalesce(
                    func.sum(
                        case(
                            (
                                and_(
                                    Transaction.payment_method == PaymentMethod.VERESIYE,
                                    CreditSale.account_type == CreditAccountType.CORPORATE,
                                ),
                                CreditSale.amount,
                            ),
                            else_=0,
                        )
                    ),
                    0,
                ).label("corporate_credit"),
                func.coalesce(
                    func.sum(
                        case(
                            (
                                and_(
                                    Transaction.payment_method == PaymentMethod.VERESIYE,
                                    CreditSale.account_type == CreditAccountType.INDIVIDUAL,
                                ),
                                CreditSale.amount,
                            ),
                            else_=0,
                        )
                    ),
                    0,
                ).label("individual_credit"),
                func.coalesce(
                    func.sum(
                        case(
                            (
                                and_(
                                    Transaction.payment_method == PaymentMethod.VERESIYE,
                                    CreditSale.id.is_(None),
                                ),
                                Transaction.amount,
                            ),
                            else_=0,
                        )
                    ),
                    0,
                ).label("unlinked_credit"),
                func.coalesce(func.count(CreditSale.id), 0).label("sale_count"),
                func.coalesce(
                    func.sum(
                        case(
                            (
                                and_(
                                    CreditSale.id.is_not(None),
                                    CreditSale.receipt_document_id.is_(None),
                                ),
                                1,
                            ),
                            else_=0,
                        )
                    ),
                    0,
                ).label("missing_receipt_count"),
            )
            .outerjoin(CreditSale, CreditSale.transaction_id == Transaction.id)
            .where(Transaction.shift_id.in_(all_shift_ids))
            .group_by(Transaction.shift_id)
        )
        for row in agg_res.all():
            shift_agg_map[row.shift_id] = {
                "recorded_credit": _q2(row.recorded_credit),
                "ledger_credit": _q2(row.ledger_credit),
                "corporate_credit": _q2(row.corporate_credit),
                "individual_credit": _q2(row.individual_credit),
                "unlinked_credit": _q2(row.unlinked_credit),
                "sale_count": int(row.sale_count or 0),
                "missing_receipt_count": int(row.missing_receipt_count or 0),
            }

    recon_shifts: list[ReconShiftRow] = []
    for sh, user_full_name in shift_objs:
        agg = shift_agg_map.get(sh.id, {})
        tol = getattr(sh, "reconciliation_tolerance", None)
        recon_shifts.append(
            ReconShiftRow(
                id=sh.id,
                worker_name=sh.worker_name or user_full_name,
                status=sh.status,
                start_time=sh.start_time,
                end_time=sh.end_time,
                declared_credit=Decimal(str(sh.declared_credit)) if sh.declared_credit is not None else None,
                tolerance=Decimal(str(tol)) if tol is not None else DEFAULT_TOLERANCE,
                shift_recorded_credit=agg.get("recorded_credit", ZERO),  # type: ignore[arg-type]
                shift_ledger_credit=agg.get("ledger_credit", ZERO),  # type: ignore[arg-type]
                shift_corporate_credit=agg.get("corporate_credit", ZERO),  # type: ignore[arg-type]
                shift_individual_credit=agg.get("individual_credit", ZERO),  # type: ignore[arg-type]
                shift_unlinked_credit=agg.get("unlinked_credit", ZERO),  # type: ignore[arg-type]
                shift_sale_count=int(agg.get("sale_count", 0)),
                shift_missing_receipt_count=int(agg.get("missing_receipt_count", 0)),
            )
        )

    # 5. Günün iptal edilmemiş tahsilatları (`kind == 'payment'`)
    pay_rows = (
        await db.execute(
            select(CreditPayment).where(
                station_pred_pay,
                CreditPayment.voided_at.is_(None),
                CreditPayment.kind == CreditEntryKind.PAYMENT,
                CreditPayment.payment_date >= start_utc,
                CreditPayment.payment_date < end_utc,
            )
        )
    ).scalars().all()

    return classify_daily_reconciliation(
        target_date=resolved_date,
        station_id=scoped_station,
        station_name=station_name,
        transactions=[
            ReconTxRow(
                id=t.id,
                shift_id=t.shift_id,
                station_id=t.station_id,
                payment_method=t.payment_method,
                amount=t.amount,
                liters=t.liters,
                transaction_time=t.transaction_time,
            )
            for t in tx_rows
        ],
        credit_sales=day_credit_sales,
        orphan_credit_sales=orphan_rows,
        shifts=recon_shifts,
        collections=[
            ReconPaymentRow(id=p.id, method=p.method, amount=p.amount)
            for p in pay_rows
        ],
    )
