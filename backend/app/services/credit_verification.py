"""
FuelOS — Veresiye yakıt alımı doğrulaması (Aşama 2).

Kurumsal: araç plakası kontrol edilir, sürücünün kimliği sistemdeki kayıtla
eşleştirilir, şirketin yakıt alım yetkisi ve (tanımlıysa) kredi limiti denetlenir.
Bireysel: müşterinin veresiye yetkisi, (verilmişse) T.C. kimlik no eşleşmesi ve
(tanımlıysa) kredi limiti denetlenir.

Aynı kontroller hem `POST /api/veresiye/verify` ön sorgusunda hem de satış
kaydı oluşturulurken çalışır — arayüze güvenilmez.
"""

from __future__ import annotations

import uuid
from dataclasses import dataclass, field
from decimal import Decimal

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.base import CreditAccountType
from app.models.credit import CreditCompany, CreditCustomer, CreditDriver, CreditVehicle
from app.services.credit_ledger import account_balance
from app.services.pii import tc_blind_index, tc_matches

# Neden kodu → kullanıcıya gösterilecek Türkçe açıklama.
REASON_MESSAGES: dict[str, str] = {
    "plate_not_registered": "Bu plaka istasyonda hiçbir anlaşmalı şirkete kayıtlı değil",
    "vehicle_inactive": "Bu araç pasife alınmış; veresiye yakıt alamaz",
    "company_not_authorized": "Şirketin veresiye yakıt alım yetkisi sonlandırılmış",
    "driver_required": "Yetkili sürücü seçilmeli ve T.C. kimlik numarası doğrulanmalıdır",
    "driver_not_found": "Sürücü bu şirketin yetkili sürücüleri arasında kayıtlı değil",
    "driver_inactive": "Bu sürücünün yetkisi kaldırılmış",
    "driver_tc_mismatch": "Girilen T.C. kimlik numarası kayıtlı sürücüyle eşleşmiyor",
    "credit_limit_exceeded": "Bu satış tanımlı kredi limitini aşıyor",
    "customer_inactive": "Müşterinin veresiye yetkisi kapatılmış",
    "customer_tc_mismatch": "Girilen T.C. kimlik numarası kayıtlı müşteriyle eşleşmiyor",
}


def reason_message(reasons: list[str]) -> str:
    """Neden kodlarını tek bir okunur hata mesajına çevirir."""
    return "; ".join(REASON_MESSAGES.get(code, code) for code in reasons)


@dataclass
class CorporateVerification:
    plate: str | None
    company: CreditCompany | None = None
    vehicle: CreditVehicle | None = None
    driver: CreditDriver | None = None
    identity_verified: bool = False
    reasons: list[str] = field(default_factory=list)

    @property
    def authorized(self) -> bool:
        """Tüm kontroller geçti ve sürücü kimliği doğrulandı — satış yapılabilir."""
        return not self.reasons and self.identity_verified


@dataclass
class IndividualVerification:
    customer: CreditCustomer
    identity_verified: bool = False
    reasons: list[str] = field(default_factory=list)

    @property
    def authorized(self) -> bool:
        return not self.reasons


async def _limit_exceeded(
    db: AsyncSession,
    account_type: CreditAccountType,
    account_id: uuid.UUID,
    credit_limit: Decimal | None,
    amount: Decimal | None,
) -> bool:
    if credit_limit is None or amount is None:
        return False
    balance = await account_balance(db, account_type, account_id)
    return balance + Decimal(str(amount)) > Decimal(str(credit_limit))


async def verify_corporate(
    db: AsyncSession,
    *,
    station_id: uuid.UUID,
    plate: str | None = None,
    vehicle_id: uuid.UUID | None = None,
    company_id: uuid.UUID | None = None,
    driver_id: uuid.UUID | None = None,
    driver_tc: str | None = None,
    amount: Decimal | None = None,
) -> CorporateVerification:
    """
    Kurumsal veresiye alımını doğrular.

    `plate` normalize edilmiş olmalıdır (schemas bunu yapar). Araç `vehicle_id`
    veya `plate` ile bulunur; `company_id` verilmişse aracın o şirkete ait olması
    gerekir. Sürücü `driver_id` ile, yoksa `driver_tc` kör indeksiyle aranır.
    """
    # ── 1. Araç ──
    vehicle_query = select(CreditVehicle).where(CreditVehicle.station_id == station_id)
    if vehicle_id is not None:
        vehicle_query = vehicle_query.where(CreditVehicle.id == vehicle_id)
    elif plate is not None:
        vehicle_query = vehicle_query.where(CreditVehicle.plate == plate)
    else:
        return CorporateVerification(plate=None, reasons=["plate_not_registered"])
    if company_id is not None:
        vehicle_query = vehicle_query.where(CreditVehicle.credit_company_id == company_id)
    # Aynı plaka geçmişte başka şirkette pasif kalmış olabilir: aktif olan önceliklidir.
    vehicle_query = vehicle_query.order_by(CreditVehicle.is_active.desc(), CreditVehicle.updated_at.desc())
    vehicle = (await db.execute(vehicle_query)).scalars().first()
    if vehicle is None:
        return CorporateVerification(plate=plate, reasons=["plate_not_registered"])

    company = await db.scalar(select(CreditCompany).where(CreditCompany.id == vehicle.credit_company_id))
    result = CorporateVerification(plate=vehicle.plate, company=company, vehicle=vehicle)
    if company is None:  # FK gereği olamaz; savunma amaçlı
        result.reasons.append("plate_not_registered")
        return result

    if not vehicle.is_active:
        result.reasons.append("vehicle_inactive")
    if not company.is_authorized:
        result.reasons.append("company_not_authorized")

    # ── 2. Sürücü ──
    driver: CreditDriver | None = None
    if driver_id is not None:
        driver = next((d for d in company.drivers if d.id == driver_id), None)
        if driver is None:
            result.reasons.append("driver_not_found")
    elif driver_tc:
        index = tc_blind_index(driver_tc)
        driver = next((d for d in company.drivers if d.tc_hash == index), None)
        if driver is None:
            result.reasons.append("driver_not_found")
    else:
        result.reasons.append("driver_required")

    if driver is not None:
        result.driver = driver
        if not driver.is_active:
            result.reasons.append("driver_inactive")
        if driver_tc:
            if tc_matches(driver_tc, driver.tc_hash):
                result.identity_verified = True
            else:
                result.reasons.append("driver_tc_mismatch")
        else:
            # Sürücü seçildi ama kimlik numarası henüz doğrulanmadı.
            result.reasons.append("driver_required")

    # ── 3. Opsiyonel kredi limiti ──
    if await _limit_exceeded(db, CreditAccountType.CORPORATE, company.id, company.credit_limit, amount):
        result.reasons.append("credit_limit_exceeded")

    return result


async def verify_individual(
    db: AsyncSession,
    *,
    customer: CreditCustomer,
    customer_tc: str | None = None,
    amount: Decimal | None = None,
) -> IndividualVerification:
    """Bireysel veresiye alımını doğrular. `customer` kapsam kontrolünden geçmiş olmalıdır."""
    result = IndividualVerification(customer=customer)
    if not customer.is_active:
        result.reasons.append("customer_inactive")
    if customer_tc:
        if tc_matches(customer_tc, customer.tc_hash):
            result.identity_verified = True
        else:
            result.reasons.append("customer_tc_mismatch")
    if await _limit_exceeded(db, CreditAccountType.INDIVIDUAL, customer.id, customer.credit_limit, amount):
        result.reasons.append("credit_limit_exceeded")
    return result
