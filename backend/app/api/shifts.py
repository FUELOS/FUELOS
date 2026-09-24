"""
FuelOS — Shift API Router.
Vardiya yönetimi — açma, kapama, listeleme ve Akıllı Kasa Mutabakat Analizi.
"""

import uuid
from datetime import datetime, timezone
from decimal import Decimal

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select, and_, func, case
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.user import User
from app.models.station import Station
from app.models.shift import Shift
from app.models.transaction import Transaction
from app.models.base import UserRole, ShiftStatus, PaymentMethod
from app.auth.dependencies import get_current_user, require_role
from app.schemas.shift import (
    ChannelBreakdown,
    ReconciliationInfo,
    ShiftOpen,
    ShiftClose,
    ShiftResponse,
)
from app.services.reconciliation import (
    DEFAULT_TOLERANCE,
    KURUS,
    reconcile,
    to_api_status,
)

router = APIRouter(prefix="/api/shifts", tags=["Shifts"])


def _shift_query_for_user(user: User):
    """Kullanıcının rolüne göre vardiya sorgusu oluşturur."""
    query = select(Shift)

    if user.role == UserRole.SUPER_ADMIN:
        query = query.join(Station).where(Station.company_id == user.company_id)
    elif user.role == UserRole.STATION_MANAGER:
        query = query.where(Shift.station_id == user.station_id)
    else:
        query = query.where(Shift.user_id == user.id)

    return query


async def _build_shift_response(shift: Shift, db: AsyncSession) -> ShiftResponse:
    """
    Vardiyayı satış toplamları, beklenen nakit ve mutabakat fark analiziyle zenginleştirir.
    Beklenen Kasa Nakit = Açılış Nakit + O vardiyadaki Nakit Satışlar
    Kasa Farkı = Kapanış Nakit - Beklenen Kasa Nakit

    K-001 Mutabakat Motoru (DEC-002): kanal ilanı modeliyle çalışır —
    Nakit = fiziksel sayım farkı (kapanış - açılış), diğer kanallar ilan
    edilmişse ilan, edilmediyse kayıtlı satış tutarı. Durum sınıflandırması
    DEC-001 toleransıyla yapılır (|fark| <= 1 TL -> matched).
    """
    tx_res = await db.execute(
        select(
            func.coalesce(func.sum(Transaction.amount), 0).label("total_sales"),
            func.coalesce(
                func.sum(
                    case(
                        (Transaction.payment_method == PaymentMethod.CASH, Transaction.amount),
                        else_=0,
                    )
                ),
                0,
            ).label("cash_sales"),
            func.coalesce(
                func.sum(
                    case(
                        (Transaction.payment_method == PaymentMethod.CREDIT_CARD, Transaction.amount),
                        else_=0,
                    )
                ),
                0,
            ).label("pos_sales"),
            func.coalesce(
                func.sum(
                    case(
                        (Transaction.payment_method == PaymentMethod.EFT, Transaction.amount),
                        else_=0,
                    )
                ),
                0,
            ).label("eft_sales"),
            func.coalesce(
                func.sum(
                    case(
                        (Transaction.payment_method == PaymentMethod.VERESIYE, Transaction.amount),
                        else_=0,
                    )
                ),
                0,
            ).label("credit_sales"),
        ).where(Transaction.shift_id == shift.id)
    )
    row = tx_res.one()
    total_sales = Decimal(str(row.total_sales))
    cash_sales = Decimal(str(row.cash_sales))
    pos_sales = Decimal(str(row.pos_sales))
    eft_sales = Decimal(str(row.eft_sales))
    credit_sales = Decimal(str(row.credit_sales))
    opening_cash = Decimal(str(shift.opening_cash))
    expected_cash = opening_cash + cash_sales

    cash_diff = None
    recon_status = "open"
    reconciliation = None

    if shift.status == ShiftStatus.CLOSED and shift.closing_cash is not None:
        closing_cash = Decimal(str(shift.closing_cash))
        cash_diff = closing_cash - expected_cash

        net_cash = closing_cash - opening_cash
        if net_cash >= 0:
            # ── K-001: kanal ilanı modeli (DEC-002) ──
            declared = {
                "pos": Decimal(str(shift.declared_pos)) if shift.declared_pos is not None else pos_sales,
                "cash": net_cash,
                "eft": Decimal(str(shift.declared_eft)) if shift.declared_eft is not None else eft_sales,
                "credit": Decimal(str(shift.declared_credit)) if shift.declared_credit is not None else credit_sales,
            }
            recorded = {
                "pos": pos_sales,
                "cash": cash_sales,
                "eft": eft_sales,
                "credit": credit_sales,
            }

            result = reconcile(
                {
                    "total_sales": total_sales,
                    "pos": declared["pos"],
                    "cash": declared["cash"],
                    "eft": declared["eft"],
                    "credit": declared["credit"],
                }
            )
            reconciliation = ReconciliationInfo(
                status=to_api_status(result),
                difference=result.difference,
                tolerance=DEFAULT_TOLERANCE,
                channels=[
                    ChannelBreakdown(
                        channel=channel,
                        declared=declared[channel],
                        recorded=recorded[channel],
                        difference=(recorded[channel] - declared[channel]).quantize(KURUS),
                    )
                    for channel in ("pos", "cash", "eft", "credit")
                ],
            )
            recon_status = reconciliation.status
        else:
            # Geçersiz/eski kayıt: sayılan nakit açılıştan az — K-001
            # çalıştırılamaz, eski kasa sınıflandırması korunur.
            if cash_diff == 0:
                recon_status = "matched"     # Tam Mutabakat
            elif cash_diff < 0:
                recon_status = "shortage"    # Kasa Açığı
            else:
                recon_status = "surplus"     # Kasa Fazlası

    return ShiftResponse(
        id=shift.id,
        station_id=shift.station_id,
        user_id=shift.user_id,
        start_time=shift.start_time,
        end_time=shift.end_time,
        status=shift.status,
        opening_cash=opening_cash,
        closing_cash=Decimal(str(shift.closing_cash)) if shift.closing_cash is not None else None,
        notes=shift.notes,
        created_at=shift.created_at,
        updated_at=shift.updated_at,
        total_sales=total_sales,
        cash_sales=cash_sales,
        expected_cash=expected_cash,
        cash_difference=cash_diff,
        reconciliation_status=recon_status,
        reconciliation=reconciliation,
    )


@router.get("", response_model=list[ShiftResponse])
async def list_shifts(
    station_id: uuid.UUID | None = None,
    shift_status: ShiftStatus | None = None,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Vardiyaları mutabakat analizleriyle listeler.
    """
    query = _shift_query_for_user(current_user)

    if station_id is not None:
        query = query.where(Shift.station_id == station_id)

    if shift_status is not None:
        query = query.where(Shift.status == shift_status)

    query = query.order_by(Shift.start_time.desc())
    result = await db.execute(query)
    shifts = result.scalars().all()

    enriched_shifts = [await _build_shift_response(s, db) for s in shifts]
    return enriched_shifts


@router.get("/{shift_id}", response_model=ShiftResponse)
async def get_shift(
    shift_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Tek vardiya detayı ve mutabakat analizi."""
    query = _shift_query_for_user(current_user).where(Shift.id == shift_id)
    result = await db.execute(query)
    shift = result.scalar_one_or_none()

    if shift is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Vardiya bulunamadı veya erişim yetkiniz yok",
        )
    return await _build_shift_response(shift, db)


@router.post("/open", response_model=ShiftResponse, status_code=status.HTTP_201_CREATED)
async def open_shift(
    data: ShiftOpen,
    current_user: User = Depends(
        require_role(UserRole.SUPER_ADMIN, UserRole.STATION_MANAGER, UserRole.CASHIER)
    ),
    db: AsyncSession = Depends(get_db),
):
    """
    Yeni vardiya açar.

    İş kuralları:
    1. SuperAdmin kendi şirketine ait herhangi bir istasyonda vardiya açabilir.
    2. StationManager ve Cashier sadece kendi istasyonunda vardiya açabilir.
    3. SuperAdmin veya StationManager başka bir kasiyer adına vardiya başlatabilir.
    4. Bir personelin aynı anda birden fazla açık vardiyası olamaz.
    """
    # ── İstasyon Kontrolü ──
    if current_user.role == UserRole.SUPER_ADMIN:
        station_result = await db.execute(
            select(Station).where(
                Station.id == data.station_id,
                Station.company_id == current_user.company_id,
            )
        )
        if station_result.scalar_one_or_none() is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Belirtilen istasyon bulunamadı veya şirketinize ait değil",
            )
    else:
        if data.station_id != current_user.station_id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Sadece kendi istasyonunuzda vardiya açabilirsiniz",
            )

    # ── Personel / Kasiyer Belirleme ──
    target_user_id = current_user.id
    if data.user_id and current_user.role in (UserRole.SUPER_ADMIN, UserRole.STATION_MANAGER):
        target_user = await db.scalar(
            select(User).where(
                User.id == data.user_id,
                User.company_id == current_user.company_id,
                User.is_active == True,
            )
        )
        if not target_user:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Seçilen personel bulunamadı veya hesabı aktif değil",
            )
        if current_user.role == UserRole.STATION_MANAGER and target_user.station_id != current_user.station_id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Sadece kendi istasyonunuzdaki personel adına vardiya açabilirsiniz",
            )
        target_user_id = target_user.id

    # ── Açık Vardiya Kontrolü ──
    existing_open = await db.execute(
        select(Shift).where(
            and_(
                Shift.user_id == target_user_id,
                Shift.status == ShiftStatus.OPEN,
            )
        )
    )
    if existing_open.scalar_one_or_none() is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Bu personelin zaten açık bir vardiyası var. Önce mevcut vardiyayı kapatın.",
        )

    shift = Shift(
        station_id=data.station_id,
        user_id=target_user_id,
        start_time=datetime.now(timezone.utc),
        status=ShiftStatus.OPEN,
        opening_cash=data.opening_cash,
        notes=data.notes,
    )
    db.add(shift)
    await db.flush()
    await db.refresh(shift)
    return await _build_shift_response(shift, db)


@router.post("/{shift_id}/close", response_model=ShiftResponse)
async def close_shift(
    shift_id: uuid.UUID,
    data: ShiftClose,
    current_user: User = Depends(
        require_role(UserRole.SUPER_ADMIN, UserRole.STATION_MANAGER, UserRole.CASHIER)
    ),
    db: AsyncSession = Depends(get_db),
):
    """
    Vardiyayı kapatır ve kasa mutabakat farkını hesaplar.
    """
    result = await db.execute(select(Shift).where(Shift.id == shift_id))
    shift = result.scalar_one_or_none()

    if shift is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Vardiya bulunamadı",
        )

    # Yetki kontrolü
    if current_user.role == UserRole.CASHIER and shift.user_id != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Sadece kendi vardiyanızı kapatabilirsiniz",
        )

    if current_user.role == UserRole.STATION_MANAGER and shift.station_id != current_user.station_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Sadece kendi istasyonunuzdaki vardiyaları kapatabilirsiniz",
        )

    if current_user.role == UserRole.SUPER_ADMIN:
        station = await db.scalar(
            select(Station).where(
                Station.id == shift.station_id,
                Station.company_id == current_user.company_id,
            )
        )
        if not station:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Bu vardiyayı kapatma yetkiniz yok",
            )

    # Zaten kapalı mı?
    if shift.status == ShiftStatus.CLOSED:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Bu vardiya zaten kapatılmış",
        )

    # ── Kanal ilanı doğrulaması (DEC-002) ──
    # Sayılan kapanış nakdi açılış nakdinden az olamaz: net nakit (cash kanalı)
    # motorun girdi sözleşmesi gereği negatif olamaz.
    if Decimal(str(data.closing_cash)) - Decimal(str(shift.opening_cash)) < 0:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Sayılan kapanış nakdi açılış nakdinden az olamaz — açılış/kapanış tutarlarını kontrol edin",
        )

    # Vardiyayı kapat
    shift.status = ShiftStatus.CLOSED
    shift.end_time = datetime.now(timezone.utc)
    shift.closing_cash = data.closing_cash
    shift.declared_pos = data.declared_pos
    shift.declared_eft = data.declared_eft
    shift.declared_credit = data.declared_credit
    if data.notes:
        shift.notes = f"{shift.notes}\n--- Kapanış notu ---\n{data.notes}" if shift.notes else data.notes

    await db.flush()
    await db.refresh(shift)
    return await _build_shift_response(shift, db)
