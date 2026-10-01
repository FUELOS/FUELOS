"""
FuelOS — Dashboard API Router.
Görsel 1 ve Görsel 2 Akıllı Vardiya Mutabakatı verilerini döndürür:
- Çalışan her işçinin Litre, Nakit, POS, FAST dağılımı (Görsel 1)
- Ürün bazlı Benzin, Motorin, LPG satış ve litre kırılımı (Görsel 2)
- İstasyon açılış kasası ve beklenen kasa mutabakat durumu
"""

import uuid
from datetime import datetime, timezone, date
from decimal import Decimal

from fastapi import APIRouter, Depends, Query
from sqlalchemy import select, func, and_, cast, Date, case
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
    TransactionType,
)
from app.auth.dependencies import get_current_user

from pydantic import BaseModel

router = APIRouter(prefix="/api/dashboard", tags=["Dashboard"])


# ─── Response Modelleri ───

class WorkerShiftStats(BaseModel):
    """Her bir vardiya işçisinin anlık satış karnesi (Görsel 1)."""
    shift_id: str
    user_id: str
    user_name: str
    avatar_url: str | None = None
    station_name: str
    start_time: datetime
    opening_cash: Decimal
    dispensed_liters: Decimal = Decimal("0.00")
    cash_sales: Decimal = Decimal("0.00")
    pos_sales: Decimal = Decimal("0.00")
    fast_sales: Decimal = Decimal("0.00")
    total_sales: Decimal = Decimal("0.00")

    model_config = {"from_attributes": True}


class ProductBreakdownItem(BaseModel):
    """Ürün bazlı satış detayı (Görsel 2 tablosu)."""
    product_name: str  # 'Benzin', 'Motorin', 'LPG'
    liters: Decimal = Decimal("0.00")
    cash_sales: Decimal = Decimal("0.00")
    pos_sales: Decimal = Decimal("0.00")
    fast_sales: Decimal = Decimal("0.00")
    total_sales: Decimal = Decimal("0.00")
    share_percent: float = 0.0


class DashboardResponse(BaseModel):
    """Dashboard ana mutabakat veri modeli."""
    # Üst Bilgiler
    active_station_name: str = "Tüm İstasyonlar"
    active_station_id: str | None = None
    current_date_str: str = ""
    shift_time_range: str = "06:00 - 14:00"

    # Mutabakat Kartları
    opening_cash: Decimal = Decimal("0.00")
    total_cash_sales: Decimal = Decimal("0.00")
    total_pos_sales: Decimal = Decimal("0.00")
    total_fast_sales: Decimal = Decimal("0.00")
    total_dispensed_liters: Decimal = Decimal("0.00")
    total_sales_revenue: Decimal = Decimal("0.00")

    # Kasa Eşitleme
    expected_cash: Decimal = Decimal("0.00")
    reconciliation_completed: bool = True

    # İşçi Bazlı Kartlar (Görsel 1)
    active_workers: list[WorkerShiftStats] = []

    # Ürün Bazlı Detay (Görsel 2)
    product_breakdown: list[ProductBreakdownItem] = []

    # Genel sayaçlar
    total_stations: int = 0
    total_users: int = 0


@router.get("", response_model=DashboardResponse)
async def get_dashboard(
    station_id: uuid.UUID | None = None,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    FuelOS Akıllı Vardiya Mutabakatı verileri.
    İşçi kartları, toplam satışlar, ürün kırılımı ve kasa dengesi.
    """
    today = datetime.now(timezone.utc).date()

    # ── İstasyon Filtresi ──
    if current_user.role == UserRole.SUPER_ADMIN:
        station_filter = Station.company_id == current_user.company_id
    elif current_user.role == UserRole.STATION_MANAGER:
        station_filter = Station.id == current_user.station_id
    else:
        station_filter = Station.id == current_user.station_id

    if station_id is not None:
        station_filter = and_(station_filter, Station.id == station_id)

    station_ids_query = select(Station.id).where(station_filter)

    # Seçili İstasyon İsmi
    active_st_name = "Tüm İstasyonlar"
    if station_id is not None:
        st_res = await db.execute(select(Station.name).where(Station.id == station_id))
        st_row = st_res.scalar_one_or_none()
        if st_row:
            active_st_name = st_row

    # ── 1. Açık Vardiyalar ve İlgili İşçiler ──
    active_shifts_query = (
        select(Shift, Station.name.label("station_name"), User.full_name.label("user_name"))
        .join(Station, Shift.station_id == Station.id)
        .join(User, Shift.user_id == User.id)
        .where(
            and_(
                Shift.station_id.in_(station_ids_query),
                Shift.status == ShiftStatus.OPEN,
            )
        )
        .order_by(Shift.start_time.asc())
    )
    active_shifts_res = await db.execute(active_shifts_query)
    active_shift_rows = active_shifts_res.all()

    # İşçilerin ID ve Shift ID'leri
    active_shift_ids = [row.Shift.id for row in active_shift_rows]

    # ── 2. Vardiya Başına Satış Kırılımları (İşçi Bazlı) ──
    worker_stats_map = {}
    for row in active_shift_rows:
        s = row.Shift
        worker_stats_map[s.id] = {
            "shift_id": str(s.id),
            "user_id": str(s.user_id),
            "user_name": row.user_name,
            "station_name": row.station_name,
            "start_time": s.start_time,
            "opening_cash": Decimal(str(s.opening_cash)),
            "dispensed_liters": Decimal("0.00"),
            "cash_sales": Decimal("0.00"),
            "pos_sales": Decimal("0.00"),
            "fast_sales": Decimal("0.00"),
            "total_sales": Decimal("0.00"),
        }

    if active_shift_ids:
        # Açık vardiyalardaki işlemleri hesapla
        tx_query = (
            select(
                Transaction.shift_id,
                func.coalesce(func.sum(Transaction.liters), 0).label("liters"),
                func.coalesce(func.sum(Transaction.amount), 0).label("total"),
                func.coalesce(
                    func.sum(case((Transaction.payment_method == PaymentMethod.CASH, Transaction.amount), else_=0)), 0
                ).label("cash"),
                func.coalesce(
                    func.sum(case((Transaction.payment_method == PaymentMethod.CREDIT_CARD, Transaction.amount), else_=0)), 0
                ).label("pos"),
                func.coalesce(
                    func.sum(case((Transaction.payment_method == PaymentMethod.EFT, Transaction.amount), else_=0)), 0
                ).label("fast"),
            )
            .where(Transaction.shift_id.in_(active_shift_ids))
            .group_by(Transaction.shift_id)
        )
        tx_res = await db.execute(tx_query)
        for tx_row in tx_res.all():
            if tx_row.shift_id in worker_stats_map:
                worker_stats_map[tx_row.shift_id]["dispensed_liters"] = Decimal(str(tx_row.liters))
                worker_stats_map[tx_row.shift_id]["total_sales"] = Decimal(str(tx_row.total))
                worker_stats_map[tx_row.shift_id]["cash_sales"] = Decimal(str(tx_row.cash))
                worker_stats_map[tx_row.shift_id]["pos_sales"] = Decimal(str(tx_row.pos))
                worker_stats_map[tx_row.shift_id]["fast_sales"] = Decimal(str(tx_row.fast))

    worker_list = [WorkerShiftStats(**data) for data in worker_stats_map.values()]

    # ── 3. Genel Toplamlar (Açık Vardiyalar Varsa Onlar, Yoksa Günlük) ──
    total_opening_cash = sum((w.opening_cash for w in worker_list), Decimal("0.00"))
    total_cash_sales = sum((w.cash_sales for w in worker_list), Decimal("0.00"))
    total_pos_sales = sum((w.pos_sales for w in worker_list), Decimal("0.00"))
    total_fast_sales = sum((w.fast_sales for w in worker_list), Decimal("0.00"))
    total_liters = sum((w.dispensed_liters for w in worker_list), Decimal("0.00"))
    total_revenue = sum((w.total_sales for w in worker_list), Decimal("0.00"))

    # Eğer açık vardiya yoksa son 24 saatin/günün verisini özetle
    if not worker_list:
        today_filter = and_(
            Transaction.station_id.in_(station_ids_query),
            cast(Transaction.transaction_time, Date) == today,
        )
        day_res = await db.execute(
            select(
                func.coalesce(func.sum(Transaction.liters), 0).label("liters"),
                func.coalesce(func.sum(Transaction.amount), 0).label("total"),
                func.coalesce(
                    func.sum(case((Transaction.payment_method == PaymentMethod.CASH, Transaction.amount), else_=0)), 0
                ).label("cash"),
                func.coalesce(
                    func.sum(case((Transaction.payment_method == PaymentMethod.CREDIT_CARD, Transaction.amount), else_=0)), 0
                ).label("pos"),
                func.coalesce(
                    func.sum(case((Transaction.payment_method == PaymentMethod.EFT, Transaction.amount), else_=0)), 0
                ).label("fast"),
            ).where(today_filter)
        )
        day_row = day_res.one()
        total_liters = Decimal(str(day_row.liters))
        total_revenue = Decimal(str(day_row.total))
        total_cash_sales = Decimal(str(day_row.cash))
        total_pos_sales = Decimal(str(day_row.pos))
        total_fast_sales = Decimal(str(day_row.fast))

    # Beklenen Kasa = Açılış Kasası + Toplam Nakit Satış
    expected_cash = total_opening_cash + total_cash_sales

    # ── 4. Ürün Bazlı Kırılım (Benzin, Motorin, LPG) ──
    fuel_filter = Transaction.station_id.in_(station_ids_query)
    if active_shift_ids:
        fuel_filter = and_(fuel_filter, Transaction.shift_id.in_(active_shift_ids))
    else:
        fuel_filter = and_(fuel_filter, cast(Transaction.transaction_time, Date) == today)

    prod_res = await db.execute(
        select(
            Transaction.fuel_type,
            func.coalesce(func.sum(Transaction.liters), 0).label("liters"),
            func.coalesce(func.sum(Transaction.amount), 0).label("total"),
            func.coalesce(
                func.sum(case((Transaction.payment_method == PaymentMethod.CASH, Transaction.amount), else_=0)), 0
            ).label("cash"),
            func.coalesce(
                func.sum(case((Transaction.payment_method == PaymentMethod.CREDIT_CARD, Transaction.amount), else_=0)), 0
            ).label("pos"),
            func.coalesce(
                func.sum(case((Transaction.payment_method == PaymentMethod.EFT, Transaction.amount), else_=0)), 0
            ).label("fast"),
        )
        .where(fuel_filter)
        .group_by(Transaction.fuel_type)
    )

    prod_map = {}
    for r in prod_res.all():
        name = r.fuel_type or "Diğer"
        # Standartlaştırma
        if "benzin" in name.lower() or "gasoline" in name.lower():
            key = "Benzin"
        elif "motorin" in name.lower() or "dizel" in name.lower() or "diesel" in name.lower():
            key = "Motorin"
        elif "lpg" in name.lower() or "otogaz" in name.lower():
            key = "LPG"
        else:
            key = name

        if key not in prod_map:
            prod_map[key] = {
                "product_name": key,
                "liters": Decimal("0.00"),
                "cash_sales": Decimal("0.00"),
                "pos_sales": Decimal("0.00"),
                "fast_sales": Decimal("0.00"),
                "total_sales": Decimal("0.00"),
                "share_percent": 0.0,
            }
        prod_map[key]["liters"] += Decimal(str(r.liters))
        prod_map[key]["cash_sales"] += Decimal(str(r.cash))
        prod_map[key]["pos_sales"] += Decimal(str(r.pos))
        prod_map[key]["fast_sales"] += Decimal(str(r.fast))
        prod_map[key]["total_sales"] += Decimal(str(r.total))

    # Eğer henüz satış yoksa standart kategorileri sıfır değerlerle başlat
    for std_name in ["Benzin", "Motorin", "LPG"]:
        if std_name not in prod_map:
            prod_map[std_name] = {
                "product_name": std_name,
                "liters": Decimal("0.00"),
                "cash_sales": Decimal("0.00"),
                "pos_sales": Decimal("0.00"),
                "fast_sales": Decimal("0.00"),
                "total_sales": Decimal("0.00"),
                "share_percent": 0.0,
            }

    # Litre Dağılım Yüzdesi Hesaplama
    total_prod_liters = sum((p["liters"] for p in prod_map.values()), Decimal("0.00"))
    if total_prod_liters > 0:
        for p in prod_map.values():
            p["share_percent"] = round(float((p["liters"] / total_prod_liters) * 100), 1)

    product_breakdown = [ProductBreakdownItem(**p) for p in prod_map.values()]

    # ── 5. İstasyon & Kullanıcı Sayıları ──
    st_count = await db.scalar(select(func.count(Station.id)).where(station_filter))
    us_count = await db.scalar(
        select(func.count(User.id)).where(User.company_id == current_user.company_id, User.is_active == True)
    )

    now_utc = datetime.now(timezone.utc)
    date_formatted = now_utc.strftime("%d %B %Y")

    return DashboardResponse(
        active_station_name=active_st_name,
        active_station_id=str(station_id) if station_id else None,
        current_date_str=date_formatted,
        shift_time_range="06:00 - 14:00",
        opening_cash=total_opening_cash,
        total_cash_sales=total_cash_sales,
        total_pos_sales=total_pos_sales,
        total_fast_sales=total_fast_sales,
        total_dispensed_liters=total_liters,
        total_sales_revenue=total_revenue,
        expected_cash=expected_cash,
        reconciliation_completed=True,
        active_workers=worker_list,
        product_breakdown=product_breakdown,
        total_stations=st_count or 0,
        total_users=us_count or 0,
    )
