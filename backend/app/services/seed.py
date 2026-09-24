"""
FuelOS — Seed servisi.
İlk SuperAdmin ve demo Company oluşturur.
Uygulama başlatıldığında çalışır — eğer hiç kullanıcı yoksa seed yapar.
"""

import logging
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.company import Company
from app.models.user import User
from app.models.base import UserRole
from app.auth.security import hash_password

logger = logging.getLogger(__name__)

# ─── Varsayılan SuperAdmin bilgileri ───
DEFAULT_ADMIN_EMAIL = "admin@fuelos.com"
DEFAULT_ADMIN_PASSWORD = "FuelOS2026!"
DEFAULT_COMPANY_NAME = "FuelOS Demo Şirket"
DEFAULT_COMPANY_TAX = "1234567890"


async def seed_initial_data(db: AsyncSession) -> None:
    """
    Veritabanında hiç kullanıcı yoksa ilk SuperAdmin'i oluşturur.
    Zaten kullanıcı varsa hiçbir şey yapmaz (idempotent).
    """
    # Kullanıcı sayısını kontrol et
    result = await db.execute(select(func.count(User.id)))
    user_count = result.scalar()

    if user_count > 0:
        logger.info("Veritabanında kullanıcı mevcut — seed atlanıyor.")
        return

    logger.info("Veritabanı boş — ilk SuperAdmin ve demo şirket oluşturuluyor...")

    # 1. Demo şirketi oluştur
    company = Company(
        name=DEFAULT_COMPANY_NAME,
        tax_number=DEFAULT_COMPANY_TAX,
    )
    db.add(company)
    await db.flush()  # company.id'yi almak için

    # 2. SuperAdmin kullanıcısını oluştur
    admin = User(
        company_id=company.id,
        station_id=None,  # SuperAdmin istasyona bağlı değil
        email=DEFAULT_ADMIN_EMAIL,
        hashed_password=hash_password(DEFAULT_ADMIN_PASSWORD),
        full_name="Sistem Yöneticisi",
        role=UserRole.SUPER_ADMIN,
    )
    db.add(admin)
    await db.commit()

    logger.info(f"✅ SuperAdmin oluşturuldu: {DEFAULT_ADMIN_EMAIL}")
    logger.info(f"✅ Demo şirket oluşturuldu: {DEFAULT_COMPANY_NAME}")
    logger.info(f"⚠️  Varsayılan şifre: {DEFAULT_ADMIN_PASSWORD} — Production'da değiştirin!")
