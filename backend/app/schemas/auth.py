"""
FuelOS — Auth Pydantic şemaları.
Login request/response ve token modelleri.
"""

from pydantic import BaseModel, EmailStr, Field, field_validator


class LoginRequest(BaseModel):
    """Kullanıcı giriş isteği."""
    email: str
    password: str


class PasswordResetRequest(BaseModel):
    """Request an email with a one-time password reset link."""
    email: EmailStr


class PasswordResetCompleteRequest(BaseModel):
    """Set a new password using a password reset token."""
    token: str
    password: str = Field(min_length=8, max_length=72)

    @field_validator("password")
    @classmethod
    def validate_bcrypt_password_length(cls, value: str) -> str:
        if len(value.encode("utf-8")) > 72:
            raise ValueError("Şifre en fazla 72 UTF-8 bayt olabilir")
        return value


class TokenResponse(BaseModel):
    """JWT token yanıtı."""
    access_token: str
    token_type: str = "bearer"
    user_id: str
    email: str
    full_name: str
    role: str
    company_id: str
    station_id: str | None = None
