from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine, async_sessionmaker
from sqlalchemy.orm import DeclarativeBase

from app.config import get_settings

settings = get_settings()

# Async engine — connection pool ayarları production-ready
engine = create_async_engine(
    settings.DATABASE_URL,
    echo=settings.DEBUG,  # SQL logları sadece DEBUG modda
    pool_size=20,
    max_overflow=10,
    pool_pre_ping=True,  # Bağlantı kopmuşsa otomatik yenile
)

# Session factory
async_session_factory = async_sessionmaker(
    bind=engine,
    class_=AsyncSession,
    expire_on_commit=False,  # Commit sonrası nesnelere erişimi koru
)


class Base(DeclarativeBase):
    """Tüm SQLAlchemy modelleri bu sınıftan türer."""
    pass


async def get_db() -> AsyncSession:
    """
    FastAPI Dependency: Her istek için bir veritabanı session'ı oluşturur.
    İstek tamamlandığında (başarılı/hatalı) session'ı kapatır.
    """
    async with async_session_factory() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise
        finally:
            await session.close()
