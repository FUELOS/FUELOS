"""
FuelOS — Güvenlik modülü.
Şifre hash/doğrulama (bcrypt) ve JWT token oluşturma/doğrulama.
"""

from datetime import datetime, timedelta, timezone

import bcrypt
from jose import JWTError, jwt

from app.config import get_settings

settings = get_settings()


# ─── Şifre Hash (doğrudan bcrypt kullanımı — passlib uyumsuzluk sorunu nedeniyle) ───

def hash_password(password: str) -> str:
    """Düz metin şifreyi bcrypt ile hashler."""
    password_bytes = password.encode("utf-8")
    salt = bcrypt.gensalt(rounds=12)
    hashed = bcrypt.hashpw(password_bytes, salt)
    return hashed.decode("utf-8")


def verify_password(plain_password: str, hashed_password: str) -> bool:
    """Düz metin şifreyi hashlenmiş şifre ile karşılaştırır."""
    try:
        return bcrypt.checkpw(
            plain_password.encode("utf-8"),
            hashed_password.encode("utf-8"),
        )
    except (ValueError, TypeError):
        return False


# ─── JWT Token ───

def create_access_token(data: dict, expires_delta: timedelta | None = None) -> str:
    """
    JWT access token oluşturur.

    Args:
        data: Token payload'ına eklenecek veriler (sub, role, vb.)
        expires_delta: Token geçerlilik süresi (varsayılan: config'den okunur)

    Returns:
        Encoded JWT string
    """
    to_encode = data.copy()

    if expires_delta:
        expire = datetime.now(timezone.utc) + expires_delta
    else:
        expire = datetime.now(timezone.utc) + timedelta(
            minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES
        )

    to_encode.update({"exp": expire})
    encoded_jwt = jwt.encode(
        to_encode,
        settings.SECRET_KEY,
        algorithm=settings.ALGORITHM,
    )
    return encoded_jwt


def decode_access_token(token: str) -> dict | None:
    """
    JWT token'ı çözümler ve payload'ı döndürür.
    Geçersiz veya süresi dolmuş token için None döndürür.
    """
    try:
        payload = jwt.decode(
            token,
            settings.SECRET_KEY,
            algorithms=[settings.ALGORITHM],
        )
        return payload
    except JWTError:
        return None
