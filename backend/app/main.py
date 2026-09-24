"""
FuelOS — FastAPI ana uygulama.
Tüm router'ları bağlar, CORS'u yapılandırır, başlangıçta seed çalıştırır.
"""

import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import get_settings
from app.database import async_session_factory
from app.services.seed import seed_initial_data

# ─── Router import'ları ───
from app.api.auth import router as auth_router
from app.api.companies import router as companies_router
from app.api.stations import router as stations_router
from app.api.users import router as users_router
from app.api.shifts import router as shifts_router
from app.api.transactions import router as transactions_router
from app.api.dashboard import router as dashboard_router

settings = get_settings()

# ─── Logging ───
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s | %(levelname)-7s | %(name)s | %(message)s",
)
logger = logging.getLogger(__name__)


# ─── Lifespan (startup/shutdown) ───
@asynccontextmanager
async def lifespan(app: FastAPI):
    """Uygulama başlatıldığında seed çalıştırır."""
    logger.info(f"🚀 {settings.APP_NAME} başlatılıyor...")

    # Veritabanı seed — ilk SuperAdmin oluştur
    try:
        async with async_session_factory() as session:
            await seed_initial_data(session)
    except Exception as e:
        logger.warning(f"Seed çalıştırılamadı (DB bağlantısı olmayabilir): {e}")

    yield

    logger.info(f"👋 {settings.APP_NAME} kapatılıyor...")


# ─── FastAPI Uygulaması ───
app = FastAPI(
    title=settings.APP_NAME,
    description="Akaryakıt İstasyonları İçin Dijital Operasyon Platformu",
    version="1.0.0",
    lifespan=lifespan,
)

# CORS — Frontend (React Vite dev server) ile iletişim
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ─── Router'ları bağla ───
app.include_router(auth_router)
app.include_router(companies_router)
app.include_router(stations_router)
app.include_router(users_router)
app.include_router(shifts_router)
app.include_router(transactions_router)
app.include_router(dashboard_router)


# ─── Health Check ───
@app.get("/health", tags=["System"])
async def health_check():
    """Sistem sağlık kontrolü."""
    return {"status": "healthy", "app": settings.APP_NAME}
