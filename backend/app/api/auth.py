"""
FuelOS — Auth API Router.
Login and password recovery endpoints.
"""

import logging
import smtplib
import uuid
from urllib.parse import quote

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.concurrency import run_in_threadpool
from jose import JWTError, jwt
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.security import (
    create_access_token,
    create_password_reset_token,
    hash_password,
    verify_password,
    verify_password_reset_token,
)
from app.config import get_settings
from app.database import get_db
from app.models.user import User
from app.auth.dependencies import get_current_user
from app.schemas.auth import (
    LoginRequest,
    PasswordResetCompleteRequest,
    PasswordResetRequest,
    TokenResponse,
)
from app.services.mailer import send_password_reset_email

router = APIRouter(prefix="/api/auth", tags=["Authentication"])
logger = logging.getLogger(__name__)
settings = get_settings()


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


@router.post("/forgot-password")
async def forgot_password(
    request: PasswordResetRequest,
    db: AsyncSession = Depends(get_db),
):
    """Send a short-lived reset link without disclosing whether an account exists."""
    if not settings.SMTP_HOST or not settings.SMTP_FROM_EMAIL:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Şifre sıfırlama e-posta servisi henüz yapılandırılmadı.",
        )
    if bool(settings.SMTP_USERNAME) != bool(settings.SMTP_PASSWORD):
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Şifre sıfırlama e-posta servisi yapılandırması eksik.",
        )
    if settings.SMTP_USE_SSL and settings.SMTP_USE_TLS:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Şifre sıfırlama e-posta servisi yapılandırması geçersiz.",
        )

    result = await db.execute(
        select(User).where(func.lower(User.email) == str(request.email).lower())
    )
    user = result.scalar_one_or_none()
    if user is not None and user.is_active:
        token = create_password_reset_token(str(user.id), user.hashed_password)
        reset_url = f"{settings.FRONTEND_URL.rstrip('/')}/login?reset_token={quote(token)}"
        try:
            await run_in_threadpool(send_password_reset_email, user.email, reset_url)
        except (OSError, smtplib.SMTPException, RuntimeError) as exc:
            logger.error("Password reset email delivery failed (%s)", type(exc).__name__)
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail="Şifre sıfırlama e-postası gönderilemedi. Lütfen daha sonra tekrar deneyin.",
            ) from exc

    return {
        "message": "E-posta adresi kayıtlıysa şifre sıfırlama bağlantısı gönderildi."
    }


@router.post("/reset-password")
async def reset_password(
    request: PasswordResetCompleteRequest,
    db: AsyncSession = Depends(get_db),
):
    """Set a new password with a valid, unexpired, single-use reset link."""
    try:
        payload = jwt.decode(
            request.token,
            settings.SECRET_KEY,
            algorithms=[settings.ALGORITHM],
        )
        user_id = uuid.UUID(str(payload.get("sub")))
    except (JWTError, ValueError, TypeError):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Şifre sıfırlama bağlantısı geçersiz veya süresi dolmuş.",
        )

    result = await db.execute(
        select(User).where(User.id == user_id).with_for_update()
    )
    user = result.scalar_one_or_none()
    verified_user_id = (
        verify_password_reset_token(request.token, user.hashed_password)
        if user is not None and user.is_active
        else None
    )
    if verified_user_id != str(user_id):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Şifre sıfırlama bağlantısı geçersiz veya süresi dolmuş.",
        )

    user.hashed_password = hash_password(request.password)
    await db.commit()
    return {"message": "Şifreniz başarıyla güncellendi."}


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
