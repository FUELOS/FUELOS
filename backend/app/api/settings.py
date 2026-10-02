"""
FuelOS — Settings API Router.
Şirket ve istasyon bazlı ayarlar (Kasa Mutabakat Toleransı vb.).
"""

from decimal import Decimal
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.user import User
from app.models.company import Company
from app.models.base import UserRole
from app.auth.dependencies import get_current_user, require_role

router = APIRouter(prefix="/api/settings", tags=["Settings"])


class ToleranceResponse(BaseModel):
    tolerance: Decimal
    company_name: str


class ToleranceUpdateRequest(BaseModel):
    tolerance: Decimal = Field(
        ...,
        ge=0,
        le=1000,
        description="Yeni kasa mutabakat toleransı (TL). Örn: 1.00 veya 5.00"
    )


@router.get("/tolerance", response_model=ToleranceResponse)
async def get_tolerance(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Giriş yapan kullanıcının bağlı olduğu şirketin tolerans ayarını getirir."""
    result = await db.execute(select(Company).where(Company.id == current_user.company_id))
    company = result.scalar_one_or_none()
    if not company:
        raise HTTPException(status_code=404, detail="Şirket bulunamadı")

    return ToleranceResponse(
        tolerance=Decimal(str(company.reconciliation_tolerance or 1.00)),
        company_name=company.name,
    )


@router.put("/tolerance", response_model=ToleranceResponse)
async def update_tolerance(
    data: ToleranceUpdateRequest,
    current_user: User = Depends(
        require_role(UserRole.SUPER_ADMIN, UserRole.STATION_MANAGER)
    ),
    db: AsyncSession = Depends(get_db),
):
    """
    Kasa mutabakat tolerans limitini günceller (Sadece Yönetici & Müdür).
    """
    result = await db.execute(select(Company).where(Company.id == current_user.company_id))
    company = result.scalar_one_or_none()
    if not company:
        raise HTTPException(status_code=404, detail="Şirket bulunamadı")

    company.reconciliation_tolerance = data.tolerance
    await db.commit()
    await db.refresh(company)

    return ToleranceResponse(
        tolerance=Decimal(str(company.reconciliation_tolerance)),
        company_name=company.name,
    )
