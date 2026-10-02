"""
FuelOS — SuperAdmin Genel Dashboard API.
Tüm istasyonların anlık durumu, aktif vardiyalar, gelir özeti.
"""
from datetime import datetime, timezone
from typing import List
from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession
from app.database import get_db
from app.auth.dependencies import get_current_user
from app.models.user import User
from app.models.station import Station
from app.models.shift import Shift
from app.models.transaction import Transaction
from app.models.base import ShiftStatus

router = APIRouter(prefix="/api/admin", tags=["SuperAdmin Dashboard"])


class StationSummary(BaseModel):
    station_id: str
    station_name: str
    station_code: str
    city: str
    is_active: bool
    active_shift_count: int
    today_revenue: float
    today_transaction_count: int
    worker_count: int


class AdminDashboardResponse(BaseModel):
    total_stations: int
    active_stations: int
    total_active_shifts: int
    total_today_revenue: float
    total_today_transactions: int
    stations: List[StationSummary]


@router.get("/dashboard", response_model=AdminDashboardResponse)
async def get_admin_dashboard(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    today_start = datetime.now(timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0)

    # Tüm istasyonları al
    stations_result = await db.execute(select(Station))
    stations = stations_result.scalars().all()

    station_summaries = []
    total_today_revenue = 0.0
    total_today_transactions = 0
    total_active_shifts = 0
    active_stations = 0

    for station in stations:
        # Aktif vardiya sayısı
        shifts_result = await db.execute(
            select(func.count(Shift.id)).where(
                Shift.station_id == station.id,
                Shift.status == ShiftStatus.OPEN,
            )
        )
        active_shift_count = shifts_result.scalar() or 0

        # Bugünkü ciro
        revenue_result = await db.execute(
            select(func.coalesce(func.sum(Transaction.amount), 0)).where(
                Transaction.station_id == station.id,
                Transaction.transaction_time >= today_start,
            )
        )
        today_revenue = float(revenue_result.scalar() or 0)

        # Bugünkü işlem sayısı
        tx_count_result = await db.execute(
            select(func.count(Transaction.id)).where(
                Transaction.station_id == station.id,
                Transaction.transaction_time >= today_start,
            )
        )
        today_tx_count = tx_count_result.scalar() or 0

        # İstasyondaki çalışan sayısı
        worker_result = await db.execute(
            select(func.count(User.id)).where(
                User.station_id == station.id,
                User.is_active == True,
            )
        )
        worker_count = worker_result.scalar() or 0

        total_today_revenue += today_revenue
        total_today_transactions += today_tx_count
        total_active_shifts += active_shift_count
        if station.is_active:
            active_stations += 1

        station_summaries.append(
            StationSummary(
                station_id=str(station.id),
                station_name=station.name,
                station_code=station.code,
                city=station.city,
                is_active=station.is_active,
                active_shift_count=active_shift_count,
                today_revenue=today_revenue,
                today_transaction_count=today_tx_count,
                worker_count=worker_count,
            )
        )

    return AdminDashboardResponse(
        total_stations=len(stations),
        active_stations=active_stations,
        total_active_shifts=total_active_shifts,
        total_today_revenue=total_today_revenue,
        total_today_transactions=total_today_transactions,
        stations=station_summaries,
    )
