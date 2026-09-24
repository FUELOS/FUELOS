"""
FuelOS — Auth API Router.
Login endpoint'i — JWT token üretir.
"""

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.user import User
from app.auth.security import verify_password, create_access_token
from app.auth.dependencies import get_current_user
from app.schemas.auth import LoginRequest, TokenResponse

router = APIRouter(prefix="/api/auth", tags=["Authentication"])


@router.post("/login", response_model=TokenResponse)
async def login(
    request: LoginRequest,
    db: AsyncSession = Depends(get_db),
):
    """
    Kullanıcı girişi — e-posta ve şifre ile JWT token alır.

    İş kuralları:
    - E-posta veritabanında kayıtlı olmalı
    - Şifre doğru olmalı
    - Kullanıcı hesabı aktif olmalı
    """
    # 1. Kullanıcıyı e-posta ile bul
    result = await db.execute(
        select(User).where(User.email == request.email)
    )
    user = result.scalar_one_or_none()

    # 2. Kullanıcı yoksa veya şifre yanlışsa → aynı hata mesajı (güvenlik)
    if user is None or not verify_password(request.password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="E-posta veya şifre hatalı",
            headers={"WWW-Authenticate": "Bearer"},
        )

    # 3. Hesap aktif mi?
    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Hesap deaktif edilmiş. Yöneticinizle iletişime geçin.",
        )

    # 4. JWT token oluştur
    token_data = {
        "sub": str(user.id),
        "email": user.email,
        "role": user.role.value,
        "company_id": str(user.company_id),
    }
    if user.station_id:
        token_data["station_id"] = str(user.station_id)

    access_token = create_access_token(data=token_data)

    return TokenResponse(
        access_token=access_token,
        user_id=str(user.id),
        email=user.email,
        full_name=user.full_name,
        role=user.role.value,
        company_id=str(user.company_id),
        station_id=str(user.station_id) if user.station_id else None,
    )


@router.get("/me", response_model=TokenResponse)
async def get_me(
    current_user: User = Depends(get_current_user),
):
    """Mevcut oturumdaki kullanıcı bilgilerini döndürür."""
    return TokenResponse(
        access_token="",  # Mevcut token zaten header'da
        user_id=str(current_user.id),
        email=current_user.email,
        full_name=current_user.full_name,
        role=current_user.role.value,
        company_id=str(current_user.company_id),
        station_id=str(current_user.station_id) if current_user.station_id else None,
    )
