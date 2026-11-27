"""
FuelOS — Veresiye modülü erişim (kiracı / istasyon kapsamı) yardımcıları.

Kapsam kuralları mevcut API ile aynıdır:
- SuperAdmin       → kendi şirketine (kiracı) ait tüm istasyonlar
- StationManager   → yalnızca kendi istasyonu
- Cashier          → yalnızca kendi istasyonu (sınırlı işlemler)

Kapsam dışındaki kayıtlar için varlığı sızdırmamak adına 404 döndürülür.
"""

from __future__ import annotations

import uuid

from fastapi import HTTPException, status
from sqlalchemy import Select, select
from sqlalchemy.ext.asyncio import AsyncSession
from app.config import get_settings

from app.models.base import UserRole
from app.models.credit import CreditCompany, CreditCustomer, CreditSale
from app.models.station import Station
from app.models.user import User

MANAGER_ROLES = (UserRole.SUPER_ADMIN, UserRole.STATION_MANAGER)
ALL_ROLES = (UserRole.SUPER_ADMIN, UserRole.STATION_MANAGER, UserRole.CASHIER)


def require_individual_credit_enabled() -> None:
    if not get_settings().INDIVIDUAL_CREDIT_ENABLED:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Yeni bireysel veresiye işlemleri kapalı",
        )


def is_manager(user: User) -> bool:
    """Borç bakiyesi, ekstre ve tahsilat gibi yönetici verilerini görebilir mi."""
    return user.role in MANAGER_ROLES


def accessible_station_ids(user: User) -> Select:
    """Kullanıcının erişebildiği istasyon kimliklerini seçen alt sorgu."""
    query = select(Station.id).where(Station.company_id == user.company_id)
    if user.role != UserRole.SUPER_ADMIN:
        query = query.where(Station.id == user.station_id)
    return query


async def resolve_station_id(
    db: AsyncSession, user: User, requested: uuid.UUID | None,
) -> uuid.UUID:
    """
    Yazma işlemlerinde hedef istasyonu belirler.

    Müdür/Kasiyer: her zaman kendi istasyonu (istekteki değer yok sayılır).
    SuperAdmin: `requested` zorunludur ve kendi şirketine ait olmalıdır.
    """
    if user.role != UserRole.SUPER_ADMIN:
        if user.station_id is None:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Hesabınız bir istasyona bağlı değil",
            )
        return user.station_id

    if requested is None:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="İstasyon seçimi zorunludur (station_id)",
        )
    station_id = await db.scalar(
        select(Station.id).where(Station.id == requested, Station.company_id == user.company_id)
    )
    if station_id is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Belirtilen istasyon bulunamadı veya şirketinize ait değil",
        )
    return station_id


async def optional_station_filter(
    db: AsyncSession, user: User, requested: uuid.UUID | None,
) -> uuid.UUID | None:
    """
    Listeleme filtreleri için: Müdür/Kasiyer'de kendi istasyonuna zorlar;
    SuperAdmin'de `requested` verilmişse sahipliğini doğrular, verilmemişse None
    (şirketin tüm istasyonları) döner.
    """
    if user.role != UserRole.SUPER_ADMIN:
        return await resolve_station_id(db, user, None)
    if requested is None:
        return None
    return await resolve_station_id(db, user, requested)


async def get_credit_company(
    db: AsyncSession, user: User, company_id: uuid.UUID, *, lock: bool = False,
) -> CreditCompany:
    """Kapsam içindeki kurumsal veresiye şirketini getirir; yoksa 404."""
    query = select(CreditCompany).where(
        CreditCompany.id == company_id,
        CreditCompany.station_id.in_(accessible_station_ids(user)),
    )
    if lock:
        query = query.with_for_update()
    company = await db.scalar(query)
    if company is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Veresiye şirketi bulunamadı veya erişim yetkiniz yok",
        )
    return company


async def get_credit_customer(
    db: AsyncSession, user: User, customer_id: uuid.UUID, *, lock: bool = False,
) -> CreditCustomer:
    """Kapsam içindeki bireysel veresiye müşterisini getirir; yoksa 404."""
    query = select(CreditCustomer).where(
        CreditCustomer.id == customer_id,
        CreditCustomer.station_id.in_(accessible_station_ids(user)),
    )
    if lock:
        query = query.with_for_update()
    customer = await db.scalar(query)
    if customer is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Veresiye müşterisi bulunamadı veya erişim yetkiniz yok",
        )
    return customer


async def get_credit_sale(
    db: AsyncSession, user: User, sale_id: uuid.UUID, *, lock: bool = False,
) -> CreditSale:
    """
    Kapsam içindeki veresiye satış kaydını getirir; yoksa 404.
    Kasiyer yalnızca kendi oluşturduğu kayıtlara erişebilir.
    """
    query = select(CreditSale).where(
        CreditSale.id == sale_id,
        CreditSale.station_id.in_(accessible_station_ids(user)),
    )
    if user.role == UserRole.CASHIER:
        query = query.where(CreditSale.created_by == user.id)
    if lock:
        # joined ilişkiler (LEFT OUTER JOIN) nedeniyle yalnızca ana satır kilitlenir.
        query = query.with_for_update(of=CreditSale)
    sale = await db.scalar(query)
    if sale is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Veresiye satış kaydı bulunamadı veya erişim yetkiniz yok",
        )
    return sale
