"""
FuelOS — Station API Router.
İstasyon CRUD işlemleri.
- SuperAdmin: Tüm istasyonları yönetir (kendi şirketindeki).
- StationManager: Sadece kendi istasyonunu görür.
- Cashier: Sadece kendi istasyonunu görür.
"""

import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.user import User
from app.models.station import Station
from app.models.base import UserRole
from app.auth.dependencies import get_current_user, require_role
from app.schemas.station import StationCreate, StationUpdate, StationResponse

router = APIRouter(prefix="/api/stations", tags=["Stations"])


def _station_query_for_user(user: User):
    """Kullanıcının rolüne göre istasyon sorgusu oluşturur."""
    query = select(Station).where(Station.company_id == user.company_id)

    if user.role in (UserRole.STATION_MANAGER, UserRole.CASHIER):
        # Sadece kendi istasyonunu görebilir
        query = query.where(Station.id == user.station_id)

    return query


@router.get("", response_model=list[StationResponse])
async def list_stations(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    İstasyonları listeler.
    - SuperAdmin: Şirketteki tüm istasyonlar.
    - StationManager/Cashier: Sadece kendi istasyonu.
    """
    query = _station_query_for_user(current_user).order_by(Station.name)
    result = await db.execute(query)
    return result.scalars().all()


@router.get("/{station_id}", response_model=StationResponse)
async def get_station(
    station_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Tek istasyon detayı — kullanıcı yetki kontrolüyle."""
    query = _station_query_for_user(current_user).where(Station.id == station_id)
    result = await db.execute(query)
    station = result.scalar_one_or_none()

    if station is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="İstasyon bulunamadı veya erişim yetkiniz yok",
        )
    return station


@router.post("", response_model=StationResponse, status_code=status.HTTP_201_CREATED)
async def create_station(
    data: StationCreate,
    current_user: User = Depends(require_role(UserRole.SUPER_ADMIN)),
    db: AsyncSession = Depends(get_db),
):
    """Yeni istasyon oluşturur. Sadece SuperAdmin."""
    # İstasyon kodu benzersiz mi?
    existing = await db.execute(
        select(Station).where(Station.code == data.code)
    )
    if existing.scalar_one_or_none() is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Bu istasyon kodu zaten kayıtlı: {data.code}",
        )

    station = Station(
        company_id=current_user.company_id,
        **data.model_dump(),
    )
    db.add(station)
    await db.flush()
    await db.refresh(station)
    return station


@router.patch("/{station_id}", response_model=StationResponse)
async def update_station(
    station_id: uuid.UUID,
    data: StationUpdate,
    current_user: User = Depends(require_role(UserRole.SUPER_ADMIN)),
    db: AsyncSession = Depends(get_db),
):
    """İstasyon bilgilerini günceller. Sadece SuperAdmin."""
    result = await db.execute(
        select(Station).where(
            Station.id == station_id,
            Station.company_id == current_user.company_id,
        )
    )
    station = result.scalar_one_or_none()

    if station is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="İstasyon bulunamadı",
        )

    update_data = data.model_dump(exclude_unset=True)

    # Kod değişiyorsa benzersizlik kontrolü
    if "code" in update_data and update_data["code"] != station.code:
        existing = await db.execute(
            select(Station).where(Station.code == update_data["code"])
        )
        if existing.scalar_one_or_none() is not None:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=f"Bu istasyon kodu zaten kayıtlı: {update_data['code']}",
            )

    for field, value in update_data.items():
        setattr(station, field, value)

    await db.flush()
    await db.refresh(station)
    return station
