"""
FuelOS — Veresiye Cari Defter (Satışlar, Tahsilatlar, Ekstreler ve Geçmiş Eşleştirme) API Router'ı.
"""

from __future__ import annotations

import uuid
from typing import Annotated
from datetime import date, datetime, timezone
from decimal import Decimal

from fastapi import APIRouter, Depends, Header, HTTPException, Query, Response, status
from sqlalchemy import exists, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.dependencies import get_current_user, require_role
from app.database import get_db
from app.models.base import CreditAccountType, PaymentMethod, UserRole
from app.models.credit import CreditCompany, CreditCustomer, CreditPayment, CreditSale
from app.models.transaction import Transaction
from app.models.user import User
from app.schemas.credit import (
    AccountStatement,
    CreditPaymentCreate,
    CreditPaymentResponse,
    CreditPaymentVoid,
    CreditSaleLinkRequest,
    CreditSaleResponse,
    CreditOverview,
)
from app.schemas.transaction import TransactionResponse
from app.services import credit_access, credit_ledger, credit_sales
from app.services.financial_requests import begin_request, finish_request

router = APIRouter(prefix="/api/veresiye", tags=["Veresiye Cari Defter"])


@router.get('/summary', response_model=CreditOverview)
async def credit_overview(
    current_user: User = Depends(require_role(*credit_access.MANAGER_ROLES)),
    db: AsyncSession = Depends(get_db),
):
    """All accessible accounts, independent of the account list search."""
    station_ids = credit_access.accessible_station_ids(current_user)
    companies = (await db.scalars(select(CreditCompany.id).where(CreditCompany.station_id.in_(station_ids)))).all()
    customers = (await db.scalars(select(CreditCustomer.id).where(CreditCustomer.station_id.in_(station_ids)))).all()
    corporate = await credit_ledger.account_totals(db, CreditAccountType.CORPORATE, companies)
    individual = await credit_ledger.account_totals(db, CreditAccountType.INDIVIDUAL, customers)
    return CreditOverview(
        corporate_receivable=sum((t.balance for t in corporate.values()), Decimal('0.00')),
        individual_receivable=sum((t.balance for t in individual.values()), Decimal('0.00')),
        company_count=len(companies), customer_count=len(customers),
    )


# ════════════════════════════════════════════════════════════════
# VERESİYE SATIŞ LİSTESİ, EŞLEŞTİRME VE DETAY
# ════════════════════════════════════════════════════════════════


@router.get("/sales", response_model=list[CreditSaleResponse])
async def list_credit_sales(
    response: Response,
    station_id: uuid.UUID | None = Query(None),
    shift_id: uuid.UUID | None = Query(None),
    account_type: CreditAccountType | None = Query(None),
    credit_company_id: uuid.UUID | None = Query(None),
    credit_customer_id: uuid.UUID | None = Query(None),
    date_from: date | None = Query(None),
    date_to: date | None = Query(None),
    missing_receipt: bool | None = Query(None),
    limit: int = Query(200, ge=1, le=500),
    offset: int = Query(0, ge=0),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Kapsamdaki veresiye satış defteri kayıtlarını listeler (kasiyer yalnızca kendi kayıtlarını görür)."""
    scoped_station = await credit_access.optional_station_filter(db, current_user, station_id)
    query = select(CreditSale).where(
        CreditSale.station_id.in_(credit_access.accessible_station_ids(current_user))
    )
    if scoped_station is not None:
        query = query.where(CreditSale.station_id == scoped_station)
    if current_user.role == UserRole.CASHIER:
        query = query.where(CreditSale.created_by == current_user.id)
    if shift_id is not None:
        query = query.where(CreditSale.shift_id == shift_id)
    if account_type is not None:
        query = query.where(CreditSale.account_type == account_type)
    if credit_company_id is not None:
        query = query.where(CreditSale.credit_company_id == credit_company_id)
    if credit_customer_id is not None:
        query = query.where(CreditSale.credit_customer_id == credit_customer_id)
    if missing_receipt is True:
        query = query.where(CreditSale.receipt_document_id.is_(None))
    elif missing_receipt is False:
        query = query.where(CreditSale.receipt_document_id.is_not(None))

    start_utc, end_utc = credit_ledger.istanbul_day_bounds(date_from, date_to)
    if start_utc is not None:
        query = query.where(CreditSale.sale_time >= start_utc)
    if end_utc is not None:
        query = query.where(CreditSale.sale_time < end_utc)

    response.headers['X-Total-Count'] = str(await db.scalar(select(func.count()).select_from(query.subquery())))
    query = query.order_by(CreditSale.sale_time.desc(), CreditSale.created_at.desc(), CreditSale.id.desc()).offset(offset).limit(limit)
    sales = (await db.execute(query)).scalars().all()
    return [CreditSaleResponse.model_validate(s) for s in sales]


@router.get("/unlinked-transactions", response_model=list[TransactionResponse])
async def list_unlinked_veresiye_transactions(
    response: Response,
    station_id: uuid.UUID | None = Query(None),
    date_from: date | None = Query(None),
    date_to: date | None = Query(None),
    limit: int = Query(200, ge=1, le=500),
    offset: int = Query(0, ge=0),
    current_user: User = Depends(require_role(*credit_access.MANAGER_ROLES)),
    db: AsyncSession = Depends(get_db),
):
    """Henüz bir cari hesaba bağlanmamış veresiye işlemlerini listeler."""
    scoped_station = await credit_access.optional_station_filter(db, current_user, station_id)
    query = select(Transaction).where(
        Transaction.payment_method == PaymentMethod.VERESIYE,
        Transaction.station_id.in_(credit_access.accessible_station_ids(current_user)),
        ~exists(select(1).where(CreditSale.transaction_id == Transaction.id)),
    )
    if scoped_station is not None:
        query = query.where(Transaction.station_id == scoped_station)

    start_utc, end_utc = credit_ledger.istanbul_day_bounds(date_from, date_to)
    if start_utc is not None:
        query = query.where(Transaction.transaction_time >= start_utc)
    if end_utc is not None:
        query = query.where(Transaction.transaction_time < end_utc)

    response.headers['X-Total-Count'] = str(await db.scalar(select(func.count()).select_from(query.subquery())))
    query = query.order_by(Transaction.transaction_time.desc(), Transaction.created_at.desc(), Transaction.id.desc()).offset(offset).limit(limit)
    rows = (await db.execute(query)).scalars().all()
    return rows


@router.post(
    "/sales/link",
    response_model=CreditSaleResponse,
    status_code=status.HTTP_201_CREATED,
)
async def link_veresiye_transaction(
    body: CreditSaleLinkRequest,
    current_user: User = Depends(require_role(*credit_access.MANAGER_ROLES)),
    db: AsyncSession = Depends(get_db),
):
    """Cari hesapsız kaydedilmiş veresiye işlemini bir şirket veya müşteriye bağlar."""
    sale = await credit_sales.link_existing_transaction(db, user=current_user, request=body)
    return CreditSaleResponse.model_validate(sale)


@router.get("/sales/{sale_id}", response_model=CreditSaleResponse)
async def get_credit_sale_detail(
    sale_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Tek veresiye satış defteri kaydı detayını döndürür."""
    sale = await credit_access.get_credit_sale(db, current_user, sale_id)
    return CreditSaleResponse.model_validate(sale)


# ════════════════════════════════════════════════════════════════
# TAHSİLATLAR VE DÜZELTMELER
# ════════════════════════════════════════════════════════════════


@router.post(
    "/payments",
    response_model=CreditPaymentResponse,
    status_code=status.HTTP_201_CREATED,
)
async def create_credit_payment(
    data: CreditPaymentCreate,
    current_user: User = Depends(require_role(*credit_access.MANAGER_ROLES)),
    db: AsyncSession = Depends(get_db),
    idempotency_key: Annotated[uuid.UUID | None, Header()] = None,
):
    """Cari hesap için tahsilat veya bakiye düzeltme kaydı oluşturur."""
    pending, existing_id = await begin_request(db, current_user.id, 'payment', idempotency_key, data)
    if existing_id is not None:
        existing = await db.scalar(select(CreditPayment).where(
            CreditPayment.id == existing_id,
            CreditPayment.station_id.in_(credit_access.accessible_station_ids(current_user)),
        ))
        if existing is None:
            raise HTTPException(status_code=404, detail="Tahsilat kaydı bulunamadı")
        return existing
    if data.account_type == CreditAccountType.CORPORATE:
        assert data.credit_company_id is not None
        account = await credit_access.get_credit_company(
            db, current_user, data.credit_company_id, lock=True
        )
    else:
        assert data.credit_customer_id is not None
        account = await credit_access.get_credit_customer(
            db, current_user, data.credit_customer_id, lock=True
        )

    now_utc = datetime.now(timezone.utc)
    payment_dt = (
        credit_ledger.ensure_utc(data.payment_date)
        if data.payment_date is not None
        else now_utc
    )
    if payment_dt > now_utc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Tahsilat tarihi gelecekte olamaz",
        )

    payment = CreditPayment(
        station_id=account.station_id,
        account_type=data.account_type,
        credit_company_id=data.credit_company_id,
        credit_customer_id=data.credit_customer_id,
        kind=data.kind,
        amount=data.amount,
        method=data.method,
        payment_date=payment_dt,
        reference=data.reference,
        note=data.note,
        recorded_by=current_user.id,
    )
    db.add(payment)
    await db.flush()
    finish_request(db, pending, payment.id)

    reloaded = (
        await db.execute(
            select(CreditPayment)
            .where(CreditPayment.id == payment.id)
            .execution_options(populate_existing=True)
        )
    ).scalar_one()
    return CreditPaymentResponse.model_validate(reloaded)


@router.get("/payments", response_model=list[CreditPaymentResponse])
async def list_credit_payments(
    response: Response,
    station_id: uuid.UUID | None = Query(None),
    account_type: CreditAccountType | None = Query(None),
    credit_company_id: uuid.UUID | None = Query(None),
    credit_customer_id: uuid.UUID | None = Query(None),
    date_from: date | None = Query(None),
    date_to: date | None = Query(None),
    include_void: bool = Query(False),
    limit: int = Query(200, ge=1, le=500),
    offset: int = Query(0, ge=0),
    current_user: User = Depends(require_role(*credit_access.MANAGER_ROLES)),
    db: AsyncSession = Depends(get_db),
):
    """Tahsilat ve düzeltme kayıtlarını en yeniden eskiye listeler."""
    scoped_station = await credit_access.optional_station_filter(db, current_user, station_id)
    query = select(CreditPayment).where(
        CreditPayment.station_id.in_(credit_access.accessible_station_ids(current_user))
    )
    if scoped_station is not None:
        query = query.where(CreditPayment.station_id == scoped_station)
    if account_type is not None:
        query = query.where(CreditPayment.account_type == account_type)
    if credit_company_id is not None:
        query = query.where(CreditPayment.credit_company_id == credit_company_id)
    if credit_customer_id is not None:
        query = query.where(CreditPayment.credit_customer_id == credit_customer_id)
    if not include_void:
        query = query.where(CreditPayment.voided_at.is_(None))

    start_utc, end_utc = credit_ledger.istanbul_day_bounds(date_from, date_to)
    if start_utc is not None:
        query = query.where(CreditPayment.payment_date >= start_utc)
    if end_utc is not None:
        query = query.where(CreditPayment.payment_date < end_utc)

    response.headers['X-Total-Count'] = str(await db.scalar(select(func.count()).select_from(query.subquery())))
    query = query.order_by(CreditPayment.payment_date.desc(), CreditPayment.created_at.desc(), CreditPayment.id.desc()).offset(offset).limit(limit)
    rows = (await db.execute(query)).scalars().all()
    return [CreditPaymentResponse.model_validate(p) for p in rows]


@router.post("/payments/{payment_id}/void", response_model=CreditPaymentResponse)
async def void_credit_payment(
    payment_id: uuid.UUID,
    data: CreditPaymentVoid,
    current_user: User = Depends(require_role(*credit_access.MANAGER_ROLES)),
    db: AsyncSession = Depends(get_db),
):
    """Tahsilat veya düzeltme kaydını denetim iziyle iptal eder."""
    payment = await db.scalar(
        select(CreditPayment)
        .where(
            CreditPayment.id == payment_id,
            CreditPayment.station_id.in_(credit_access.accessible_station_ids(current_user)),
        )
        .with_for_update(of=CreditPayment)
    )
    if payment is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Tahsilat kaydı bulunamadı veya erişim yetkiniz yok",
        )
    if payment.voided_at is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Bu tahsilat kaydı zaten iptal edilmiş",
        )

    payment.voided_at = datetime.now(timezone.utc)
    payment.voided_by = current_user.id
    payment.void_reason = data.reason
    await db.flush()

    reloaded = (
        await db.execute(
            select(CreditPayment)
            .where(CreditPayment.id == payment.id)
            .execution_options(populate_existing=True)
        )
    ).scalar_one()
    return CreditPaymentResponse.model_validate(reloaded)


# ════════════════════════════════════════════════════════════════
# EKSTRELER (CARİ HESAP ÖZETİ)
# ════════════════════════════════════════════════════════════════


@router.get("/companies/{company_id}/statement", response_model=AccountStatement)
async def get_company_statement(
    company_id: uuid.UUID,
    date_from: date | None = Query(None),
    date_to: date | None = Query(None),
    current_user: User = Depends(require_role(*credit_access.MANAGER_ROLES)),
    db: AsyncSession = Depends(get_db),
):
    """Kurumsal veresiye şirketinin cari hesap ekstresini, araç kırılımını ve vade durumunu döndürür."""
    company = await credit_access.get_credit_company(db, current_user, company_id)
    return await credit_ledger.build_account_statement(
        db,
        account_type=CreditAccountType.CORPORATE,
        account_id=company.id,
        account_name=company.name,
        credit_limit=company.credit_limit,
        payment_term_days=company.payment_term_days,
        date_from=date_from,
        date_to=date_to,
    )


@router.get("/customers/{customer_id}/statement", response_model=AccountStatement)
async def get_customer_statement(
    customer_id: uuid.UUID,
    date_from: date | None = Query(None),
    date_to: date | None = Query(None),
    current_user: User = Depends(require_role(*credit_access.MANAGER_ROLES)),
    db: AsyncSession = Depends(get_db),
):
    """Bireysel veresiye müşterisinin dijital veresiye defteri ekstresini döndürür."""
    customer = await credit_access.get_credit_customer(db, current_user, customer_id)
    return await credit_ledger.build_account_statement(
        db,
        account_type=CreditAccountType.INDIVIDUAL,
        account_id=customer.id,
        account_name=customer.full_name,
        credit_limit=customer.credit_limit,
        payment_term_days=None,
        date_from=date_from,
        date_to=date_to,
    )
