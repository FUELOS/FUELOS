"""
FuelOS — Pompa Satış Analizi API.
İstasyon pompaları için günlük satış özeti ve pompa + yakıt detay analizi.

İş kuralları:
- İstasyon Müdürü yalnızca kendi istasyonunu sorgulayabilir (istasyon ID'si
  oturumdaki kullanıcıdan zorlanır; istekten farklı bir istasyon gelirse 403).
- SuperAdmin tüm istasyonları sorgulayabilir. Cashier bu raporlara erişemez.
- Gün sınırları Türkiye saat dilimine (UTC+3) göre hesaplanır.
- pump_id'si NULL olan eski satışlar pompa analizine dahil edilmez.
- Toplamlar veritabanında GROUP BY ile hesaplanır; para/litre Decimal olarak döner.
"""

import uuid
from datetime import date, datetime, timedelta, timezone
from decimal import Decimal
from typing import Dict, List, Tuple

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.auth.dependencies import get_current_user
from app.models.base import PaymentMethod, TransactionType, UserRole
from app.models.pump import Pump
from app.models.station import Station
from app.models.transaction import Transaction
from app.models.user import User

router = APIRouter(prefix="/api/pump-analytics", tags=["Pompa Analizi"])

# Türkiye saat dilimi — kalıcı UTC+3 (yaz saati uygulaması yok).
TR_TZ = timezone(timedelta(hours=3), name="UTC+3")


# ─────────────────────────── Yardımcılar ───────────────────────────


def _parse_date(raw: str | None) -> date:
    """YYYY-MM-DD formatındaki tarihi parse eder; hatalıysa anlaşılır hata verir."""
    if raw is None or not raw.strip():
        return datetime.now(TR_TZ).date()
    try:
        return datetime.strptime(raw.strip(), "%Y-%m-%d").date()
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Geçersiz tarih formatı: YYYY-MM-DD bekleniyor (örn: 2026-10-11)",
        )


def _day_bounds(day: date) -> Tuple[datetime, datetime]:
    """Verilen Türkiye tarihinin [başlangıç, bitiş) UTC anlarını döndürür."""
    start = datetime(day.year, day.month, day.day, tzinfo=TR_TZ)
    return start, start + timedelta(days=1)


def _pump_fuel_list(pump: Pump) -> List[str]:
    """Pompanın satabildiği yakıt türlerini sıralı ve tekrarsız döndürür."""
    return list(dict.fromkeys(f.strip() for f in (pump.fuel_types or "").split(",") if f.strip()))


async def _resolve_station_for_user(
    db: AsyncSession,
    current_user: User,
    station_id: str,
) -> Station:
    """İstasyonı getirir ve rol bazlı erişimi zorlar.

    - SuperAdmin: tüm istasyonlar.
    - İstasyon Müdürü: yalnızca kendi istasyonu; farklı istasyon ID'si
      gönderilirse 403 (istasyon oturumdan zorlanır).
    - Cashier: bu raporlara erişemez (403).
    """
    try:
        station_uuid = uuid.UUID(station_id)
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Geçersiz istasyon ID'si",
        )

    if current_user.role == UserRole.STATION_MANAGER:
        if station_uuid != current_user.station_id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Bu rapor yalnızca kendi istasyonunuz için sorgulanabilir",
            )
    elif current_user.role != UserRole.SUPER_ADMIN:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Bu rapor için yetkiniz yok. Gerekli rol(ler): super_admin, station_manager",
        )

    result = await db.execute(select(Station).where(Station.id == station_uuid))
    station = result.scalar_one_or_none()
    if station is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="İstasyon bulunamadı")
    return station


async def _get_station_pump(
    db: AsyncSession, station: Station, pump_id: str
) -> Pump:
    """Pompayı getirir; yoksa veya istasyona ait değilse 404 döner."""
    try:
        pump_uuid = uuid.UUID(pump_id)
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Geçersiz pompa ID'si",
        )

    result = await db.execute(
        select(Pump).where(Pump.id == pump_uuid, Pump.station_id == station.id)
    )
    pump = result.scalar_one_or_none()
    if pump is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Pompa bulunamadı veya bu istasyona ait değil",
        )
    return pump


# ─────────────────────────── Şemalar ───────────────────────────


class PumpFuelSummary(BaseModel):
    """Pompa bazında tek bir yakıt türünün günlük özeti."""
    fuel_type: str
    liters: Decimal
    amount: Decimal
    transaction_count: int


class PumpDailySummary(BaseModel):
    """Tek bir pompanın günlük özeti."""
    pump_id: str
    pump_label: str
    is_active: bool
    fuel_breakdown: List[PumpFuelSummary]
    total_liters: Decimal
    total_amount: Decimal
    transaction_count: int


class StationPumpDailyResponse(BaseModel):
    """İstasyonun belirli bir günlük pompa satış özeti."""
    station_id: str
    station_name: str
    station_code: str
    date: str
    pumps: List[PumpDailySummary]


class HourlyBucket(BaseModel):
    """Saate göre satış kovası (0-23)."""
    hour: int
    liters: Decimal
    amount: Decimal
    transaction_count: int


class PaymentChannelSummary(BaseModel):
    """Tek bir ödeme kanalının tutar ve işlem sayısı."""
    amount: Decimal
    transaction_count: int


class PaymentBreakdown(BaseModel):
    """Ödeme kanalı dağılımı (tüm kanallar; satış olmasa bile 0 ile döner)."""
    cash: PaymentChannelSummary
    credit_card: PaymentChannelSummary
    eft: PaymentChannelSummary
    veresiye: PaymentChannelSummary


class PumpFuelDetailResponse(BaseModel):
    """Pompa + yakıt türü detay analizi."""
    station_id: str
    station_name: str
    pump_id: str
    pump_label: str
    fuel_type: str
    date: str
    total_liters: Decimal
    total_amount: Decimal
    transaction_count: int
    average_transaction_amount: Decimal
    hourly_distribution: List[HourlyBucket]
    payment_breakdown: PaymentBreakdown


# ─────────────────────────── Endpoint 1: Günlük Özet ───────────────────────────


@router.get("/daily-summary", response_model=StationPumpDailyResponse)
async def get_station_pump_daily_summary(
    station_id: str = Query(..., description="İstasyon ID'si"),
    date: str | None = Query(None, description="Tarih (YYYY-MM-DD, varsayılan bugün - Türkiye saati)"),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    İstasyondaki her pompanın günlük satış özeti (Türkiye günü).
    O gün satışı olmayan pompalar da 0 değerleriyle listelenir.
    Toplamlar veritabanında GROUP BY (pompa, yakıt türü) ile hesaplanır.
    """
    day = _parse_date(date)
    start, end = _day_bounds(day)
    station = await _resolve_station_for_user(db, current_user, station_id)

    # İstasyonun tüm pompaları (satış olmayanlar da listelenecek)
    pumps_result = await db.execute(
        select(Pump).where(Pump.station_id == station.id).order_by(Pump.pump_number)
    )
    pumps = pumps_result.scalars().all()

    # O günün akaryakıt satışları — pompa + yakıt türü bazında gruplama
    rows_result = await db.execute(
        select(
            Transaction.pump_id,
            Transaction.fuel_type,
            func.coalesce(func.sum(Transaction.liters), 0).label("liters"),
            func.coalesce(func.sum(Transaction.amount), 0).label("amount"),
            func.count(Transaction.id).label("tx_count"),
        ).where(
            Transaction.station_id == station.id,
            Transaction.type == TransactionType.FUEL,
            Transaction.pump_id.isnot(None),  # pump_id'si null eski satışlar hariç
            Transaction.transaction_time >= start,
            Transaction.transaction_time < end,
        ).group_by(Transaction.pump_id, Transaction.fuel_type)
    )
    rows = rows_result.all()

    # (pump_id, fuel_type) -> toplamlar
    grouped: Dict[Tuple[uuid.UUID, str], Tuple[Decimal, Decimal, int]] = {}
    for row in rows:
        fuel = (row.fuel_type or "").strip()
        grouped[(row.pump_id, fuel)] = (
            Decimal(str(row.liters)),
            Decimal(str(row.amount)),
            row.tx_count,
        )

    pump_summaries: List[PumpDailySummary] = []
    for pump in pumps:
        fuel_breakdown: List[PumpFuelSummary] = []
        pump_liters = Decimal("0.000")
        pump_amount = Decimal("0.00")
        pump_count = 0

        for fuel in _pump_fuel_list(pump):
            liters, amount, tx_count = grouped.get((pump.id, fuel), (Decimal("0"), Decimal("0"), 0))
            fuel_breakdown.append(
                PumpFuelSummary(
                    fuel_type=fuel,
                    liters=liters.quantize(Decimal("0.001")),
                    amount=amount.quantize(Decimal("0.01")),
                    transaction_count=tx_count,
                )
            )
            pump_liters += liters
            pump_amount += amount
            pump_count += tx_count

        pump_summaries.append(
            PumpDailySummary(
                pump_id=str(pump.id),
                pump_label=pump.label,
                is_active=pump.is_active,
                fuel_breakdown=fuel_breakdown,
                total_liters=pump_liters.quantize(Decimal("0.001")),
                total_amount=pump_amount.quantize(Decimal("0.01")),
                transaction_count=pump_count,
            )
        )

    return StationPumpDailyResponse(
        station_id=str(station.id),
        station_name=station.name,
        station_code=station.code,
        date=day.isoformat(),
        pumps=pump_summaries,
    )


# ─────────────────────────── Endpoint 2: Pompa + Yakıt Detayı ───────────────────────────


@router.get("/pump-detail", response_model=PumpFuelDetailResponse)
async def get_pump_fuel_detail(
    station_id: str = Query(..., description="İstasyon ID'si"),
    pump_id: str = Query(..., description="Pompa ID'si"),
    fuel_type: str = Query(..., description="Yakıt türü (pompanın satabildiği türlerden)"),
    date: str | None = Query(None, description="Tarih (YYYY-MM-DD, varsayılan bugün - Türkiye saati)"),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Tek pompa + yakıt türü için günlük detay analizi:
    toplamlar, ortalama işlem tutarı, saatlik dağılım (0-23, Türkiye saati)
    ve ödeme kanalı dağılımı. Toplamlar veritabanında GROUP BY ile hesaplanır.
    """
    day = _parse_date(date)
    start, end = _day_bounds(day)
    station = await _resolve_station_for_user(db, current_user, station_id)
    pump = await _get_station_pump(db, station, pump_id)

    fuel = fuel_type.strip()
    pump_fuels = _pump_fuel_list(pump)
    if fuel not in pump_fuels:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Bu pompa '{fuel}' yakıtını satmıyor (pompanın yakıtları: {', '.join(pump_fuels)})",
        )

    base_filters = [
        Transaction.station_id == station.id,
        Transaction.pump_id == pump.id,
        Transaction.type == TransactionType.FUEL,
        Transaction.fuel_type == fuel,
        Transaction.pump_id.isnot(None),
        Transaction.transaction_time >= start,
        Transaction.transaction_time < end,
    ]

    # 1) Genel toplamlar (tek satır)
    total_result = await db.execute(
        select(
            func.coalesce(func.sum(Transaction.liters), 0).label("liters"),
            func.coalesce(func.sum(Transaction.amount), 0).label("amount"),
            func.count(Transaction.id).label("tx_count"),
        ).where(*base_filters)
    )
    total_row = total_result.one()
    total_liters = Decimal(str(total_row.liters))
    total_amount = Decimal(str(total_row.amount))
    tx_count = total_row.tx_count
    avg_amount = (
        (total_amount / Decimal(tx_count)).quantize(Decimal("0.01"))
        if tx_count > 0
        else Decimal("0.00")
    )

    # 2) Saatlik dağılım — Türkiye saatine çevirip saat bazında grupla
    tr_hour = func.extract("hour", func.timezone("Europe/Istanbul", Transaction.transaction_time))
    hourly_result = await db.execute(
        select(
            tr_hour.label("hour"),
            func.coalesce(func.sum(Transaction.liters), 0).label("liters"),
            func.coalesce(func.sum(Transaction.amount), 0).label("amount"),
            func.count(Transaction.id).label("tx_count"),
        ).where(*base_filters).group_by(tr_hour)
    )
    hour_map = {
        int(row.hour): (Decimal(str(row.liters)), Decimal(str(row.amount)), row.tx_count)
        for row in hourly_result.all()
    }
    hourly_distribution = [
        HourlyBucket(
            hour=h,
            liters=hour_map.get(h, (Decimal("0"), Decimal("0"), 0))[0].quantize(Decimal("0.001")),
            amount=hour_map.get(h, (Decimal("0"), Decimal("0"), 0))[1].quantize(Decimal("0.01")),
            transaction_count=hour_map.get(h, (Decimal("0"), Decimal("0"), 0))[2],
        )
        for h in range(24)
    ]

    # 3) Ödeme kanalı dağılımı
    payment_result = await db.execute(
        select(
            Transaction.payment_method,
            func.coalesce(func.sum(Transaction.amount), 0).label("amount"),
            func.count(Transaction.id).label("tx_count"),
        ).where(*base_filters).group_by(Transaction.payment_method)
    )
    payment_map = {
        row.payment_method: (Decimal(str(row.amount)), row.tx_count)
        for row in payment_result.all()
    }
    payment_breakdown = PaymentBreakdown(
        cash=PaymentChannelSummary(
            amount=payment_map.get(PaymentMethod.CASH, (Decimal("0"), 0))[0].quantize(Decimal("0.01")),
            transaction_count=payment_map.get(PaymentMethod.CASH, (Decimal("0"), 0))[1],
        ),
        credit_card=PaymentChannelSummary(
            amount=payment_map.get(PaymentMethod.CREDIT_CARD, (Decimal("0"), 0))[0].quantize(Decimal("0.01")),
            transaction_count=payment_map.get(PaymentMethod.CREDIT_CARD, (Decimal("0"), 0))[1],
        ),
        eft=PaymentChannelSummary(
            amount=payment_map.get(PaymentMethod.EFT, (Decimal("0"), 0))[0].quantize(Decimal("0.01")),
            transaction_count=payment_map.get(PaymentMethod.EFT, (Decimal("0"), 0))[1],
        ),
        veresiye=PaymentChannelSummary(
            amount=payment_map.get(PaymentMethod.VERESIYE, (Decimal("0"), 0))[0].quantize(Decimal("0.01")),
            transaction_count=payment_map.get(PaymentMethod.VERESIYE, (Decimal("0"), 0))[1],
        ),
    )

    return PumpFuelDetailResponse(
        station_id=str(station.id),
        station_name=station.name,
        pump_id=str(pump.id),
        pump_label=pump.label,
        fuel_type=fuel,
        date=day.isoformat(),
        total_liters=total_liters.quantize(Decimal("0.001")),
        total_amount=total_amount.quantize(Decimal("0.01")),
        transaction_count=tx_count,
        average_transaction_amount=avg_amount,
        hourly_distribution=hourly_distribution,
        payment_breakdown=payment_breakdown,
    )
