"""
FuelOS — Dashboard API Router.
Ana dashboard verilerini tek endpoint'te döndürür.
Günlük satış, aktif vardiyalar, finansal özet.
"""

import uuid
from datetime import datetime, timezone, date
from decimal import Decimal

from fastapi import APIRouter, Depends, Query
from sqlalchemy import select, func, and_, cast, Date
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.user import User
from app.models.station import Station
from app.models.shift import Shift
from app.models.transaction import Transaction
from app.models.base import (
    UserRole,
    ShiftStatus,
    PaymentMethod,
)
from app.auth.dependencies import get_current_user

from pydantic import BaseModel

router = APIRouter(prefix="/api/dashboard", tags=["Dashboard"])


# ─── Response Modelleri ───

class ActiveShiftInfo(BaseModel):
    """Aktif vardiya bilgisi."""
    shift_id: str
    station_name: str
    user_name: str
    start_time: datetime
    opening_cash: Decimal

    model_config = {"from_attributes": True}


class DashboardResponse(BaseModel):
    """Dashboard ana veri modeli."""
    # Günlük özet
    today_total_sales: Decimal = Decimal("0.00")
    today_total_liters: Decimal = Decimal("0.00")
    today_transaction_count: int = 0

    # Ödeme dağılımı
    today_cash: Decimal = Decimal("0.00")
    today_credit_card: Decimal = Decimal("0.00")
    today_eft: Decimal = Decimal("0.00")
    today_veresiye: Decimal = Decimal("0.00")

    # Vardiya bilgisi
    active_shift_count: int = 0
    active_shifts: list[ActiveShiftInfo] = []

    # Genel bilgi
    total_stations: int = 0
    total_users: int = 0


@router.get("", response_model=DashboardResponse)
async def get_dashboard(
    station_id: uuid.UUID | None = None,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Dashboard verileri — tek endpoint.
    Bugünkü satışlar, aktif vardiyalar, finansal özet.
    """
    today = datetime.now(timezone.utc).date()

    # ── Rol bazlı station filtreleri ──
    if current_user.role == UserRole.SUPER_ADMIN:
        station_filter = Station.company_id == current_user.company_id
    elif current_user.role == UserRole.STATION_MANAGER:
        station_filter = Station.id == current_user.station_id
    else:
        station_filter = Station.id == current_user.station_id

    # Ek istasyon filtresi
    if station_id is not None:
        station_filter = and_(station_filter, Station.id == station_id)

    # İlgili istasyon ID'leri
    station_ids_query = select(Station.id).where(station_filter)

    # ── 1. Bugünkü satışlar (UTC date) ──
    today_filter = and_(
        Transaction.station_id.in_(station_ids_query),
        cast(Transaction.transaction_time, Date) == today,
    )

    sales_result = await db.execute(
        select(
            func.coalesce(func.sum(Transaction.amount), 0).label("total"),
            func.coalesce(func.sum(Transaction.liters), 0).label("liters"),
            func.count(Transaction.id).label("count"),
        ).where(today_filter)
    )
    sales_row = sales_result.one()

    # ── 2. Ödeme dağılımı ──
    payment_result = await db.execute(
        select(
            Transaction.payment_method,
            func.coalesce(func.sum(Transaction.amount), 0).label("method_total"),
        ).where(today_filter).group_by(Transaction.payment_method)
    )
    payment_rows = {row.payment_method: row.method_total for row in payment_result.all()}

    # ── 3. Aktif vardiyalar ──
    active_shifts_result = await db.execute(
        select(Shift, Station.name.label("station_name"), User.full_name.label("user_name"))
        .join(Station, Shift.station_id == Station.id)
        .join(User, Shift.user_id == User.id)
        .where(
            and_(
                Shift.station_id.in_(station_ids_query),
                Shift.status == ShiftStatus.OPEN,
            )
        )
        .order_by(Shift.start_time.desc())
    )
    active_rows = active_shifts_result.all()

    active_shifts = [
        ActiveShiftInfo(
            shift_id=str(row.Shift.id),
            station_name=row.station_name,
            user_name=row.user_name,
            start_time=row.Shift.start_time,
            opening_cash=row.Shift.opening_cash,
        )
        for row in active_rows
    ]

    # ── 4. Genel istatistikler ──
    station_count_result = await db.execute(
        select(func.count(Station.id)).where(station_filter)
    )
    total_stations = station_count_result.scalar()

    user_count_result = await db.execute(
        select(func.count(User.id)).where(
            User.company_id == current_user.company_id,
            User.is_active == True,
        )
    )
    total_users = user_count_result.scalar()

    return DashboardResponse(
        today_total_sales=Decimal(str(sales_row.total)),
        today_total_liters=Decimal(str(sales_row.liters)),
        today_transaction_count=sales_row.count,
        today_cash=Decimal(str(payment_rows.get(PaymentMethod.CASH, 0))),
        today_credit_card=Decimal(str(payment_rows.get(PaymentMethod.CREDIT_CARD, 0))),
        today_eft=Decimal(str(payment_rows.get(PaymentMethod.EFT, 0))),
        today_veresiye=Decimal(str(payment_rows.get(PaymentMethod.VERESIYE, 0))),
        active_shift_count=len(active_shifts),
        active_shifts=active_shifts,
        total_stations=total_stations or 0,
        total_users=total_users or 0,
    )
