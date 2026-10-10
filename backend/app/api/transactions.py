"""
FuelOS — Transaction API Router.
Satış/işlem kaydı CRUD + Dashboard özet verileri.

İş kuralları:
- Transaction sadece açık vardiyaya eklenebilir.
- Cashier sadece kendi vardiyasına işlem ekleyebilir.
- fuel türünde liters ve fuel_type zorunludur.
- Transaction'lar immutable — oluşturulduktan sonra değiştirilemez.
"""

import uuid
from datetime import datetime, timezone
from decimal import Decimal

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select, func, and_, cast, Date
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.user import User
from app.models.shift import Shift
from app.models.station import Station
from app.models.pump import Pump
from app.models.transaction import Transaction
from app.models.base import (
    UserRole,
    ShiftStatus,
    PaymentMethod,
    TransactionType,
)
from app.auth.dependencies import get_current_user
from app.schemas.transaction import (
    TransactionCreate,
    TransactionResponse,
    TransactionSummary,
)

router = APIRouter(prefix="/api/transactions", tags=["Transactions"])


@router.post("", response_model=TransactionResponse, status_code=status.HTTP_201_CREATED)
async def create_transaction(
    data: TransactionCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Yeni satış/işlem kaydı oluşturur.

    İş kuralları:
    1. Vardiya açık olmalı.
    2. Cashier sadece kendi vardiyasına ekleyebilir.
    3. StationManager kendi istasyonundaki açık vardiyalara ekleyebilir.
    4. fuel türünde liters ve fuel_type zorunlu.
    """
    # Vardiyayı getir
    result = await db.execute(select(Shift).where(Shift.id == data.shift_id))
    shift = result.scalar_one_or_none()

    if shift is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Vardiya bulunamadı",
        )

    # Vardiya açık mı?
    if shift.status != ShiftStatus.OPEN:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Kapalı vardiyaya satış eklenemez",
        )

    # Yetki kontrolü
    if current_user.role == UserRole.CASHIER and shift.user_id != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Sadece kendi vardiyanıza satış ekleyebilirsiniz",
        )

    if current_user.role == UserRole.STATION_MANAGER and shift.station_id != current_user.station_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Sadece kendi istasyonunuzdaki vardiyalara satış ekleyebilirsiniz",
        )

    # fuel türünde liters ve fuel_type zorunlu
    if data.type == TransactionType.FUEL:
        if data.liters is None or data.liters <= 0:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="Yakıt satışında litre miktarı zorunludur ve pozitif olmalıdır",
            )
        if not data.fuel_type or not data.fuel_type.strip():
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="Yakıt satışında yakıt türü zorunludur (örn: Motorin, Benzin 95)",
            )

    # ── Pompa doğrulamaları (UI'a güvenilmez) ──
    if data.type == TransactionType.FUEL:
        # Akaryakıt satışında pompa zorunludur.
        if data.pump_id is None:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="Akaryakıt satışında pompa seçimi zorunludur",
            )

        pump_result = await db.execute(select(Pump).where(Pump.id == data.pump_id))
        pump = pump_result.scalar_one_or_none()
        if pump is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Pompa bulunamadı",
            )
        # Pompa, satışın yapıldığı vardiyanın istasyonuna ait olmalı.
        # (İstasyon müdürü için vardiyanın istasyonu oturumdan zorlandığından,
        # yalnızca kendi istasyonunun pompalarıyla satış kaydedebilir.)
        if pump.station_id != shift.station_id:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="Pompa bu vardiyanın istasyonuna ait değil",
            )
        if not pump.is_active:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="Pompa aktif değil",
            )
        pump_fuels = [f.strip() for f in (pump.fuel_types or "").split(",") if f.strip()]
        fuel = (data.fuel_type or "").strip()
        # Önce birebir eşleşme, sonra alt-dizi toleransı (pompa "Motorin" derken
        # satış kaydı "Motorin (Dizel)" gibi uzun ad kullanabilir).
        fuel_matches = fuel in pump_fuels or any(
            pf.lower() in fuel.lower() for pf in pump_fuels
        )
        if not fuel_matches:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail=f"Bu pompa seçilen yakıt türünü satmıyor (pompanın yakıtları: {', '.join(pump_fuels)})",
            )
    elif data.pump_id is not None:
        # Pompa bilgisi yalnızca akaryakıt satışlarında geçerlidir.
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Pompa yalnızca akaryakıt satışlarında seçilebilir",
        )

    transaction = Transaction(
        shift_id=data.shift_id,
        station_id=shift.station_id,  # Shift'ten otomatik alınır
        pump_id=data.pump_id if data.type == TransactionType.FUEL else None,
        type=data.type,
        payment_method=data.payment_method,
        amount=data.amount,
        liters=data.liters,
        fuel_type=data.fuel_type.strip() if data.fuel_type else None,
        description=data.description,
        transaction_time=data.transaction_time or datetime.now(timezone.utc),
    )
    db.add(transaction)
    await db.flush()
    await db.refresh(transaction)
    return transaction


@router.get("", response_model=list[TransactionResponse])
async def list_transactions(
    shift_id: uuid.UUID | None = None,
    station_id: uuid.UUID | None = None,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    İşlemleri listeler — rol bazlı filtreleme.
    Opsiyonel: shift_id veya station_id ile filtreleme.
    """
    query = select(Transaction)

    # Rol bazlı filtreleme
    if current_user.role == UserRole.SUPER_ADMIN:
        query = query.join(Station).where(Station.company_id == current_user.company_id)
    elif current_user.role == UserRole.STATION_MANAGER:
        query = query.where(Transaction.station_id == current_user.station_id)
    else:
        # Cashier — sadece kendi vardiyalarındaki işlemler
        query = query.join(Shift).where(Shift.user_id == current_user.id)

    if shift_id is not None:
        query = query.where(Transaction.shift_id == shift_id)

    if station_id is not None:
        query = query.where(Transaction.station_id == station_id)

    query = query.order_by(Transaction.transaction_time.desc()).limit(500)
    result = await db.execute(query)
    return result.scalars().all()


@router.get("/summary", response_model=TransactionSummary)
async def get_transaction_summary(
    station_id: uuid.UUID | None = None,
    date: str | None = Query(None, description="YYYY-MM-DD formatında tarih filtresi"),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    İşlem özeti — Dashboard için.
    Toplam satış, litre, ödeme yöntemi bazlı dağılım.
    """
    # Temel sorgu
    base_filter = []

    if current_user.role == UserRole.SUPER_ADMIN:
        # Şirketin tüm istasyonları
        station_ids_query = select(Station.id).where(
            Station.company_id == current_user.company_id
        )
        base_filter.append(Transaction.station_id.in_(station_ids_query))
    elif current_user.role == UserRole.STATION_MANAGER:
        base_filter.append(Transaction.station_id == current_user.station_id)
    else:
        # Cashier — sadece kendi vardiyaları
        shift_ids_query = select(Shift.id).where(Shift.user_id == current_user.id)
        base_filter.append(Transaction.shift_id.in_(shift_ids_query))

    if station_id is not None:
        base_filter.append(Transaction.station_id == station_id)

    if date is not None:
        base_filter.append(
            cast(Transaction.transaction_time, Date) == date
        )

    # Toplam tutar ve işlem sayısı
    total_query = select(
        func.coalesce(func.sum(Transaction.amount), 0).label("total_amount"),
        func.coalesce(func.sum(Transaction.liters), 0).label("total_fuel_liters"),
        func.count(Transaction.id).label("transaction_count"),
    ).where(and_(*base_filter))

    total_result = await db.execute(total_query)
    total_row = total_result.one()

    # Ödeme yöntemi bazlı dağılım
    payment_query = select(
        Transaction.payment_method,
        func.coalesce(func.sum(Transaction.amount), 0).label("method_total"),
    ).where(and_(*base_filter)).group_by(Transaction.payment_method)

    payment_result = await db.execute(payment_query)
    payment_rows = payment_result.all()

    payment_totals = {row.payment_method: row.method_total for row in payment_rows}

    return TransactionSummary(
        total_amount=Decimal(str(total_row.total_amount)),
        total_fuel_liters=Decimal(str(total_row.total_fuel_liters)),
        transaction_count=total_row.transaction_count,
        cash_total=Decimal(str(payment_totals.get(PaymentMethod.CASH, 0))),
        credit_card_total=Decimal(str(payment_totals.get(PaymentMethod.CREDIT_CARD, 0))),
        eft_total=Decimal(str(payment_totals.get(PaymentMethod.EFT, 0))),
        veresiye_total=Decimal(str(payment_totals.get(PaymentMethod.VERESIYE, 0))),
    )
