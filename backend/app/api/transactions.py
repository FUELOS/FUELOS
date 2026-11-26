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
from typing import Annotated
from datetime import datetime, timezone
from decimal import Decimal, InvalidOperation, ROUND_HALF_UP

from fastapi import APIRouter, Depends, Header, HTTPException, Query, status
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
from app.services import credit_access, credit_sales
from app.services.financial_requests import begin_request, finish_request

router = APIRouter(prefix="/api/transactions", tags=["Transactions"])


@router.post("", response_model=TransactionResponse, status_code=status.HTTP_201_CREATED)
async def create_transaction(
    data: TransactionCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
    idempotency_key: Annotated[uuid.UUID | None, Header()] = None,
):
    """
    Yeni satış/işlem kaydı oluşturur.

    İş kuralları:
    1. Vardiya açık olmalı.
    2. Cashier sadece kendi vardiyasına ekleyebilir.
    3. StationManager kendi istasyonundaki açık vardiyalara ekleyebilir.
    4. fuel türünde liters ve fuel_type zorunlu.
    """
    pending, existing_id = await begin_request(db, current_user.id, 'sale', idempotency_key, data)
    if existing_id is not None:
        query = select(Transaction).where(
            Transaction.id == existing_id,
            Transaction.station_id.in_(credit_access.accessible_station_ids(current_user)),
        )
        if current_user.role == UserRole.CASHIER:
            query = query.join(Shift).where(Shift.user_id == current_user.id)
        existing = await db.scalar(query)
        if existing is None:
            raise HTTPException(status_code=404, detail="Satış işlemi bulunamadı")
        await db.refresh(existing, attribute_names=['credit_sale'])
        return existing
    # Vardiyayı getir
    result = await db.execute(select(Shift).where(Shift.id == data.shift_id).with_for_update())
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

    if current_user.role == UserRole.SUPER_ADMIN:
        owner_company = await db.scalar(select(Station.company_id).where(Station.id == shift.station_id))
        if owner_company != current_user.company_id:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Vardiya bulunamadı",
            )

    # Realized sales must belong to the selected open shift's time window.
    if data.transaction_time is not None:
        requested_time = data.transaction_time
        if requested_time.tzinfo is None:
            requested_time = requested_time.replace(tzinfo=timezone.utc)
        started_at = shift.start_time
        if started_at.tzinfo is None:
            started_at = started_at.replace(tzinfo=timezone.utc)
        if requested_time < started_at or requested_time > datetime.now(timezone.utc):
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="Satış zamanı vardiya başlangıcından önce veya gelecekte olamaz",
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
        fuel = (data.fuel_type or "").strip()
        if data.pump_id is not None:
            pump_result = await db.execute(select(Pump).where(Pump.id == data.pump_id))
            pump = pump_result.scalar_one_or_none()
            if pump is None:
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail="Pompa bulunamadı",
                )
            # Pompa, satışın yapıldığı vardiyanın istasyonuna ait olmalı.
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
            # Önce birebir eşleşme, sonra alt-dizi toleransı (pompa "Motorin" derken
            # satış kaydı "Motorin (Dizel)" gibi uzun ad kullanabilir).
            fuel_matches = fuel in pump_fuels or any(
                pf.lower() in fuel.lower() for pf in pump_fuels
            )
        else:
            # Pompa belirtilmediyse satış tüm aktif pompalar kapsamında kaydedilir.
            pumps_result = await db.execute(
                select(Pump).where(
                    Pump.station_id == shift.station_id,
                    Pump.is_active.is_(True),
                )
            )
            station_pumps = pumps_result.scalars().all()
            fuel_matches = any(
                fuel in supported_fuels
                or any(supported_fuel.lower() in fuel.lower() for supported_fuel in supported_fuels)
                for supported_fuels in (
                    [f.strip() for f in pump.fuel_types.split(",") if f.strip()]
                    for pump in station_pumps
                )
            )
            if not station_pumps:
                raise HTTPException(
                    status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                    detail="Bu istasyonda aktif pompa bulunmuyor",
                )

        if not fuel_matches:
            detail = (
                "Bu istasyondaki aktif pompalar seçilen yakıt türünü satmıyor"
                if data.pump_id is None
                else f"Bu pompa seçilen yakıt türünü satmıyor (pompanın yakıtları: {', '.join(pump_fuels)})"
            )
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail=detail,
            )
    elif data.pump_id is not None:
        # Pompa bilgisi yalnızca akaryakıt satışlarında geçerlidir.
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Pompa yalnızca akaryakıt satışlarında seçilebilir",
        )

    if data.payment_method == PaymentMethod.VERESIYE and data.credit is None:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Veresiye satış için cari hesap seçimi zorunludur (kurumsal şirket veya bireysel müşteri)",
        )
    if data.payment_method != PaymentMethod.VERESIYE and data.credit is not None:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Cari hesap bilgisi yalnızca veresiye satışlarda gönderilebilir",
        )

    persisted_amount = data.amount
    persisted_liters = data.liters
    if data.payment_method == PaymentMethod.VERESIYE:
        try:
            q_amount = data.amount.quantize(Decimal("0.01"))
        except InvalidOperation:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="Geçersiz tutar biçimi",
            ) from None
        if data.amount <= 0 or data.amount != q_amount:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="Veresiye satış tutarı pozitif ve tam kuruş (en fazla 2 ondalık) olmalıdır",
            )
        persisted_amount = q_amount
        if persisted_liters is not None:
            persisted_liters = persisted_liters.quantize(
                Decimal("0.001"), rounding=ROUND_HALF_UP
            )

    tx_time = data.transaction_time or datetime.now(timezone.utc)
    if tx_time.tzinfo is None:
        tx_time = tx_time.replace(tzinfo=timezone.utc)

    transaction = Transaction(
        shift_id=data.shift_id,
        station_id=shift.station_id,  # Shift'ten otomatik alınır
        pump_id=data.pump_id if data.type == TransactionType.FUEL else None,
        type=data.type,
        payment_method=data.payment_method,
        amount=persisted_amount,
        liters=persisted_liters,
        fuel_type=data.fuel_type.strip() if data.fuel_type else None,
        description=data.description,
        transaction_time=tx_time,
    )
    db.add(transaction)
    await db.flush()

    if data.payment_method == PaymentMethod.VERESIYE and data.credit is not None:
        await credit_sales.create_credit_sale(
            db,
            user=current_user,
            shift=shift,
            transaction=transaction,
            credit=data.credit,
        )

    await db.refresh(transaction)
    if data.payment_method == PaymentMethod.VERESIYE:
        await db.refresh(transaction, attribute_names=["credit_sale"])
    finish_request(db, pending, transaction.id)
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
    İstasyon Müdürü için station_id istek parametresi yok sayılır; filtre
    oturumdaki kullanıcının istasyonundan zorlanır.
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

    # İstasyon Müdürü: istasyon ID'si istekten değil oturumdaki kullanıcıdan
    # alınır — başka bir istasyon ID'si gönderilse bile yok sayılır.
    if station_id is not None and current_user.role != UserRole.STATION_MANAGER:
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
    İstasyon Müdürü için station_id istek parametresi yok sayılır; filtre
    oturumdaki kullanıcının istasyonundan zorlanır.
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

    # İstasyon Müdürü: istasyon ID'si istekten değil oturumdaki kullanıcıdan
    # alınır — başka bir istasyon ID'si gönderilse bile yok sayılır.
    if station_id is not None and current_user.role != UserRole.STATION_MANAGER:
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
