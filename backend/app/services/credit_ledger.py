"""
FuelOS — Veresiye cari defter hesapları.

Bakiye hiçbir tabloda saklanmaz; her zaman şu formülle hesaplanır:

    bakiye = Σ veresiye satışları − Σ (iptal edilmemiş tahsilat + düzeltme)

Pozitif bakiye = müşterinin istasyona borcu.
"""

from __future__ import annotations

import uuid
from dataclasses import dataclass
from datetime import date, datetime, time, timedelta, timezone
from decimal import Decimal
from typing import Any, Iterable, Sequence
from zoneinfo import ZoneInfo

from sqlalchemy import case, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.base import CollectionMethod, CreditAccountType, CreditEntryKind
from app.models.credit import CreditPayment, CreditSale

ZERO = Decimal("0.00")
LITERS_ZERO = Decimal("0.000")
KURUS = Decimal("0.01")
LITERS_Q = Decimal("0.001")
ISTANBUL_TZ = ZoneInfo("Europe/Istanbul")


@dataclass(frozen=True)
class AccountTotals:
    """Bir cari hesabın özet toplamları."""

    total_sales: Decimal = ZERO      # toplam veresiye alım (borç)
    total_payments: Decimal = ZERO   # realized collections only
    total_adjustments: Decimal = ZERO
    sale_count: int = 0
    total_liters: Decimal = Decimal("0.000")
    last_sale_at: datetime | None = None
    last_payment_at: datetime | None = None

    @property
    def balance(self) -> Decimal:
        return (self.total_sales - self.total_payments - self.total_adjustments).quantize(KURUS)


def _account_columns(account_type: CreditAccountType | str):
    """Hesap türüne göre (satış kolonu, tahsilat kolonu) döndürür."""
    if str(getattr(account_type, "value", account_type)) == CreditAccountType.CORPORATE.value:
        return CreditSale.credit_company_id, CreditPayment.credit_company_id
    return CreditSale.credit_customer_id, CreditPayment.credit_customer_id


async def account_totals(
    db: AsyncSession,
    account_type: CreditAccountType | str,
    account_ids: Iterable[uuid.UUID],
    *,
    now: datetime | None = None,
) -> dict[uuid.UUID, AccountTotals]:
    """
    Verilen hesapların toplamlarını iki toplu sorguyla getirir (N+1 yok).
    Hiç hareketi olmayan hesaplar için sıfır toplamlı kayıt döner.
    """
    ids = list(dict.fromkeys(account_ids))
    if not ids:
        return {}
    sale_col, payment_col = _account_columns(account_type)
    as_of = ensure_utc(now or datetime.now(timezone.utc))

    sale_rows = await db.execute(
        select(
            sale_col.label("account_id"),
            func.coalesce(func.sum(CreditSale.amount), 0).label("total"),
            func.coalesce(func.sum(CreditSale.liters), 0).label("liters"),
            func.count(CreditSale.id).label("count"),
            func.max(CreditSale.sale_time).label("last_at"),
        )
        .where(sale_col.in_(ids), CreditSale.sale_time <= as_of)
        .group_by(sale_col)
    )
    payment_rows = await db.execute(
        select(
            payment_col.label("account_id"),
            func.coalesce(func.sum(case((CreditPayment.kind == CreditEntryKind.PAYMENT, CreditPayment.amount), else_=0)), 0).label("total"),
            func.coalesce(func.sum(case((CreditPayment.kind == CreditEntryKind.ADJUSTMENT, CreditPayment.amount), else_=0)), 0).label("adjustments"),
            func.max(case((CreditPayment.kind == CreditEntryKind.PAYMENT, CreditPayment.payment_date), else_=None)).label("last_at"),
        )
        .where(payment_col.in_(ids), CreditPayment.voided_at.is_(None), CreditPayment.payment_date <= as_of)
        .group_by(payment_col)
    )

    sales = {row.account_id: row for row in sale_rows.all()}
    payments = {row.account_id: row for row in payment_rows.all()}

    result: dict[uuid.UUID, AccountTotals] = {}
    for account_id in ids:
        sale = sales.get(account_id)
        payment = payments.get(account_id)
        result[account_id] = AccountTotals(
            total_sales=Decimal(str(sale.total)).quantize(KURUS) if sale else ZERO,
            total_payments=Decimal(str(payment.total)).quantize(KURUS) if payment else ZERO,
            total_adjustments=Decimal(str(payment.adjustments)).quantize(KURUS) if payment else ZERO,
            sale_count=int(sale.count) if sale else 0,
            total_liters=Decimal(str(sale.liters)) if sale else Decimal("0.000"),
            last_sale_at=sale.last_at if sale else None,
            last_payment_at=payment.last_at if payment else None,
        )
    return result


def to_balance_schema(
    totals: AccountTotals,
    *,
    credit_limit: Decimal | None = None,
    overdue_amount: Decimal | None = None,
):
    """AccountTotals → API `AccountBalance` şeması (limit tanımlıysa kalan limitle)."""
    from app.schemas.credit import AccountBalance  # döngüsel import'u önlemek için yerel

    remaining = None
    if credit_limit is not None:
        remaining = (Decimal(str(credit_limit)) - totals.balance).quantize(KURUS)
    return AccountBalance(
        total_sales=totals.total_sales,
        total_payments=totals.total_payments,
        total_adjustments=totals.total_adjustments,
        balance=totals.balance,
        sale_count=totals.sale_count,
        total_liters=totals.total_liters,
        last_sale_at=totals.last_sale_at,
        last_payment_at=totals.last_payment_at,
        overdue_amount=overdue_amount,
        credit_limit_remaining=remaining,
    )


async def account_balance(
    db: AsyncSession,
    account_type: CreditAccountType | str,
    account_id: uuid.UUID,
) -> Decimal:
    """Tek bir hesabın güncel borç bakiyesi (TL)."""
    totals = await account_totals(db, account_type, [account_id])
    return totals[account_id].balance


# ════════════════════════════════════════════════════════════════
# EKSTRE, FIFO VADE HESABI VE DÖNEM GRUPLAMA (SAF FONKSİYONLAR)
# ════════════════════════════════════════════════════════════════


def ensure_utc(dt: datetime) -> datetime:
    """Zaman bilgisini UTC tz-aware hâle getirir."""
    if dt.tzinfo is None:
        return dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(timezone.utc)


def istanbul_day_bounds(
    date_from: date | None,
    date_to: date | None,
) -> tuple[datetime | None, datetime | None]:
    """
    Europe/Istanbul yerel takvim günlerini yarı-açık [start_utc, end_utc)
    UTC sınırlarına çevirir.
    """
    start_utc = (
        datetime.combine(date_from, time.min, tzinfo=ISTANBUL_TZ).astimezone(timezone.utc)
        if date_from is not None
        else None
    )
    end_utc = (
        datetime.combine(date_to + timedelta(days=1), time.min, tzinfo=ISTANBUL_TZ).astimezone(timezone.utc)
        if date_to is not None
        else None
    )
    return start_utc, end_utc


@dataclass(frozen=True)
class LedgerSaleRecord:
    """Saf ekstre hesapları için yalın satış kaydı."""

    id: uuid.UUID
    sale_time: datetime
    amount: Decimal
    liters: Decimal | None = None
    fuel_type: str | None = None
    vehicle_id: uuid.UUID | None = None
    plate: str | None = None
    driver_name: str | None = None
    identity_verified: bool = False
    receipt_document_id: uuid.UUID | None = None


@dataclass(frozen=True)
class LedgerPaymentRecord:
    """Saf ekstre hesapları için yalın tahsilat/düzeltme kaydı."""

    id: uuid.UUID
    payment_date: datetime
    amount: Decimal
    kind: CreditEntryKind | str = CreditEntryKind.PAYMENT
    method: CollectionMethod | str = CollectionMethod.CASH
    reference: str | None = None
    note: str | None = None
    voided_at: datetime | None = None


def _kind_value(kind: Any) -> str:
    return str(getattr(kind, "value", kind))


def _sale_description(fuel_type: str | None, liters: Decimal | None) -> str:
    parts: list[str] = []
    if fuel_type and fuel_type.strip():
        parts.append(fuel_type.strip())
    if liters is not None:
        q_liters = Decimal(str(liters)).quantize(LITERS_Q)
        parts.append(f"{q_liters} Lt")
    return " · ".join(parts) if parts else "Veresiye Satış"


def _payment_description(kind: Any, note: str | None) -> str:
    label = "Düzeltme" if _kind_value(kind) == CreditEntryKind.ADJUSTMENT.value else "Tahsilat"
    if note and note.strip():
        return f"{label} — {note.strip()}"
    return label


def compute_overdue_amount(
    sales: Sequence[LedgerSaleRecord | CreditSale],
    payments: Sequence[LedgerPaymentRecord | CreditPayment],
    *,
    payment_term_days: int | None,
    now: datetime | None = None,
) -> Decimal | None:
    """
    FIFO yöntemiyle vadesi geçmiş ödenmemiş borç tutarını hesaplar.

    - Şirketin `payment_term_days` tanımı yoksa (veya bireysel müşteri ise) None döner.
    - İptal edilmemiş pozitif tahsilat/düzeltmeler önce en eski borç kalemlerine mahsup edilir.
    - Negatif düzeltme kayıtları ödeme tarihli borç kalemi sayılır.
    - Kalan ödenmemiş borç, `debit_date + payment_term_days < now` ise vadesi geçmiş kabul edilir.
    """
    if payment_term_days is None:
        return None

    ref_now = ensure_utc(now or datetime.now(timezone.utc))
    active_payments = [p for p in payments if getattr(p, "voided_at", None) is None and ensure_utc(p.payment_date) <= ref_now]

    debits: list[tuple[datetime, str, Decimal]] = []
    for s in sales:
        if ensure_utc(s.sale_time) > ref_now:
            continue
        amt = Decimal(str(s.amount)).quantize(KURUS)
        if amt > ZERO:
            debits.append((ensure_utc(s.sale_time), f"0:{s.id}", amt))

    total_credits = ZERO
    for p in active_payments:
        amt = Decimal(str(p.amount)).quantize(KURUS)
        if amt > ZERO:
            total_credits = (total_credits + amt).quantize(KURUS)
        elif amt < ZERO:
            debits.append((ensure_utc(p.payment_date), f"1:{p.id}", (-amt).quantize(KURUS)))

    debits.sort(key=lambda item: (item[0], item[1]))

    remaining_credit = total_credits
    overdue = ZERO
    term_delta = timedelta(days=payment_term_days)

    for debit_dt, _key, debit_amt in debits:
        if remaining_credit > ZERO:
            applied = min(remaining_credit, debit_amt)
            unpaid = (debit_amt - applied).quantize(KURUS)
            remaining_credit = (remaining_credit - applied).quantize(KURUS)
        else:
            unpaid = debit_amt

        if unpaid > ZERO and (debit_dt + term_delta) < ref_now:
            overdue = (overdue + unpaid).quantize(KURUS)

    return overdue.quantize(KURUS)


def build_statement(
    *,
    account_type: CreditAccountType | str,
    account_id: uuid.UUID,
    account_name: str,
    sales: Sequence[LedgerSaleRecord | CreditSale],
    payments: Sequence[LedgerPaymentRecord | CreditPayment],
    credit_limit: Decimal | None = None,
    payment_term_days: int | None = None,
    date_from: date | None = None,
    date_to: date | None = None,
    now: datetime | None = None,
):
    """Ham satış ve tahsilat listelerinden saf hesaplama ile `AccountStatement` üretir."""
    from app.schemas.credit import (
        AccountStatement,
        PeriodSpending,
        StatementEntry,
        VehicleBreakdown,
    )

    acc_type = CreditAccountType(str(getattr(account_type, "value", account_type)))
    ref_now = ensure_utc(now or datetime.now(timezone.utc))
    sales = [s for s in sales if ensure_utc(s.sale_time) <= ref_now]
    active_payments = [p for p in payments if getattr(p, "voided_at", None) is None and ensure_utc(p.payment_date) <= ref_now]
    start_utc, end_utc = istanbul_day_bounds(date_from, date_to)

    # Tüm zamanlar özeti (AccountBalance)
    all_sales_total = ZERO
    all_liters_total = LITERS_ZERO
    last_sale_at: datetime | None = None
    for s in sales:
        all_sales_total = (all_sales_total + Decimal(str(s.amount)).quantize(KURUS)).quantize(KURUS)
        if s.liters is not None:
            all_liters_total = (all_liters_total + Decimal(str(s.liters))).quantize(LITERS_Q)
        st = ensure_utc(s.sale_time)
        if last_sale_at is None or st > last_sale_at:
            last_sale_at = st

    all_payments_total = ZERO
    all_adjustments_total = ZERO
    last_payment_at: datetime | None = None
    for p in active_payments:
        if _kind_value(p.kind) == CreditEntryKind.ADJUSTMENT.value:
            all_adjustments_total += Decimal(str(p.amount)).quantize(KURUS)
            continue
        all_payments_total = (all_payments_total + Decimal(str(p.amount)).quantize(KURUS)).quantize(KURUS)
        pt = ensure_utc(p.payment_date)
        if last_payment_at is None or pt > last_payment_at:
            last_payment_at = pt

    all_totals = AccountTotals(
        total_sales=all_sales_total,
        total_payments=all_payments_total,
        total_adjustments=all_adjustments_total,
        sale_count=len(sales),
        total_liters=all_liters_total,
        last_sale_at=last_sale_at,
        last_payment_at=last_payment_at,
    )
    overdue = compute_overdue_amount(
        sales,
        active_payments,
        payment_term_days=payment_term_days,
        now=now,
    )
    balance_schema = to_balance_schema(
        all_totals,
        credit_limit=credit_limit,
        overdue_amount=overdue,
    )

    # Dönem öncesi (opening_balance) ve dönem içi hareketleri ayır
    pre_sales = ZERO
    pre_payments = ZERO
    window_sales: list[LedgerSaleRecord | CreditSale] = []
    window_payments: list[LedgerPaymentRecord | CreditPayment] = []

    for s in sales:
        st = ensure_utc(s.sale_time)
        if start_utc is not None and st < start_utc:
            pre_sales = (pre_sales + Decimal(str(s.amount)).quantize(KURUS)).quantize(KURUS)
        elif end_utc is None or st < end_utc:
            window_sales.append(s)

    for p in active_payments:
        pt = ensure_utc(p.payment_date)
        if start_utc is not None and pt < start_utc:
            pre_payments = (pre_payments + Decimal(str(p.amount)).quantize(KURUS)).quantize(KURUS)
        elif end_utc is None or pt < end_utc:
            window_payments.append(p)

    opening_balance = (pre_sales - pre_payments).quantize(KURUS)
    period_sales = ZERO
    period_payments = ZERO
    period_adjustments = ZERO

    raw_items: list[tuple[datetime, int, str, Any]] = []
    for s in window_sales:
        period_sales = (period_sales + Decimal(str(s.amount)).quantize(KURUS)).quantize(KURUS)
        raw_items.append((ensure_utc(s.sale_time), 0, str(s.id), s))
    for p in window_payments:
        if _kind_value(p.kind) == CreditEntryKind.ADJUSTMENT.value:
            period_adjustments += Decimal(str(p.amount)).quantize(KURUS)
        else:
            period_payments += Decimal(str(p.amount)).quantize(KURUS)
        raw_items.append((ensure_utc(p.payment_date), 1, str(p.id), p))

    raw_items.sort(key=lambda row: (row[0], row[1], row[2]))

    running = opening_balance
    entries: list[StatementEntry] = []
    for dt_utc, kind_order, _id_str, item in raw_items:
        if kind_order == 0:
            amt = Decimal(str(item.amount)).quantize(KURUS)
            running = (running + amt).quantize(KURUS)
            doc_id = getattr(item, "receipt_document_id", None)
            entries.append(
                StatementEntry(
                    entry_type="sale",
                    id=item.id,
                    date=dt_utc,
                    description=_sale_description(item.fuel_type, item.liters),
                    debit=amt,
                    credit=ZERO,
                    balance_after=running,
                    plate=item.plate,
                    driver_name=item.driver_name,
                    fuel_type=item.fuel_type,
                    liters=Decimal(str(item.liters)).quantize(LITERS_Q) if item.liters is not None else None,
                    identity_verified=bool(item.identity_verified),
                    has_receipt=doc_id is not None,
                    receipt_document_id=doc_id,
                )
            )
        else:
            amt = Decimal(str(item.amount)).quantize(KURUS)
            kval = _kind_value(item.kind)
            etype = "adjustment" if kval == CreditEntryKind.ADJUSTMENT.value else "payment"
            if amt >= ZERO:
                debit = ZERO
                credit = amt
                running = (running - amt).quantize(KURUS)
            else:
                debit = (-amt).quantize(KURUS)
                credit = ZERO
                running = (running + debit).quantize(KURUS)
            method_enum = (
                item.method
                if isinstance(item.method, CollectionMethod)
                else CollectionMethod(str(item.method))
            )
            entries.append(
                StatementEntry(
                    entry_type=etype,
                    id=item.id,
                    date=dt_utc,
                    description=_payment_description(item.kind, item.note),
                    debit=debit,
                    credit=credit,
                    balance_after=running,
                    method=method_enum,
                    reference=item.reference,
                )
            )

    closing_balance = (opening_balance + period_sales - period_payments - period_adjustments).quantize(KURUS)

    by_plate: dict[str, dict[str, Any]] = {}
    daily_map: dict[str, dict[str, Any]] = {}
    monthly_map: dict[str, dict[str, Any]] = {}

    for s in window_sales:
        st_utc = ensure_utc(s.sale_time)
        st_ist = st_utc.astimezone(ISTANBUL_TZ)
        amt = Decimal(str(s.amount)).quantize(KURUS)
        ltr = Decimal(str(s.liters)).quantize(LITERS_Q) if s.liters is not None else LITERS_ZERO

        plate_label = s.plate if s.plate else "Plakasız"
        v_bucket = by_plate.get(plate_label)
        if v_bucket is None:
            v_bucket = {
                "vehicle_id": getattr(s, "vehicle_id", None),
                "plate": plate_label,
                "sale_count": 0,
                "liters": LITERS_ZERO,
                "amount": ZERO,
                "last_sale_at": None,
            }
            by_plate[plate_label] = v_bucket
        if v_bucket["vehicle_id"] is None and getattr(s, "vehicle_id", None) is not None:
            v_bucket["vehicle_id"] = getattr(s, "vehicle_id")
        v_bucket["sale_count"] += 1
        v_bucket["liters"] = (v_bucket["liters"] + ltr).quantize(LITERS_Q)
        v_bucket["amount"] = (v_bucket["amount"] + amt).quantize(KURUS)
        if v_bucket["last_sale_at"] is None or st_utc > v_bucket["last_sale_at"]:
            v_bucket["last_sale_at"] = st_utc

        day_key = st_ist.strftime("%Y-%m-%d")
        d_bucket = daily_map.setdefault(
            day_key, {"sale_count": 0, "liters": LITERS_ZERO, "amount": ZERO}
        )
        d_bucket["sale_count"] += 1
        d_bucket["liters"] = (d_bucket["liters"] + ltr).quantize(LITERS_Q)
        d_bucket["amount"] = (d_bucket["amount"] + amt).quantize(KURUS)

        month_key = st_ist.strftime("%Y-%m")
        m_bucket = monthly_map.setdefault(
            month_key, {"sale_count": 0, "liters": LITERS_ZERO, "amount": ZERO}
        )
        m_bucket["sale_count"] += 1
        m_bucket["liters"] = (m_bucket["liters"] + ltr).quantize(LITERS_Q)
        m_bucket["amount"] = (m_bucket["amount"] + amt).quantize(KURUS)

    vehicle_breakdown = [
        VehicleBreakdown(**b)
        for b in sorted(by_plate.values(), key=lambda x: (-x["amount"], x["plate"]))
    ]
    daily_spending = [
        PeriodSpending(period=k, **daily_map[k]) for k in sorted(daily_map.keys())
    ]
    monthly_spending = [
        PeriodSpending(period=k, **monthly_map[k]) for k in sorted(monthly_map.keys())
    ]

    return AccountStatement(
        account_type=acc_type,
        account_id=account_id,
        account_name=account_name,
        date_from=date_from,
        date_to=date_to,
        opening_balance=opening_balance,
        period_sales=period_sales,
        period_payments=period_payments,
        period_adjustments=period_adjustments,
        closing_balance=closing_balance,
        balance=balance_schema,
        entries=entries,
        vehicle_breakdown=vehicle_breakdown,
        daily_spending=daily_spending,
        monthly_spending=monthly_spending,
    )


async def build_account_statement(
    db: AsyncSession,
    *,
    account_type: CreditAccountType | str,
    account_id: uuid.UUID,
    account_name: str,
    credit_limit: Decimal | None = None,
    payment_term_days: int | None = None,
    date_from: date | None = None,
    date_to: date | None = None,
    now: datetime | None = None,
):
    """Veritabanından tüm cari hareketleri okuyup `AccountStatement` oluşturur."""
    sale_col, payment_col = _account_columns(account_type)
    sales = (
        await db.execute(
            select(CreditSale).where(sale_col == account_id).order_by(CreditSale.sale_time.asc())
        )
    ).scalars().all()
    payments = (
        await db.execute(
            select(CreditPayment)
            .where(payment_col == account_id, CreditPayment.voided_at.is_(None))
            .order_by(CreditPayment.payment_date.asc())
        )
    ).scalars().all()
    return build_statement(
        account_type=account_type,
        account_id=account_id,
        account_name=account_name,
        sales=sales,
        payments=payments,
        credit_limit=credit_limit,
        payment_term_days=payment_term_days,
        date_from=date_from,
        date_to=date_to,
        now=now,
    )
