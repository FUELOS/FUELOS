"""
FuelOS — Sanal POS & QR/FAST Simülatör API
pos-sim + qris_simulator mantığıyla banka slip onayı ve QR webhook simülasyonu.
"""

import random
import string
import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.auth.dependencies import get_current_user
from app.models.user import User
from app.models.shift import Shift
from app.models.transaction import Transaction
from app.models.base import ShiftStatus, TransactionType, PaymentMethod

router = APIRouter(prefix="/api/simulate", tags=["Simülatör"])


# ─── Yardımcı fonksiyonlar ───────────────────────────────────────────


def _generate_auth_code(length: int = 6) -> str:
    """Sanal banka yetkilendirme kodu üretir (NickIT64/pos-sim mantığı)."""
    return "".join(random.choices(string.digits, k=length))


def _generate_ref_number() -> str:
    """Sanal referans/slip numarası üretir."""
    prefix = random.choice(["TR", "BNK", "QR"])
    suffix = "".join(random.choices(string.digits, k=10))
    return f"{prefix}{suffix}"


def _generate_masked_card() -> str:
    """Sanal kart numarası maskeler (son 4 hane gösterilir)."""
    bins = ["4549", "5400", "6502", "4058", "5105"]
    return f"{random.choice(bins)}****{random.randint(1000, 9999)}"


# ─── Request / Response Şemaları ─────────────────────────────────────


class SimulatePOSRequest(BaseModel):
    shift_id: str = Field(..., description="Hangi vardiyaya işlenecek")
    amount: float = Field(..., gt=0, description="POS ödeme tutarı (TL)")
    fuel_type: str = Field(default="Motorin", description="Yakıt türü")
    liters: float = Field(default=0.0, ge=0, description="Satılan litre")


class SimulatePOSResponse(BaseModel):
    success: bool
    transaction_id: str
    auth_code: str           # Banka yetkilendirme kodu
    ref_number: str          # Slip/referans numarası
    masked_card: str         # Kart numarası (maskeli)
    amount: float
    bank_name: str
    message: str


class SimulateQRRequest(BaseModel):
    shift_id: str = Field(..., description="Hangi vardiyaya işlenecek")
    amount: float = Field(..., gt=0, description="QR/FAST ödeme tutarı (TL)")
    fuel_type: str = Field(default="Motorin", description="Yakıt türü")
    liters: float = Field(default=0.0, ge=0, description="Satılan litre")


class SimulateQRResponse(BaseModel):
    success: bool
    transaction_id: str
    qr_ref: str              # QR referans kodu
    sender_iban: str         # Gönderen (sanal) IBAN
    sender_name: str         # Gönderen (sanal) isim
    amount: float
    fast_ref: str            # FAST transfer referansı
    message: str


# ─── Endpoint'ler ────────────────────────────────────────────────────


@router.post("/pos", response_model=SimulatePOSResponse)
async def simulate_pos_payment(
    req: SimulatePOSRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Sanal POS ödeme simülasyonu (pos-sim mantığı).
    Banka yetkilendirme kodu üretir → vardiyaya credit_card transaction ekler.
    """
    # 1. Vardiyayı bul
    result = await db.execute(
        select(Shift).where(
            Shift.id == uuid.UUID(req.shift_id),
            Shift.status == ShiftStatus.OPEN,
        )
    )
    shift = result.scalar_one_or_none()
    if not shift:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Açık vardiya bulunamadı veya vardiya zaten kapatılmış.",
        )

    # 2. Sanal banka simülasyonu — pos-sim mantığı
    auth_code = _generate_auth_code(6)
    ref_number = _generate_ref_number()
    masked_card = _generate_masked_card()
    banks = ["Garanti BBVA", "İş Bankası", "Yapı Kredi", "Ziraat", "Akbank", "Halkbank"]
    bank_name = random.choice(banks)

    # 3. Transaction oluştur
    tx = Transaction(
        shift_id=shift.id,
        station_id=shift.station_id,
        type=TransactionType.FUEL,
        payment_method=PaymentMethod.CREDIT_CARD,
        amount=req.amount,
        liters=req.liters if req.liters > 0 else None,
        fuel_type=req.fuel_type,
        description=f"[Sanal POS] {bank_name} | Onay: {auth_code} | Slip: {ref_number}",
        transaction_time=datetime.now(timezone.utc),
    )
    db.add(tx)
    await db.commit()
    await db.refresh(tx)

    return SimulatePOSResponse(
        success=True,
        transaction_id=str(tx.id),
        auth_code=auth_code,
        ref_number=ref_number,
        masked_card=masked_card,
        amount=req.amount,
        bank_name=bank_name,
        message=f"POS işlemi başarıyla tamamlandı. Tutar: {req.amount:.2f} ₺",
    )


@router.post("/qr", response_model=SimulateQRResponse)
async def simulate_qr_fast_payment(
    req: SimulateQRRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Sanal QR/FAST ödeme simülasyonu (qris_simulator mantığı).
    QR kodu üretildi → webhook onayı simüle edilir → vardiyaya EFT transaction ekler.
    """
    # 1. Vardiyayı bul
    result = await db.execute(
        select(Shift).where(
            Shift.id == uuid.UUID(req.shift_id),
            Shift.status == ShiftStatus.OPEN,
        )
    )
    shift = result.scalar_one_or_none()
    if not shift:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Açık vardiya bulunamadı veya vardiya zaten kapatılmış.",
        )

    # 2. Sanal FAST/QR simülasyonu — qris_simulator mantığı
    qr_ref = f"QR{_generate_ref_number()}"
    fast_ref = f"FAST{_generate_auth_code(12)}"

    # Sanal gönderen bilgileri
    bank_codes = ["0006", "0010", "0012", "0046", "0062"]
    iban_suffix = "".join(random.choices(string.digits, k=18))
    sender_iban = f"TR{random.choice(bank_codes)}{iban_suffix}"

    sender_names = [
        "Ahmet Yılmaz", "Fatma Kaya", "Mehmet Demir",
        "Zeynep Arslan", "Ali Çelik", "Ayşe Şahin",
    ]
    sender_name = random.choice(sender_names)

    # 3. Transaction oluştur (EFT = FAST kanalı)
    tx = Transaction(
        shift_id=shift.id,
        station_id=shift.station_id,
        type=TransactionType.FUEL,
        payment_method=PaymentMethod.EFT,
        amount=req.amount,
        liters=req.liters if req.liters > 0 else None,
        fuel_type=req.fuel_type,
        description=f"[Sanal QR/FAST] {sender_name} | FAST: {fast_ref} | QR: {qr_ref}",
        transaction_time=datetime.now(timezone.utc),
    )
    db.add(tx)
    await db.commit()
    await db.refresh(tx)

    return SimulateQRResponse(
        success=True,
        transaction_id=str(tx.id),
        qr_ref=qr_ref,
        sender_iban=sender_iban,
        sender_name=sender_name,
        amount=req.amount,
        fast_ref=fast_ref,
        message=f"QR/FAST transferi alındı. {sender_name} → {req.amount:.2f} ₺",
    )
