"""
FuelOS — Kimlik doğrulama ve yetkilendirme dependency'leri.
FastAPI Depends() ile kullanılır.

Kullanım:
    @router.get("/admin-only")
    async def admin_endpoint(user: User = Depends(require_role(UserRole.SUPER_ADMIN))):
        ...
"""

import uuid
from typing import Callable

from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.user import User
from app.models.base import UserRole
from app.auth.security import decode_access_token

# OAuth2 şeması — Swagger UI'da "Authorize" butonunu etkinleştirir
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/auth/login")


async def get_current_user(
    token: str = Depends(oauth2_scheme),
    db: AsyncSession = Depends(get_db),
) -> User:
    """
    JWT token'dan mevcut kullanıcıyı çözümler ve veritabanından getirir.
    Geçersiz token veya kullanıcı bulunamazsa 401 hatası fırlatır.
    """
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Geçersiz veya süresi dolmuş token",
        headers={"WWW-Authenticate": "Bearer"},
    )

    payload = decode_access_token(token)
    if payload is None:
        raise credentials_exception

    user_id_str: str | None = payload.get("sub")
    if user_id_str is None:
        raise credentials_exception

    try:
        user_id = uuid.UUID(user_id_str)
    except ValueError:
        raise credentials_exception

    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()

    if user is None:
        raise credentials_exception

    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Hesap deaktif edilmiş",
        )

    return user


async def get_current_active_user(
    current_user: User = Depends(get_current_user),
) -> User:
    """Aktif kullanıcıyı döndürür (ek kontrol katmanı)."""
    return current_user


def require_role(*allowed_roles: UserRole) -> Callable:
    """
    Belirtilen rollere sahip kullanıcıları geçirir, diğerlerini 403 ile reddeder.

    Kullanım:
        Depends(require_role(UserRole.SUPER_ADMIN))
        Depends(require_role(UserRole.SUPER_ADMIN, UserRole.STATION_MANAGER))
    """

    async def role_checker(
        current_user: User = Depends(get_current_user),
    ) -> User:
        if current_user.role not in allowed_roles:
            allowed = ", ".join(r.value for r in allowed_roles)
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Bu işlem için yetkiniz yok. Gerekli rol(ler): {allowed}",
            )
        return current_user

    return role_checker
