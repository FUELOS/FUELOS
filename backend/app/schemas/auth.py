"""
FuelOS — Auth Pydantic şemaları.
Login request/response ve token modelleri.
"""

from pydantic import BaseModel, EmailStr


class LoginRequest(BaseModel):
    """Kullanıcı giriş isteği."""
    email: str
    password: str


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
