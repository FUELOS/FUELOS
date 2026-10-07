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
    subscription_status: str = "active"
    subscription_plan: str = "Pro SaaS"
    subscription_expires_at: datetime | None = None
    monthly_fee: float = 4990.00


class AdminDashboardResponse(BaseModel):
    total_stations: int
    active_stations: int
    total_active_shifts: int
    total_today_revenue: float
    total_today_transactions: int
    total_monthly_subscription: float = 0.0
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

    total_monthly_subscription = 0.0

    for station in stations:
        # Lisans durumu kontrolü (vade geçmişse past_due/suspended tespiti)
        sub_status = getattr(station, "subscription_status", "active") or "active"
        sub_plan = getattr(station, "subscription_plan", "Pro SaaS") or "Pro SaaS"
        sub_expires = getattr(station, "subscription_expires_at", None)
        fee = float(getattr(station, "monthly_fee", 4990.00) or 4990.00)

        # Eğer vade geçmişse ve aktifse -> past_due'ya çevir
        if sub_expires and sub_expires < datetime.now(timezone.utc) and sub_status == "active":
            sub_status = "past_due"

        if sub_status == "active":
            total_monthly_subscription += fee

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
        if station.is_active and sub_status != "suspended":
            active_stations += 1

        station_summaries.append(
            StationSummary(
                station_id=str(station.id),
                station_name=station.name,
                station_code=station.code,
                city=station.city,
                is_active=station.is_active and sub_status != "suspended",
                active_shift_count=active_shift_count,
                today_revenue=today_revenue,
                today_transaction_count=today_tx_count,
                worker_count=worker_count,
                subscription_status=sub_status,
                subscription_plan=sub_plan,
                subscription_expires_at=sub_expires,
                monthly_fee=fee,
            )
        )

    return AdminDashboardResponse(
        total_stations=len(stations),
        active_stations=active_stations,
        total_active_shifts=total_active_shifts,
        total_today_revenue=total_today_revenue,
        total_today_transactions=total_today_transactions,
        total_monthly_subscription=total_monthly_subscription,
        stations=station_summaries,
    )
