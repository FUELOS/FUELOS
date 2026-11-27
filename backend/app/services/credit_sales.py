"""
FuelOS — Veresiye satış defteri oluşturma ve geçmiş işlem eşleştirme servisi.

Oluşturulan her `CreditSale` kaydı için sunucu tarafında salt (nonce) ile
salted SHA-256 taahhüdü (`commitment`) üretilir; böylece sonraki vardiya
kapanışı ve Midnight kanıt akışlarıyla değişmezlik sağlanır.
"""

from __future__ import annotations

import uuid
from datetime import timezone

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.base import CreditAccountType, PaymentMethod
from app.models.credit import CreditSale, CreditVehicle
from app.models.shift import Shift
from app.models.transaction import Transaction
from app.models.user import User
from app.schemas.credit import CreditSaleInput, CreditSaleLinkRequest
from app.services import (
    credit_access,
    credit_commitment,
    rate_limit,
    credit_verification,
)

_FORBIDDEN_REASONS = {
    "company_not_authorized",
    "vehicle_inactive",
    "driver_inactive",
    "customer_inactive",
}
_CONFLICT_REASONS = {"credit_limit_exceeded"}


def _status_for_reasons(reasons: list[str]) -> int:
    """En ciddi doğrulama hatasına göre HTTP durum kodunu seçer (403 > 409 > 422)."""
    if any(r in _FORBIDDEN_REASONS for r in reasons):
        return status.HTTP_403_FORBIDDEN
    if any(r in _CONFLICT_REASONS for r in reasons):
        return status.HTTP_409_CONFLICT
    return status.HTTP_422_UNPROCESSABLE_ENTITY


def _ensure_utc(dt):
    return dt.replace(tzinfo=timezone.utc) if dt.tzinfo is None else dt.astimezone(timezone.utc)


async def _reload_credit_sale(db: AsyncSession, sale_id: uuid.UUID) -> CreditSale:
    result = await db.execute(
        select(CreditSale)
        .where(CreditSale.id == sale_id)
        .execution_options(populate_existing=True)
    )
    return result.scalar_one()


async def create_credit_sale(
    db: AsyncSession,
    *,
    user: User,
    shift: Shift,
    transaction: Transaction,
    credit: CreditSaleInput,
    verify_identity: bool = True,
) -> CreditSale:
    """
    Veresiye satış işlemini aynı DB transaction içinde cari deftere (`CreditSale`) yazar.

    Doğrulama başarısız olursa `HTTPException` fırlatır; çağıran taraf transaction'ı
    commit etmez, böylece hem `Transaction` hem `CreditSale` atomik kalır.
    """
    vehicle_id: uuid.UUID | None = None
    plate_snap: str | None = None
    driver_id: uuid.UUID | None = None
    driver_name: str | None = None
    credit_company_id: uuid.UUID | None = None
    credit_customer_id: uuid.UUID | None = None
    identity_verified = False
    rate_limit.ensure_allowed(user.id)

    if credit.account_type == CreditAccountType.CORPORATE:
        target_company_id = credit.credit_company_id
        if target_company_id is None and credit.vehicle_id is not None:
            target_company_id = await db.scalar(
                select(CreditVehicle.credit_company_id).where(
                    CreditVehicle.id == credit.vehicle_id,
                    CreditVehicle.station_id == shift.station_id,
                )
            )
        elif target_company_id is None and credit.plate is not None:
            target_company_id = await db.scalar(
                select(CreditVehicle.credit_company_id)
                .where(
                    CreditVehicle.station_id == shift.station_id,
                    CreditVehicle.plate == credit.plate,
                )
                .order_by(CreditVehicle.is_active.desc(), CreditVehicle.updated_at.desc())
            )

        if target_company_id is not None:
            company = await credit_access.get_credit_company(
                db, user, target_company_id, lock=True
            )
            if company.station_id != shift.station_id:
                raise HTTPException(
                    status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                    detail="Şirket bu vardiyanın istasyonuna kayıtlı değil",
                )

        res = await credit_verification.verify_corporate(
            db,
            station_id=shift.station_id,
            plate=credit.plate,
            vehicle_id=credit.vehicle_id,
            company_id=target_company_id,
            driver_id=credit.driver_id,
            driver_tc=credit.driver_tc,
            amount=transaction.amount,
        )
        if credit.driver_tc and {"driver_tc_mismatch", "driver_not_found"} & set(res.reasons):
            rate_limit.record_failure(user.id)
        if res.reasons or (verify_identity and not res.identity_verified):
            detail = (
                credit_verification.reason_message(res.reasons)
                if res.reasons
                else "Sürücü T.C. kimlik doğrulaması zorunludur"
            )
            raise HTTPException(
                status_code=_status_for_reasons(res.reasons),
                detail=detail,
            )

        assert res.company is not None and res.vehicle is not None and res.driver is not None
        credit_company_id = res.company.id
        vehicle_id = res.vehicle.id
        plate_snap = res.vehicle.plate
        driver_id = res.driver.id
        driver_name = res.driver.full_name
        identity_verified = bool(res.identity_verified)
    else:
        credit_access.require_individual_credit_enabled()
        assert credit.credit_customer_id is not None
        customer = await credit_access.get_credit_customer(
            db, user, credit.credit_customer_id, lock=True
        )
        if customer.station_id != shift.station_id:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="Müşteri bu vardiyanın istasyonuna kayıtlı değil",
            )
        res = await credit_verification.verify_individual(
            db,
            customer=customer,
            customer_tc=credit.customer_tc,
            amount=transaction.amount,
        )
        if "customer_tc_mismatch" in res.reasons:
            rate_limit.record_failure(user.id)
        if res.reasons:
            raise HTTPException(
                status_code=_status_for_reasons(res.reasons),
                detail=credit_verification.reason_message(res.reasons),
            )
        credit_customer_id = customer.id
        plate_snap = credit.plate if credit.plate is not None else customer.plate
        identity_verified = bool(res.identity_verified)

    sale_id = uuid.uuid4()
    sale_time = _ensure_utc(transaction.transaction_time)
    nonce = credit_commitment.new_nonce()

    sale = CreditSale(
        id=sale_id,
        transaction_id=transaction.id,
        station_id=transaction.station_id,
        shift_id=shift.id,
        account_type=credit.account_type,
        credit_company_id=credit_company_id,
        credit_customer_id=credit_customer_id,
        vehicle_id=vehicle_id,
        plate=plate_snap,
        driver_id=driver_id,
        driver_name=driver_name,
        identity_verified=identity_verified,
        amount=transaction.amount,
        liters=transaction.liters,
        fuel_type=transaction.fuel_type,
        sale_time=sale_time,
        commitment="",
        commitment_nonce=nonce,
        created_by=user.id,
    )
    leaf = credit_commitment.leaf_from_record(sale)
    sale.commitment = credit_commitment.sale_commitment(leaf, nonce)

    db.add(sale)
    await db.flush()
    return await _reload_credit_sale(db, sale.id)


async def link_existing_transaction(
    db: AsyncSession,
    *,
    user: User,
    request: CreditSaleLinkRequest,
) -> CreditSale:
    """
    Daha önce cari hesap seçilmeden kaydedilmiş bir veresiye `Transaction`
    kaydını sonradan bir cari hesaba bağlar (ör. eski entegrasyon kayıtları).
    """
    tx = await db.scalar(
        select(Transaction)
        .where(
            Transaction.id == request.transaction_id,
            Transaction.station_id.in_(credit_access.accessible_station_ids(user)),
        )
        .with_for_update()
    )
    if tx is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Satış işlemi bulunamadı veya erişim yetkiniz yok",
        )
    if tx.payment_method != PaymentMethod.VERESIYE:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Yalnızca veresiye ödeme yöntemine sahip işlemler cari hesaba bağlanabilir",
        )

    existing_id = await db.scalar(
        select(CreditSale.id).where(CreditSale.transaction_id == tx.id)
    )
    if existing_id is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Bu satış işlemi zaten bir cari hesaba bağlanmış",
        )

    credit_company_id: uuid.UUID | None = None
    credit_customer_id: uuid.UUID | None = None
    vehicle_id: uuid.UUID | None = None
    plate_snap: str | None = None
    driver_id: uuid.UUID | None = None
    driver_name: str | None = None

    if request.account_type == CreditAccountType.CORPORATE:
        assert request.credit_company_id is not None
        company = await credit_access.get_credit_company(
            db, user, request.credit_company_id, lock=True
        )
        if company.station_id != tx.station_id:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="Şirket işlemin yapıldığı istasyona kayıtlı değil",
            )
        credit_company_id = company.id

        if request.vehicle_id is not None:
            matched_v = next((v for v in company.vehicles if v.id == request.vehicle_id), None)
            if matched_v is None:
                raise HTTPException(
                    status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                    detail="Seçilen araç bu şirkete ait değil",
                )
            vehicle_id = matched_v.id
            plate_snap = matched_v.plate
        elif request.plate is not None:
            matched_v = next((v for v in company.vehicles if v.plate == request.plate), None)
            if matched_v is not None:
                vehicle_id = matched_v.id
                plate_snap = matched_v.plate
            else:
                plate_snap = request.plate

        if request.driver_id is not None:
            matched_d = next((d for d in company.drivers if d.id == request.driver_id), None)
            if matched_d is None:
                raise HTTPException(
                    status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                    detail="Seçilen sürücü bu şirkete ait değil",
                )
            driver_id = matched_d.id
            driver_name = matched_d.full_name
    else:
        credit_access.require_individual_credit_enabled()
        assert request.credit_customer_id is not None
        customer = await credit_access.get_credit_customer(
            db, user, request.credit_customer_id, lock=True
        )
        if customer.station_id != tx.station_id:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="Müşteri işlemin yapıldığı istasyona kayıtlı değil",
            )
        credit_customer_id = customer.id
        plate_snap = request.plate or customer.plate

    sale_id = uuid.uuid4()
    sale_time = _ensure_utc(tx.transaction_time)
    nonce = credit_commitment.new_nonce()

    sale = CreditSale(
        id=sale_id,
        transaction_id=tx.id,
        station_id=tx.station_id,
        shift_id=tx.shift_id,
        account_type=request.account_type,
        credit_company_id=credit_company_id,
        credit_customer_id=credit_customer_id,
        vehicle_id=vehicle_id,
        plate=plate_snap,
        driver_id=driver_id,
        driver_name=driver_name,
        identity_verified=False,
        amount=tx.amount,
        liters=tx.liters,
        fuel_type=tx.fuel_type,
        sale_time=sale_time,
        commitment="",
        commitment_nonce=nonce,
        created_by=user.id,
    )
    leaf = credit_commitment.leaf_from_record(sale)
    sale.commitment = credit_commitment.sale_commitment(leaf, nonce)

    db.add(sale)
    await db.flush()
    return await _reload_credit_sale(db, sale.id)
