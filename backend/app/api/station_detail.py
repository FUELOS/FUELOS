"""
FuelOS — İstasyon Detay API.
İşçi bazlı, yakıt türü bazlı satış ve araç sayısı.
"""
from datetime import datetime, timezone
from typing import List
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
import uuid
from app.database import get_db
from app.auth.dependencies import get_current_user
from app.models.user import User
from app.models.station import Station
from app.models.shift import Shift
from app.models.transaction import Transaction
from app.models.base import ShiftStatus

router = APIRouter(prefix="/api/station-detail", tags=["İstasyon Detay"])


class FuelBreakdown(BaseModel):
    fuel_type: str
    liters: float
    revenue: float
    vehicle_count: int


class WorkerDetailStats(BaseModel):
    worker_name: str
    worker_avatar: str | None
    shift_id: str
    pump_label: str | None
    fuel_breakdown: List[FuelBreakdown]
    total_liters: float
    total_revenue: float
    total_vehicles: int


class StationDetailResponse(BaseModel):
    station_id: str
    station_name: str
    station_code: str
    city: str
    workers: List[WorkerDetailStats]
    grand_total_liters: float
    grand_total_revenue: float
    grand_total_vehicles: int


@router.get("/{station_id}", response_model=StationDetailResponse)
async def get_station_detail(
    station_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    # İstasyon
    station_result = await db.execute(
        select(Station).where(Station.id == uuid.UUID(station_id))
    )
    station = station_result.scalar_one_or_none()
    if not station:
        raise HTTPException(status_code=404, detail="İstasyon bulunamadı")

    # Bugün açık vardiyalar
    shifts_result = await db.execute(
        select(Shift).where(
            Shift.station_id == station.id,
            Shift.status == ShiftStatus.OPEN,
        )
    )
    shifts = shifts_result.scalars().all()

    workers = []
    grand_liters = 0.0
    grand_revenue = 0.0
    grand_vehicles = 0

    for shift in shifts:
        # Bu vardiyaya ait işlemleri getir
        txs_result = await db.execute(
            select(Transaction).where(Transaction.shift_id == shift.id)
        )
        txs = txs_result.scalars().all()

        # Yakıt türü bazlı grupla
        fuel_map: dict = {}
        for tx in txs:
            ft = tx.fuel_type or "Diğer"
            if ft not in fuel_map:
                fuel_map[ft] = {"liters": 0.0, "revenue": 0.0, "vehicles": 0}
            fuel_map[ft]["liters"] += float(tx.liters or 0)
            fuel_map[ft]["revenue"] += float(tx.amount or 0)
            fuel_map[ft]["vehicles"] += 1  # Her tx = 1 araç

        fuel_breakdown = [
            FuelBreakdown(
                fuel_type=ft,
                liters=v["liters"],
                revenue=v["revenue"],
                vehicle_count=v["vehicles"],
            )
            for ft, v in fuel_map.items()
        ]

        total_liters = sum(v["liters"] for v in fuel_map.values())
        total_revenue = sum(v["revenue"] for v in fuel_map.values())
        total_vehicles = sum(v["vehicles"] for v in fuel_map.values())

        # Pompa etiketi
        pump_label = None
        if shift.pump_id:
            from app.models.pump import Pump
            pump_result = await db.execute(
                select(Pump).where(Pump.id == shift.pump_id)
            )
            pump = pump_result.scalar_one_or_none()
            if pump:
                pump_label = pump.label

        worker_name = shift.worker_name or "İsimsiz İşçi"

        grand_liters += total_liters
        grand_revenue += total_revenue
        grand_vehicles += total_vehicles

        workers.append(
            WorkerDetailStats(
                worker_name=worker_name,
                worker_avatar=shift.worker_avatar,
                shift_id=str(shift.id),
                pump_label=pump_label,
                fuel_breakdown=fuel_breakdown,
                total_liters=total_liters,
                total_revenue=total_revenue,
                total_vehicles=total_vehicles,
            )
        )

    return StationDetailResponse(
        station_id=str(station.id),
        station_name=station.name,
        station_code=station.code,
        city=station.city,
        workers=workers,
        grand_total_liters=grand_liters,
        grand_total_revenue=grand_revenue,
        grand_total_vehicles=grand_vehicles,
    )
