"""
FuelOS — Alembic migration ortamı.
Async SQLAlchemy engine kullanarak migration'ları çalıştırır.
"""

import asyncio
from logging.config import fileConfig

from sqlalchemy import pool
from sqlalchemy.engine import Connection
from sqlalchemy.ext.asyncio import async_engine_from_config

from alembic import context

# ─── Uygulama import'ları ───
from app.config import get_settings
from app.database import Base

# Tüm modelleri import et — Alembic autogenerate için gerekli
import app.models  # noqa: F401

# ─── Alembic yapılandırması ───
config = context.config

# .env dosyasından DATABASE_URL'yi oku
settings = get_settings()
config.set_main_option("sqlalchemy.url", settings.DATABASE_URL)

# Logging yapılandırması
if config.config_file_name is not None:
    fileConfig(config.config_file_name)

# Alembic'e hangi metadata'yı izleyeceğini söyle
target_metadata = Base.metadata


def run_migrations_offline() -> None:
    """
    Offline modda migration çalıştırır.
    Veritabanına bağlanmadan SQL üretir.
    """
    url = config.get_main_option("sqlalchemy.url")
    context.configure(
        url=url,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
    )

    with context.begin_transaction():
        context.run_migrations()


def do_run_migrations(connection: Connection) -> None:
    """Senkron bağlantı üzerinden migration'ları çalıştırır."""
    context.configure(
        connection=connection,
        target_metadata=target_metadata,
    )

    with context.begin_transaction():
        context.run_migrations()


async def run_async_migrations() -> None:
    """
    Async engine oluşturur ve migration'ları çalıştırır.
    asyncpg driver'ını kullanır.
    """
    connectable = async_engine_from_config(
        config.get_section(config.config_ini_section, {}),
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
    )

    async with connectable.connect() as connection:
        await connection.run_sync(do_run_migrations)

    await connectable.dispose()


def run_migrations_online() -> None:
    """
    Online modda migration çalıştırır.
    Async engine ile veritabanına bağlanır.
    """
    asyncio.run(run_async_migrations())


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
