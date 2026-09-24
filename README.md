# FuelOS — Akaryakıt İstasyonları İçin Dijital Operasyon Katmanı
## Faz 1: Temel Platform (V1.0 MVP)

FuelOS, akaryakıt istasyonlarının mevcut donanım ve otomasyon sistemlerini değiştirmeden, onların üzerine kurulan dijital bir operasyon ve doğrulama katmanıdır.

---

## 🛠️ Teknoloji Yığını

- **Backend**: Python 3.12, FastAPI, SQLAlchemy 2.0 (Async), asyncpg, Alembic, Pydantic v2
- **Veritabanı**: PostgreSQL 16 (Docker ile tek komutta ayağa kalkar)
- **Frontend**: React 19, TypeScript, Vite, Tailwind CSS v4, Lucide Icons, Axios, React Router v7
- **Güvenlik**: JWT (JSON Web Tokens), bcrypt şifreleme, RBAC (Rol Bazlı Yetkilendirme)

---

## 🚀 Hızlı Başlangıç

### 1. PostgreSQL Veritabanını Başlatma (Docker)
Proje ana dizininde:
```bash
docker compose up -d
```
*(PostgreSQL port 5432 üzerinde `fuelos_db` veritabanı ile çalışır.)*

### 2. Backend'i Başlatma
`run_backend.bat` dosyasına çift tıklayabilir veya konsoldan:
```bash
cd backend
.\venv\Scripts\uvicorn.exe app.main:app --host 127.0.0.1 --port 8000 --reload
```
- **API Adresi**: `http://127.0.0.1:8000`
- **İnteraktif Swagger Dokümantasyonu**: `http://127.0.0.1:8000/docs`
- **ReDoc Dokümantasyonu**: `http://127.0.0.1:8000/redoc`

### 3. Frontend'i Başlatma
`run_frontend.bat` dosyasına çift tıklayabilir veya konsoldan:
```bash
cd frontend
npm run dev
```
- **Web Arayüzü**: `http://localhost:5173`

---

## 🔑 Varsayılan Giriş Bilgileri (Demo Seed)

Sistem ilk çalıştığında otomatik tohumlama (seed) mekanizması devreye girer:

| Rol | E-posta | Şifre | Yetki Kapsamı |
|-----|---------|-------|---------------|
| **SuperAdmin** | `admin@fuelos.com` | `FuelOS2026!` | Şirket genelinde tam yetki; tüm istasyonları, kullanıcıları ve mutabakatları yönetir. |
| **Kasiyer (Demo)** | `kasiyer@fuelos.com` | `Kasiyer2026!` | Sadece atandığı istasyonda vardiya açar/kapatır ve satış kaydı girer. |

---

## 🏛️ Veritabanı Şeması ve Modeller

1. **`companies`**: B2B müşterisi (şirket). İstasyonların ve personelin üst çatısı.
2. **`stations`**: Fiziksel akaryakıt istasyonları (`code`, `name`, `city`, `district`, `address`).
3. **`users`**: Kullanıcılar (`email`, `hashed_password`, `role`: `super_admin`, `station_manager`, `cashier`).
4. **`shifts`**: Vardiya periyotları (`opening_cash`, `closing_cash`, `status`: `open` / `closed`, `notes`).
5. **`transactions`**: Değiştirilemez (immutable) satış kayıtları (`type`: `fuel`/`market`/`other`, `payment_method`: `cash`/`credit_card`/`eft`/`veresiye`, `amount`, `liters`, `fuel_type`).

---

## 📡 REST API Endpoint Haritası (22 Adet)

### Kimlik Doğrulama (Auth)
- `POST /api/auth/login`: JWT access token üretir
- `GET /api/auth/me`: Oturum açan kullanıcının bilgilerini ve rolünü getirir

### Şirket Yönetimi (SuperAdmin Only)
- `GET /api/companies`: Şirketleri listele
- `POST /api/companies`: Yeni şirket oluştur
- `GET /api/companies/{id}`: Şirket detayı
- `PATCH /api/companies/{id}`: Şirket güncelle

### İstasyon Yönetimi
- `GET /api/stations`: İstasyonları listele (Role göre filtrelenir)
- `POST /api/stations`: Yeni istasyon oluştur (SuperAdmin)
- `GET /api/stations/{id}`: İstasyon detayı
- `PATCH /api/stations/{id}`: İstasyon güncelle (SuperAdmin)

### Kullanıcı Yönetimi
- `GET /api/users`: Kullanıcıları listele
- `POST /api/users`: Yeni kullanıcı tanımla (SuperAdmin her rolü, StationManager kasiyer açabilir)
- `GET /api/users/{id}`: Kullanıcı detayı
- `PATCH /api/users/{id}`: Kullanıcı güncelle

### Vardiya Yönetimi (Shifts)
- `GET /api/shifts`: Vardiya geçmişi ve açık vardiyalar
- `POST /api/shifts/open`: Yeni vardiya başlat (`opening_cash`, `station_id`)
- `GET /api/shifts/{id}`: Vardiya detayı
- `POST /api/shifts/{id}/close`: Vardiyayı kapat (`closing_cash`, `notes`)

### Satış ve İşlemler (Transactions)
- `POST /api/transactions`: Yeni satış/işlem kaydı gir (`type`, `payment_method`, `amount`, `liters`, `fuel_type`)
- `GET /api/transactions`: Satış akışı (filtrelemeli)
- `GET /api/transactions/summary`: Özet finansal ve litre hacmi istatistikleri

### Dashboard
- `GET /api/dashboard`: Günlük ciro, satılan yakıt litresi, işlem sayısı, ödeme kanalları dağılımı (Nakit, POS, EFT, Veresiye) ve canlı açık vardiyalar tablosu.

---

## 🧪 Test Doğrulaması

Uçtan uca full-stack entegrasyon testini çalıştırmak için:
```bash
cd backend
.\venv\Scripts\python.exe test_full_flow.py
```
*Tüm test adımları (Auth, RBAC, Station, Shift, Transaction, Dashboard mutabakatı) %100 başarıyla doğrulanmıştır.*
