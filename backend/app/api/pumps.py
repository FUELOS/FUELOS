"""
FuelOS — Pump API.
İstasyona bağlı pompa yönetimi (Role & Multi-tenant korumalı).
"""
from typing import List
import uuid
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from app.database import get_db
from app.auth.dependencies import get_current_user
from app.models.user import User
from app.models.pump import Pump
from app.models.station import Station
from app.models.base import UserRole

router = APIRouter(prefix="/api/pumps", tags=["Pompalar"])


class PumpCreate(BaseModel):
    station_id: str
    pump_number: int
    label: str
    fuel_types: str = "Motorin,Benzin"


class PumpResponse(BaseModel):
    id: str
    station_id: str
    pump_number: int
    label: str
    fuel_types: str
    is_active: bool

    class Config:
        from_attributes = True


@router.get("/station/{station_id}", response_model=List[PumpResponse])
async def get_pumps_by_station(
    station_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    # İstasyon şirket kontrolü
    st_res = await db.execute(
        select(Station).where(
            Station.id == uuid.UUID(station_id),
            Station.company_id == current_user.company_id,
        )
    )
    station = st_res.scalar_one_or_none()
    if not station:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="İstasyon bulunamadı veya erişim yetkiniz yok")

    if current_user.role in (UserRole.STATION_MANAGER, UserRole.CASHIER):
        if str(current_user.station_id) != str(station_id):
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Yalnızca kendi istasyonunuzun pompalarını görebilirsiniz")

    result = await db.execute(
        select(Pump)
        .where(Pump.station_id == uuid.UUID(station_id), Pump.is_active == True)
        .order_by(Pump.pump_number)
    )
    pumps = result.scalars().all()
    return [
        PumpResponse(
            id=str(p.id),
            station_id=str(p.station_id),
            pump_number=p.pump_number,
            label=p.label,
            fuel_types=p.fuel_types,
            is_active=p.is_active,
        )
        for p in pumps
    ]


@router.post("/", response_model=PumpResponse)
async def create_pump(
    data: PumpCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    # Yalnızca SuperAdmin ve İstasyon Müdürü pompa oluşturabilir
    if current_user.role not in (UserRole.SUPER_ADMIN, UserRole.STATION_MANAGER):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Pompa ekleme yetkiniz bulunmamaktadır")

    st_res = await db.execute(
        select(Station).where(
            Station.id == uuid.UUID(data.station_id),
            Station.company_id == current_user.company_id,
        )
    )
    station = st_res.scalar_one_or_none()
    if not station:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="İstasyon bulunamadı veya şirketinizle uyuşmuyor")

    if current_user.role == UserRole.STATION_MANAGER and str(current_user.station_id) != str(data.station_id):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Yalnızca kendi istasyonunuza pompa ekleyebilirsiniz")

    pump = Pump(
        station_id=uuid.UUID(data.station_id),
        pump_number=data.pump_number,
        label=data.label,
        fuel_types=data.fuel_types,
    )
    db.add(pump)
    await db.commit()
    await db.refresh(pump)
    return PumpResponse(
        id=str(pump.id),
        station_id=str(pump.station_id),
        pump_number=pump.pump_number,
        label=pump.label,
        fuel_types=pump.fuel_types,
        is_active=pump.is_active,
    )


@router.delete("/{pump_id}")
async def delete_pump(
    pump_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    # Yalnızca SuperAdmin ve İstasyon Müdürü pompa silebilir
    if current_user.role not in (UserRole.SUPER_ADMIN, UserRole.STATION_MANAGER):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Pompa silme yetkiniz bulunmamaktadır")

    result = await db.execute(
        select(Pump, Station)
        .join(Station, Pump.station_id == Station.id)
        .where(Pump.id == uuid.UUID(pump_id), Station.company_id == current_user.company_id)
    )
    row = result.first()
    if not row:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Pompa bulunamadı veya erişim yetkiniz yok")

    pump, station = row
    if current_user.role == UserRole.STATION_MANAGER and str(current_user.station_id) != str(station.id):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Yalnızca kendi istasyonunuzdaki pompayı silebilirsiniz")

    pump.is_active = False
    await db.commit()
    return {"message": "Pompa deaktif edildi"}
