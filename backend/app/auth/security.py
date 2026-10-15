"""
FuelOS — Güvenlik modülü.
Şifre hash/doğrulama (bcrypt) ve JWT token oluşturma/doğrulama.
"""

from datetime import datetime, timedelta, timezone
import hashlib
import hmac

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


def create_password_reset_token(user_id: str, hashed_password: str) -> str:
    """Create a short-lived token invalidated automatically after a password change."""
    password_version = hmac.new(
        settings.SECRET_KEY.encode("utf-8"),
        hashed_password.encode("utf-8"),
        hashlib.sha256,
    ).hexdigest()
    payload = {
        "sub": user_id,
        "purpose": "password_reset",
        "password_version": password_version,
        "exp": datetime.now(timezone.utc) + timedelta(minutes=30),
    }
    return jwt.encode(payload, settings.SECRET_KEY, algorithm=settings.ALGORITHM)


def verify_password_reset_token(token: str, hashed_password: str) -> str | None:
    """Return the user ID for a valid, unused password reset token."""
    try:
        payload = jwt.decode(
            token,
            settings.SECRET_KEY,
            algorithms=[settings.ALGORITHM],
        )
    except JWTError:
        return None

    if payload.get("purpose") != "password_reset":
        return None

    expected_version = hmac.new(
        settings.SECRET_KEY.encode("utf-8"),
        hashed_password.encode("utf-8"),
        hashlib.sha256,
    ).hexdigest()
    token_version = payload.get("password_version")
    user_id = payload.get("sub")
    if (
        not isinstance(token_version, str)
        or not hmac.compare_digest(token_version, expected_version)
        or not isinstance(user_id, str)
    ):
        return None
    return user_id
