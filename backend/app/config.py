from pydantic_settings import BaseSettings
from functools import lru_cache
import warnings


_DEFAULT_SECRET = "CHANGE_ME_TO_A_RANDOM_SECRET_KEY_IN_PRODUCTION"


class Settings(BaseSettings):
    """FuelOS uygulama ayarları. Değerler .env dosyasından okunur."""

    # PostgreSQL
    DATABASE_URL: str = "postgresql+asyncpg://fuelos_user:fuelos_pass@localhost:5432/fuelos_db"

    # JWT
    SECRET_KEY: str = _DEFAULT_SECRET
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 480  # 8 saat (bir vardiya süresi)

    # JSON object: station UUID -> base64-encoded public Ed25519 PEM.
    # Private signer keys stay outside FuelOS. No global cross-station trust.
    ZK_SOURCE_PUBLIC_KEYS_JSON: str = "{}"
    ZK_MANAGER_PUBLIC_KEYS_JSON: str = "{}"

    # App
    APP_NAME: str = "FuelOS"
    DEBUG: bool = False

    model_config = {
        "env_file": ".env",
        "env_file_encoding": "utf-8",
    }

    def validate_security(self) -> None:
        """Production ortamında zayıf SECRET_KEY kullanımını engelle."""
        if not self.DEBUG and self.SECRET_KEY == _DEFAULT_SECRET:
            raise RuntimeError(
                "[FuelOS] GÜVENLİK HATASI: Production ortamında varsayılan SECRET_KEY kullanılamaz. "
                ".env dosyasına güçlü bir SECRET_KEY tanımlayın."
            )
        if not self.DEBUG and self.SECRET_KEY == _DEFAULT_SECRET:
            pass  # Yukarıda zaten raise edildi
        if len(self.SECRET_KEY) < 32 and not self.DEBUG:
            warnings.warn(
                "[FuelOS] UYARI: SECRET_KEY çok kısa (< 32 karakter). "
                "Güvenlik için en az 64 karakter kullanın.",
                stacklevel=2,
            )


@lru_cache()
def get_settings() -> Settings:
    """Singleton Settings nesnesi döndürür (her çağrıda yeniden parse etmez)."""
    settings = Settings()
    settings.validate_security()
    return settings
