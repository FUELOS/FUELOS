"""
FuelOS — Pump API.
İstasyona bağlı pompa yönetimi.
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
    result = await db.execute(select(Pump).where(Pump.id == uuid.UUID(pump_id)))
    pump = result.scalar_one_or_none()
    if not pump:
        raise HTTPException(status_code=404, detail="Pompa bulunamadı")
    pump.is_active = False
    await db.commit()
    return {"message": "Pompa deaktif edildi"}
