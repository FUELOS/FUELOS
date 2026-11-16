"""
FuelOS — Veresiye Cari Hesap (Kurumsal Şirket ve Bireysel Müşteri) API Router'ı.

Kurumsal anlaşmalı şirketler, yetkili araç plakaları, yetkili sürücüler,
bireysel veresiye müşterileri ve satış öncesi plaka/kimlik doğrulama
uç noktalarını sunar.
"""

from __future__ import annotations

import re
import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, field_validator
from sqlalchemy import exists, or_, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.auth.dependencies import get_current_user, require_role
from app.database import get_db
from app.models.base import CreditAccountType, UserRole
from app.models.credit import (
    CreditCompany,
    CreditCustomer,
    CreditDriver,
    CreditVehicle,
)
from app.models.user import User
from app.schemas.credit import (
    AccountBalance,
    CreditCompanyAuthorizationUpdate,
    CreditCompanyCreate,
    CreditCompanyDetail,
    CreditCompanySummary,
    CreditCompanyUpdate,
    CreditCustomerCreate,
    CreditCustomerDetail,
    CreditCustomerSummary,
    CreditCustomerUpdate,
    DriverCreate,
    DriverResponse,
    DriverUpdate,
    VehicleCreate,
    VehicleResponse,
    VehicleUpdate,
    VerifyCompany,
    VerifyRequest,
    VerifyResponse,
)
from app.services import credit_access, credit_ledger, credit_verification, pii

router = APIRouter(prefix="/api/veresiye", tags=["Veresiye Hesaplar"])


class CustomerLookupRequest(BaseModel):
    """T.C. kimlik no URL/sorgu günlüğüne düşmeden müşteri arama isteği."""

    tc_no: str
    station_id: uuid.UUID | None = None

    @field_validator("tc_no")
    @classmethod
    def _validate_tc(cls, value: str) -> str:
        return pii.normalize_tc(value)


_SAFE_PLATE_MAP = str.maketrans(
    {
        "ç": "C", "Ç": "C",
        "ğ": "G", "Ğ": "G",
        "ı": "I", "İ": "I", "i": "I",
        "ö": "O", "Ö": "O",
        "ş": "S", "Ş": "S",
        "ü": "U", "Ü": "U",
    }
)


def _safe_plate_search(term: str) -> str:
    """Arama sorgusunu kısmi plaka eşleşmesi için hata fırlatmadan normalleştirir."""
    cleaned = re.sub(r"[\s\-._]+", "", term or "")
    return cleaned.translate(_SAFE_PLATE_MAP).upper()


def _driver_response(driver: CreditDriver) -> DriverResponse:
    """Sürücü kaydını yalnızca maskeli T.C. kimlik no ile şemaya çevirir."""
    return DriverResponse(
        id=driver.id,
        credit_company_id=driver.credit_company_id,
        full_name=driver.full_name,
        tc_masked=pii.masked_tc_from_token(driver.tc_encrypted),
        phone=driver.phone,
        is_active=driver.is_active,
        created_at=driver.created_at,
    )


def _vehicle_response(vehicle: CreditVehicle) -> VehicleResponse:
    return VehicleResponse.model_validate(vehicle)


def _company_summary(
    company: CreditCompany, balance: AccountBalance | None
) -> CreditCompanySummary:
    return CreditCompanySummary(
        id=company.id,
        station_id=company.station_id,
        name=company.name,
        tax_number=company.tax_number,
        contact_name=company.contact_name,
        phone=company.phone,
        is_authorized=company.is_authorized,
        authorization_ended_at=company.authorization_ended_at,
        credit_limit=company.credit_limit,
        payment_term_days=company.payment_term_days,
        vehicle_count=sum(1 for v in company.vehicles if v.is_active),
        driver_count=sum(1 for d in company.drivers if d.is_active),
        balance=balance,
        created_at=company.created_at,
    )


def _company_detail(
    company: CreditCompany, balance: AccountBalance | None
) -> CreditCompanyDetail:
    vehicles = sorted(company.vehicles, key=lambda v: (not v.is_active, v.plate))
    drivers = sorted(company.drivers, key=lambda d: (not d.is_active, d.full_name.lower()))
    return CreditCompanyDetail(
        id=company.id,
        station_id=company.station_id,
        name=company.name,
        tax_number=company.tax_number,
        tax_office=company.tax_office,
        address=company.address,
        contact_name=company.contact_name,
        phone=company.phone,
        email=company.email,
        notes=company.notes,
        is_authorized=company.is_authorized,
        authorization_ended_at=company.authorization_ended_at,
        authorization_end_reason=company.authorization_end_reason,
        credit_limit=company.credit_limit,
        payment_term_days=company.payment_term_days,
        vehicle_count=sum(1 for v in company.vehicles if v.is_active),
        driver_count=sum(1 for d in company.drivers if d.is_active),
        balance=balance,
        vehicles=[_vehicle_response(v) for v in vehicles],
        drivers=[_driver_response(d) for d in drivers],
        created_at=company.created_at,
        updated_at=company.updated_at,
    )


def _customer_summary(
    customer: CreditCustomer, balance: AccountBalance | None
) -> CreditCustomerSummary:
    return CreditCustomerSummary(
        id=customer.id,
        station_id=customer.station_id,
        full_name=customer.full_name,
        tc_masked=pii.masked_tc_from_token(customer.tc_encrypted),
        phone=customer.phone,
        plate=customer.plate,
        is_active=customer.is_active,
        has_id_photo=customer.has_id_photo,
        id_photo_document_id=customer.id_photo_document_id,
        credit_limit=customer.credit_limit,
        balance=balance,
        created_at=customer.created_at,
    )


def _customer_detail(
    customer: CreditCustomer, balance: AccountBalance | None
) -> CreditCustomerDetail:
    return CreditCustomerDetail(
        id=customer.id,
        station_id=customer.station_id,
        full_name=customer.full_name,
        tc_masked=pii.masked_tc_from_token(customer.tc_encrypted),
        phone=customer.phone,
        plate=customer.plate,
        is_active=customer.is_active,
        has_id_photo=customer.has_id_photo,
        id_photo_document_id=customer.id_photo_document_id,
        credit_limit=customer.credit_limit,
        notes=customer.notes,
        balance=balance,
        created_at=customer.created_at,
        updated_at=customer.updated_at,
    )


async def _reload_company(db: AsyncSession, company_id: uuid.UUID) -> CreditCompany:
    result = await db.execute(
        select(CreditCompany)
        .options(selectinload(CreditCompany.vehicles), selectinload(CreditCompany.drivers))
        .where(CreditCompany.id == company_id)
        .execution_options(populate_existing=True)
    )
    company = result.scalar_one()
    return company


async def _company_balance(
    db: AsyncSession, user: User, company: CreditCompany
) -> AccountBalance | None:
    if not credit_access.is_manager(user):
        return None
    totals_map = await credit_ledger.account_totals(
        db, CreditAccountType.CORPORATE, [company.id]
    )
    totals = totals_map.get(company.id, credit_ledger.AccountTotals())
    return credit_ledger.to_balance_schema(totals, credit_limit=company.credit_limit)


async def _customer_balance(
    db: AsyncSession, user: User, customer: CreditCustomer
) -> AccountBalance | None:
    if not credit_access.is_manager(user):
        return None
    totals_map = await credit_ledger.account_totals(
        db, CreditAccountType.INDIVIDUAL, [customer.id]
    )
    totals = totals_map.get(customer.id, credit_ledger.AccountTotals())
    return credit_ledger.to_balance_schema(totals, credit_limit=customer.credit_limit)


async def _ensure_station_tax_unique(
    db: AsyncSession,
    station_id: uuid.UUID,
    tax_number: str | None,
    *,
    exclude_company_id: uuid.UUID | None = None,
) -> None:
    if not tax_number:
        return
    stmt = select(CreditCompany.id).where(
        CreditCompany.station_id == station_id,
        CreditCompany.tax_number == tax_number,
    )
    if exclude_company_id is not None:
        stmt = stmt.where(CreditCompany.id != exclude_company_id)
    if await db.scalar(stmt) is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Bu vergi numarası bu istasyonda zaten kayıtlı: {tax_number}",
        )


async def _ensure_station_active_plates_free(
    db: AsyncSession,
    station_id: uuid.UUID,
    plates: list[str],
    *,
    exclude_company_id: uuid.UUID | None = None,
) -> None:
    if not plates:
        return
    stmt = select(CreditVehicle.plate).where(
        CreditVehicle.station_id == station_id,
        CreditVehicle.is_active.is_(True),
        CreditVehicle.plate.in_(plates),
    )
    if exclude_company_id is not None:
        stmt = stmt.where(CreditVehicle.credit_company_id != exclude_company_id)
    conflict = await db.scalar(stmt)
    if conflict is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Bu plaka bu istasyonda başka bir kurumsal hesapta zaten aktif: {conflict}",
        )


# ════════════════════════════════════════════════════════════════
# KURUMSAL ŞİRKETLER
# ════════════════════════════════════════════════════════════════


@router.get("/companies", response_model=list[CreditCompanySummary])
async def list_companies(
    station_id: uuid.UUID | None = Query(None),
    search: str | None = Query(None, max_length=120),
    authorized: bool | None = Query(None),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Kapsamdaki anlaşmalı kurumsal şirketleri listeler."""
    scoped_station = await credit_access.optional_station_filter(db, current_user, station_id)
    query = select(CreditCompany).where(
        CreditCompany.station_id.in_(credit_access.accessible_station_ids(current_user))
    )
    if scoped_station is not None:
        query = query.where(CreditCompany.station_id == scoped_station)
    if authorized is not None:
        query = query.where(CreditCompany.is_authorized == authorized)

    if search and search.strip():
        term = search.strip()
        plate_term = _safe_plate_search(term)
        conditions = [
            CreditCompany.name.ilike(f"%{term}%"),
            CreditCompany.tax_number.ilike(f"%{term}%"),
        ]
        if plate_term:
            conditions.append(
                exists(
                    select(1).where(
                        CreditVehicle.credit_company_id == CreditCompany.id,
                        CreditVehicle.plate.ilike(f"%{plate_term}%"),
                    )
                )
            )
        query = query.where(or_(*conditions))

    query = query.order_by(CreditCompany.name.asc())
    companies = (await db.execute(query)).scalars().unique().all()

    totals_map: dict[uuid.UUID, credit_ledger.AccountTotals] = {}
    manager = credit_access.is_manager(current_user)
    if manager and companies:
        totals_map = await credit_ledger.account_totals(
            db, CreditAccountType.CORPORATE, [c.id for c in companies]
        )

    results: list[CreditCompanySummary] = []
    for c in companies:
        bal = (
            credit_ledger.to_balance_schema(
                totals_map.get(c.id, credit_ledger.AccountTotals()),
                credit_limit=c.credit_limit,
            )
            if manager
            else None
        )
        results.append(_company_summary(c, bal))
    return results


@router.post(
    "/companies",
    response_model=CreditCompanyDetail,
    status_code=status.HTTP_201_CREATED,
)
async def create_company(
    data: CreditCompanyCreate,
    current_user: User = Depends(require_role(*credit_access.MANAGER_ROLES)),
    db: AsyncSession = Depends(get_db),
):
    """Yeni anlaşmalı kurumsal veresiye şirketi (araçları ve sürücüleriyle) oluşturur."""
    station_id = await credit_access.resolve_station_id(db, current_user, data.station_id)

    seen_plates: set[str] = set()
    for v in data.vehicles:
        if v.plate in seen_plates:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail=f"Aynı istek içinde mükerrer araç plakası bulunamaz: {v.plate}",
            )
        seen_plates.add(v.plate)

    seen_tc_hashes: set[str] = set()
    driver_hashes: list[tuple[DriverCreate, str]] = []
    for d in data.drivers:
        tc_hash = pii.tc_blind_index(d.tc_no)
        if tc_hash in seen_tc_hashes:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="Aynı istek içinde mükerrer sürücü T.C. kimlik numarası bulunamaz",
            )
        seen_tc_hashes.add(tc_hash)
        driver_hashes.append((d, tc_hash))

    await _ensure_station_tax_unique(db, station_id, data.tax_number)
    await _ensure_station_active_plates_free(db, station_id, [v.plate for v in data.vehicles])

    company = CreditCompany(
        station_id=station_id,
        name=data.name,
        tax_number=data.tax_number,
        tax_office=data.tax_office,
        address=data.address,
        contact_name=data.contact_name,
        phone=data.phone,
        email=data.email,
        credit_limit=data.credit_limit,
        payment_term_days=data.payment_term_days,
        notes=data.notes,
        is_authorized=True,
        created_by=current_user.id,
    )
    db.add(company)
    await db.flush()

    for v in data.vehicles:
        db.add(
            CreditVehicle(
                credit_company_id=company.id,
                station_id=station_id,
                plate=v.plate,
                description=v.description,
                is_active=True,
            )
        )
    for d, tc_hash in driver_hashes:
        db.add(
            CreditDriver(
                credit_company_id=company.id,
                full_name=d.full_name,
                tc_encrypted=pii.encrypt_tc(d.tc_no),
                tc_hash=tc_hash,
                phone=d.phone,
                is_active=True,
            )
        )

    try:
        await db.flush()
    except IntegrityError:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Şirket, vergi numarası, plaka veya sürücü T.C. kaydı çakıştı",
        ) from None

    company = await _reload_company(db, company.id)
    bal = credit_ledger.to_balance_schema(
        credit_ledger.AccountTotals(), credit_limit=company.credit_limit
    )
    return _company_detail(company, bal)


@router.get("/companies/{company_id}", response_model=CreditCompanyDetail)
async def get_company(
    company_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Anlaşmalı kurumsal şirket detayını (araçları ve sürücüleriyle) döndürür."""
    company = await credit_access.get_credit_company(db, current_user, company_id)
    bal = await _company_balance(db, current_user, company)
    return _company_detail(company, bal)


@router.patch("/companies/{company_id}", response_model=CreditCompanyDetail)
async def update_company(
    company_id: uuid.UUID,
    data: CreditCompanyUpdate,
    current_user: User = Depends(require_role(*credit_access.MANAGER_ROLES)),
    db: AsyncSession = Depends(get_db),
):
    """Anlaşmalı kurumsal şirket bilgilerini günceller."""
    company = await credit_access.get_credit_company(db, current_user, company_id, lock=True)
    updates = data.model_dump(exclude_unset=True)

    if "name" in updates and updates["name"] is None:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Şirket adı boş bırakılamaz",
        )
    if "tax_number" in updates:
        await _ensure_station_tax_unique(
            db,
            company.station_id,
            updates["tax_number"],
            exclude_company_id=company.id,
        )

    for key, value in updates.items():
        setattr(company, key, value)

    try:
        await db.flush()
    except IntegrityError:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Bu vergi numarası bu istasyonda başka bir şirkette zaten kayıtlı",
        ) from None

    company = await _reload_company(db, company.id)
    bal = await _company_balance(db, current_user, company)
    return _company_detail(company, bal)


@router.post("/companies/{company_id}/authorization", response_model=CreditCompanyDetail)
async def update_company_authorization(
    company_id: uuid.UUID,
    data: CreditCompanyAuthorizationUpdate,
    current_user: User = Depends(require_role(*credit_access.MANAGER_ROLES)),
    db: AsyncSession = Depends(get_db),
):
    """Şirketin veresiye yakıt alım yetkisini sonlandırır veya yeniden açar."""
    company = await credit_access.get_credit_company(db, current_user, company_id, lock=True)
    if data.authorized:
        company.is_authorized = True
        company.authorization_ended_at = None
        company.authorization_ended_by = None
        company.authorization_end_reason = None
    else:
        company.is_authorized = False
        company.authorization_ended_at = datetime.now(timezone.utc)
        company.authorization_ended_by = current_user.id
        company.authorization_end_reason = data.reason

    await db.flush()
    company = await _reload_company(db, company.id)
    bal = await _company_balance(db, current_user, company)
    return _company_detail(company, bal)


# ════════════════════════════════════════════════════════════════
# ARAÇLAR VE SÜRÜCÜLER
# ════════════════════════════════════════════════════════════════


@router.post(
    "/companies/{company_id}/vehicles",
    response_model=VehicleResponse,
    status_code=status.HTTP_201_CREATED,
)
async def add_company_vehicle(
    company_id: uuid.UUID,
    data: VehicleCreate,
    current_user: User = Depends(require_role(*credit_access.MANAGER_ROLES)),
    db: AsyncSession = Depends(get_db),
):
    """Şirkete yeni araç ekler; şirket içinde pasif aynı plaka varsa yeniden aktifleştirir."""
    company = await credit_access.get_credit_company(db, current_user, company_id, lock=True)
    await _ensure_station_active_plates_free(
        db, company.station_id, [data.plate], exclude_company_id=company.id
    )

    existing = await db.scalar(
        select(CreditVehicle).where(
            CreditVehicle.credit_company_id == company.id,
            CreditVehicle.plate == data.plate,
        )
    )
    if existing is not None:
        if existing.is_active:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=f"Bu plaka bu şirkette zaten aktif: {data.plate}",
            )
        existing.is_active = True
        if data.description is not None:
            existing.description = data.description
        vehicle = existing
    else:
        vehicle = CreditVehicle(
            credit_company_id=company.id,
            station_id=company.station_id,
            plate=data.plate,
            description=data.description,
            is_active=True,
        )
        db.add(vehicle)

    try:
        await db.flush()
    except IntegrityError:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Bu plaka istasyonda başka bir aktif araçta zaten kayıtlı: {data.plate}",
        ) from None

    await db.refresh(vehicle)
    return _vehicle_response(vehicle)


@router.patch("/vehicles/{vehicle_id}", response_model=VehicleResponse)
async def update_vehicle(
    vehicle_id: uuid.UUID,
    data: VehicleUpdate,
    current_user: User = Depends(require_role(*credit_access.MANAGER_ROLES)),
    db: AsyncSession = Depends(get_db),
):
    """Kayıtlı kurumsal aracı günceller veya aktiflik durumunu değiştirir."""
    vehicle = await db.scalar(
        select(CreditVehicle)
        .join(CreditCompany, CreditVehicle.credit_company_id == CreditCompany.id)
        .where(
            CreditVehicle.id == vehicle_id,
            CreditCompany.station_id.in_(credit_access.accessible_station_ids(current_user)),
        )
        .with_for_update(of=CreditVehicle)
    )
    if vehicle is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Araç kaydı bulunamadı veya erişim yetkiniz yok",
        )

    updates = data.model_dump(exclude_unset=True)
    if "plate" in updates and updates["plate"] is None:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Araç plakası boş bırakılamaz",
        )
    if "is_active" in updates and updates["is_active"] is None:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="is_active alanı boş bırakılamaz",
        )

    new_plate = updates.get("plate", vehicle.plate)
    new_active = updates.get("is_active", vehicle.is_active)

    if new_plate != vehicle.plate:
        dup_company = await db.scalar(
            select(CreditVehicle.id).where(
                CreditVehicle.credit_company_id == vehicle.credit_company_id,
                CreditVehicle.plate == new_plate,
                CreditVehicle.id != vehicle.id,
            )
        )
        if dup_company is not None:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=f"Bu plaka bu şirkette zaten kayıtlı: {new_plate}",
            )

    if new_active:
        dup_active = await db.scalar(
            select(CreditVehicle.id).where(
                CreditVehicle.station_id == vehicle.station_id,
                CreditVehicle.plate == new_plate,
                CreditVehicle.is_active.is_(True),
                CreditVehicle.id != vehicle.id,
            )
        )
        if dup_active is not None:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=f"Bu plaka bu istasyonda başka bir kurumsal hesapta zaten aktif: {new_plate}",
            )

    for key, value in updates.items():
        setattr(vehicle, key, value)

    try:
        await db.flush()
    except IntegrityError:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Plaka çakışması: {new_plate}",
        ) from None

    await db.refresh(vehicle)
    return _vehicle_response(vehicle)


@router.post(
    "/companies/{company_id}/drivers",
    response_model=DriverResponse,
    status_code=status.HTTP_201_CREATED,
)
async def add_company_driver(
    company_id: uuid.UUID,
    data: DriverCreate,
    current_user: User = Depends(require_role(*credit_access.MANAGER_ROLES)),
    db: AsyncSession = Depends(get_db),
):
    """Şirkete yeni yetkili sürücü ekler; pasif aynı T.C. varsa yeniden aktifleştirir."""
    company = await credit_access.get_credit_company(db, current_user, company_id, lock=True)
    tc_hash = pii.tc_blind_index(data.tc_no)
    tc_encrypted = pii.encrypt_tc(data.tc_no)

    existing = await db.scalar(
        select(CreditDriver).where(
            CreditDriver.credit_company_id == company.id,
            CreditDriver.tc_hash == tc_hash,
        )
    )
    if existing is not None:
        if existing.is_active:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Bu T.C. kimlik numarası ile kayıtlı aktif bir sürücü zaten var",
            )
        existing.is_active = True
        existing.full_name = data.full_name
        existing.phone = data.phone
        existing.tc_encrypted = tc_encrypted
        driver = existing
    else:
        driver = CreditDriver(
            credit_company_id=company.id,
            full_name=data.full_name,
            tc_encrypted=tc_encrypted,
            tc_hash=tc_hash,
            phone=data.phone,
            is_active=True,
        )
        db.add(driver)

    try:
        await db.flush()
    except IntegrityError:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Bu T.C. kimlik numarası bu şirkette zaten kayıtlı",
        ) from None

    await db.refresh(driver)
    return _driver_response(driver)


@router.patch("/drivers/{driver_id}", response_model=DriverResponse)
async def update_driver(
    driver_id: uuid.UUID,
    data: DriverUpdate,
    current_user: User = Depends(require_role(*credit_access.MANAGER_ROLES)),
    db: AsyncSession = Depends(get_db),
):
    """Kayıtlı sürücü bilgilerini günceller."""
    driver = await db.scalar(
        select(CreditDriver)
        .join(CreditCompany, CreditDriver.credit_company_id == CreditCompany.id)
        .where(
            CreditDriver.id == driver_id,
            CreditCompany.station_id.in_(credit_access.accessible_station_ids(current_user)),
        )
        .with_for_update(of=CreditDriver)
    )
    if driver is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Sürücü kaydı bulunamadı veya erişim yetkiniz yok",
        )

    updates = data.model_dump(exclude_unset=True)
    if "full_name" in updates and updates["full_name"] is None:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Sürücü adı boş bırakılamaz",
        )
    if "is_active" in updates and updates["is_active"] is None:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="is_active alanı boş bırakılamaz",
        )

    if "tc_no" in updates:
        tc_val = updates.pop("tc_no")
        if tc_val is None:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="T.C. kimlik numarası boş bırakılamaz",
            )
        new_hash = pii.tc_blind_index(tc_val)
        dup = await db.scalar(
            select(CreditDriver.id).where(
                CreditDriver.credit_company_id == driver.credit_company_id,
                CreditDriver.tc_hash == new_hash,
                CreditDriver.id != driver.id,
            )
        )
        if dup is not None:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Bu T.C. kimlik numarası bu şirkette başka bir sürücüye ait",
            )
        driver.tc_hash = new_hash
        driver.tc_encrypted = pii.encrypt_tc(tc_val)

    for key, value in updates.items():
        setattr(driver, key, value)

    try:
        await db.flush()
    except IntegrityError:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Bu T.C. kimlik numarası bu şirkette zaten kayıtlı",
        ) from None

    await db.refresh(driver)
    return _driver_response(driver)


# ════════════════════════════════════════════════════════════════
# SATIŞ ÖNCESİ KURUMSAL DOĞRULAMA
# ════════════════════════════════════════════════════════════════


@router.post("/verify", response_model=VerifyResponse)
async def verify_corporate_sale(
    body: VerifyRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Plaka, şirket yetkisi ve sürücü T.C. kimlik eşleşmesini satış öncesi kontrol eder."""
    station_id = await credit_access.resolve_station_id(db, current_user, body.station_id)
    res = await credit_verification.verify_corporate(
        db,
        station_id=station_id,
        plate=body.plate,
        driver_id=body.driver_id,
        driver_tc=body.driver_tc,
        amount=body.amount,
    )
    active_drivers = (
        [_driver_response(d) for d in sorted(res.company.drivers, key=lambda x: x.full_name.lower()) if d.is_active]
        if res.company is not None
        else []
    )
    return VerifyResponse(
        plate=res.plate or body.plate,
        authorized=res.authorized,
        identity_verified=res.identity_verified,
        reasons=res.reasons,
        company=(
            VerifyCompany(
                id=res.company.id,
                name=res.company.name,
                is_authorized=res.company.is_authorized,
            )
            if res.company is not None
            else None
        ),
        vehicle=_vehicle_response(res.vehicle) if res.vehicle is not None else None,
        drivers=active_drivers,
        matched_driver=_driver_response(res.driver) if res.driver is not None else None,
    )


# ════════════════════════════════════════════════════════════════
# BİREYSEL MÜŞTERİLER
# ════════════════════════════════════════════════════════════════


@router.get("/customers", response_model=list[CreditCustomerSummary])
async def list_customers(
    station_id: uuid.UUID | None = Query(None),
    search: str | None = Query(None, max_length=120),
    active: bool | None = Query(None),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Kapsamdaki bireysel veresiye müşterilerini listeler (T.C. ile sorgu parametresi alınmaz)."""
    scoped_station = await credit_access.optional_station_filter(db, current_user, station_id)
    query = select(CreditCustomer).where(
        CreditCustomer.station_id.in_(credit_access.accessible_station_ids(current_user))
    )
    if scoped_station is not None:
        query = query.where(CreditCustomer.station_id == scoped_station)
    if active is not None:
        query = query.where(CreditCustomer.is_active == active)

    if search and search.strip():
        term = search.strip()
        plate_term = _safe_plate_search(term)
        conditions = [
            CreditCustomer.full_name.ilike(f"%{term}%"),
            CreditCustomer.phone.ilike(f"%{term}%"),
        ]
        if plate_term:
            conditions.append(CreditCustomer.plate.ilike(f"%{plate_term}%"))
        query = query.where(or_(*conditions))

    query = query.order_by(CreditCustomer.full_name.asc())
    customers = (await db.execute(query)).scalars().all()

    totals_map: dict[uuid.UUID, credit_ledger.AccountTotals] = {}
    manager = credit_access.is_manager(current_user)
    if manager and customers:
        totals_map = await credit_ledger.account_totals(
            db, CreditAccountType.INDIVIDUAL, [c.id for c in customers]
        )

    results: list[CreditCustomerSummary] = []
    for c in customers:
        bal = (
            credit_ledger.to_balance_schema(
                totals_map.get(c.id, credit_ledger.AccountTotals()),
                credit_limit=c.credit_limit,
            )
            if manager
            else None
        )
        results.append(_customer_summary(c, bal))
    return results


@router.post("/customers/lookup", response_model=CreditCustomerSummary | None)
async def lookup_customer_by_tc(
    body: CustomerLookupRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """T.C. kimlik numarası kör indeksiyle istasyonda bireysel müşteri arar."""
    station_id = await credit_access.resolve_station_id(db, current_user, body.station_id)
    tc_hash = pii.tc_blind_index(body.tc_no)
    customer = await db.scalar(
        select(CreditCustomer).where(
            CreditCustomer.station_id == station_id,
            CreditCustomer.tc_hash == tc_hash,
        )
    )
    if customer is None:
        return None
    bal = await _customer_balance(db, current_user, customer)
    return _customer_summary(customer, bal)


@router.post(
    "/customers",
    response_model=CreditCustomerDetail,
    status_code=status.HTTP_201_CREATED,
)
async def create_customer(
    data: CreditCustomerCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Yeni bireysel veresiye müşterisi oluşturur (müdür veya kasiyer)."""
    if current_user.role == UserRole.CASHIER and data.credit_limit is not None:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Kasiyer bireysel müşteri için kredi limiti belirleyemez",
        )

    station_id = await credit_access.resolve_station_id(db, current_user, data.station_id)
    tc_hash = pii.tc_blind_index(data.tc_no)

    dup = await db.scalar(
        select(CreditCustomer.id).where(
            CreditCustomer.station_id == station_id,
            CreditCustomer.tc_hash == tc_hash,
        )
    )
    if dup is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Bu T.C. kimlik numarasıyla kayıtlı bir müşteri zaten var",
        )

    customer = CreditCustomer(
        station_id=station_id,
        full_name=data.full_name,
        tc_encrypted=pii.encrypt_tc(data.tc_no),
        tc_hash=tc_hash,
        phone=data.phone,
        plate=data.plate,
        credit_limit=data.credit_limit,
        notes=data.notes,
        is_active=True,
        created_by=current_user.id,
    )
    db.add(customer)
    try:
        await db.flush()
    except IntegrityError:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Bu T.C. kimlik numarasıyla kayıtlı bir müşteri zaten var",
        ) from None

    await db.refresh(customer)
    bal = (
        credit_ledger.to_balance_schema(
            credit_ledger.AccountTotals(), credit_limit=customer.credit_limit
        )
        if credit_access.is_manager(current_user)
        else None
    )
    return _customer_detail(customer, bal)


@router.get("/customers/{customer_id}", response_model=CreditCustomerDetail)
async def get_customer(
    customer_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Bireysel veresiye müşterisi detayını döndürür."""
    customer = await credit_access.get_credit_customer(db, current_user, customer_id)
    bal = await _customer_balance(db, current_user, customer)
    return _customer_detail(customer, bal)


@router.patch("/customers/{customer_id}", response_model=CreditCustomerDetail)
async def update_customer(
    customer_id: uuid.UUID,
    data: CreditCustomerUpdate,
    current_user: User = Depends(require_role(*credit_access.MANAGER_ROLES)),
    db: AsyncSession = Depends(get_db),
):
    """Bireysel müşteri bilgilerini ve aktiflik durumunu günceller (yalnızca yönetici)."""
    customer = await credit_access.get_credit_customer(db, current_user, customer_id, lock=True)
    updates = data.model_dump(exclude_unset=True)

    for required in ("full_name", "phone", "is_active"):
        if required in updates and updates[required] is None:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail=f"{required} alanı boş bırakılamaz",
            )

    for key, value in updates.items():
        setattr(customer, key, value)

    await db.flush()
    await db.refresh(customer)
    bal = await _customer_balance(db, current_user, customer)
    return _customer_detail(customer, bal)
