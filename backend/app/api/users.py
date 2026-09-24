"""
FuelOS — User API Router.
Kullanıcı CRUD işlemleri.
- SuperAdmin: Şirketteki tüm kullanıcıları yönetir.
- StationManager: Kendi istasyonundaki kasiyerleri yönetir.
"""

import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.user import User
from app.models.station import Station
from app.models.base import UserRole
from app.auth.dependencies import get_current_user, require_role
from app.auth.security import hash_password
from app.schemas.user import UserCreate, UserUpdate, UserResponse

router = APIRouter(prefix="/api/users", tags=["Users"])


@router.get("", response_model=list[UserResponse])
async def list_users(
    current_user: User = Depends(
        require_role(UserRole.SUPER_ADMIN, UserRole.STATION_MANAGER)
    ),
    db: AsyncSession = Depends(get_db),
):
    """
    Kullanıcıları listeler.
    - SuperAdmin: Şirketteki tüm kullanıcılar.
    - StationManager: Kendi istasyonundaki kullanıcılar.
    """
    query = select(User).where(User.company_id == current_user.company_id)

    if current_user.role == UserRole.STATION_MANAGER:
        query = query.where(User.station_id == current_user.station_id)

    query = query.order_by(User.full_name)
    result = await db.execute(query)
    return result.scalars().all()


@router.get("/{user_id}", response_model=UserResponse)
async def get_user(
    user_id: uuid.UUID,
    current_user: User = Depends(
        require_role(UserRole.SUPER_ADMIN, UserRole.STATION_MANAGER)
    ),
    db: AsyncSession = Depends(get_db),
):
    """Tek kullanıcı detayı."""
    query = select(User).where(
        User.id == user_id,
        User.company_id == current_user.company_id,
    )

    if current_user.role == UserRole.STATION_MANAGER:
        query = query.where(User.station_id == current_user.station_id)

    result = await db.execute(query)
    user = result.scalar_one_or_none()

    if user is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Kullanıcı bulunamadı veya erişim yetkiniz yok",
        )
    return user


@router.post("", response_model=UserResponse, status_code=status.HTTP_201_CREATED)
async def create_user(
    data: UserCreate,
    current_user: User = Depends(
        require_role(UserRole.SUPER_ADMIN, UserRole.STATION_MANAGER)
    ),
    db: AsyncSession = Depends(get_db),
):
    """
    Yeni kullanıcı oluşturur.
    - SuperAdmin: Her rolde kullanıcı oluşturabilir.
    - StationManager: Sadece Cashier oluşturabilir (kendi istasyonunda).
    """
    # ── Yetki kontrolleri ──

    # StationManager sadece Cashier oluşturabilir
    if current_user.role == UserRole.STATION_MANAGER:
        if data.role != UserRole.CASHIER:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="İstasyon yöneticisi sadece kasiyer oluşturabilir",
            )
        # StationManager kendi istasyonuna atayabilir
        data.station_id = current_user.station_id

    # SuperAdmin dışında station_id zorunlu (StationManager, Cashier)
    if data.role in (UserRole.STATION_MANAGER, UserRole.CASHIER) and data.station_id is None:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="StationManager ve Cashier için istasyon seçimi zorunludur",
        )

    # SuperAdmin'in station_id'si null olmalı
    if data.role == UserRole.SUPER_ADMIN:
        data.station_id = None

    # station_id geçerliliği — aynı şirkete ait mi?
    if data.station_id is not None:
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

    # E-posta benzersizlik kontrolü
    existing = await db.execute(select(User).where(User.email == data.email))
    if existing.scalar_one_or_none() is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Bu e-posta zaten kayıtlı: {data.email}",
        )

    user = User(
        company_id=current_user.company_id,
        station_id=data.station_id,
        email=data.email,
        hashed_password=hash_password(data.password),
        full_name=data.full_name,
        role=data.role,
    )
    db.add(user)
    await db.flush()
    await db.refresh(user)
    return user


@router.patch("/{user_id}", response_model=UserResponse)
async def update_user(
    user_id: uuid.UUID,
    data: UserUpdate,
    current_user: User = Depends(
        require_role(UserRole.SUPER_ADMIN, UserRole.STATION_MANAGER)
    ),
    db: AsyncSession = Depends(get_db),
):
    """
    Kullanıcı bilgilerini günceller.
    - SuperAdmin: Şirketindeki herkesi güncelleyebilir.
    - StationManager: Sadece kendi istasyonundaki kasiyerleri güncelleyebilir.
    """
    query = select(User).where(
        User.id == user_id,
        User.company_id == current_user.company_id,
    )

    if current_user.role == UserRole.STATION_MANAGER:
        query = query.where(
            User.station_id == current_user.station_id,
            User.role == UserRole.CASHIER,
        )

    result = await db.execute(query)
    user = result.scalar_one_or_none()

    if user is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Kullanıcı bulunamadı veya düzenleme yetkiniz yok",
        )

    # Kendini deaktif edemez
    update_data = data.model_dump(exclude_unset=True)
    if "is_active" in update_data and user.id == current_user.id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Kendi hesabınızı deaktif edemezsiniz",
        )

    # E-posta değişiyorsa benzersizlik kontrolü
    if "email" in update_data and update_data["email"] != user.email:
        existing = await db.execute(
            select(User).where(User.email == update_data["email"])
        )
        if existing.scalar_one_or_none() is not None:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=f"Bu e-posta zaten kayıtlı: {update_data['email']}",
            )

    # Şifre değişiyorsa hashle
    if "password" in update_data:
        password = update_data.pop("password")
        if password:
            update_data["hashed_password"] = hash_password(password)

    for field, value in update_data.items():
        setattr(user, field, value)

    await db.flush()
    await db.refresh(user)
    return user
