from pydantic_settings import BaseSettings
from functools import lru_cache


class Settings(BaseSettings):
    """FuelOS uygulama ayarları. Değerler .env dosyasından okunur."""

    # PostgreSQL
    DATABASE_URL: str = "postgresql+asyncpg://fuelos_user:fuelos_pass@localhost:5432/fuelos_db"

    # JWT
    SECRET_KEY: str = "CHANGE_ME_TO_A_RANDOM_SECRET_KEY_IN_PRODUCTION"
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 480  # 8 saat (bir vardiya süresi)

    # App
    APP_NAME: str = "FuelOS"
    DEBUG: bool = False

    model_config = {
        "env_file": ".env",
        "env_file_encoding": "utf-8",
    }


@lru_cache()
def get_settings() -> Settings:
    """Singleton Settings nesnesi döndürür (her çağrıda yeniden parse etmez)."""
    return Settings()
