# FuelOS — Akaryakıt İstasyonları İçin Yeni Nesil Dijital Operasyon & Mutabakat Platformu
> **Next-Gen Fuel Station Shift, Pump & Cash Reconciliation Platform**

FuelOS, akaryakıt istasyonlarının mevcut pompa, otomasyon ve yazar kasa altyapılarına dokunmadan, onların üzerine kurulan yüksek güvenlikli dijital operasyon ve akıllı mutabakat katmanıdır.

---

## 🚀 Öne Çıkan Temel Yetenekler (Core Features)

- 🌐 **Tam Çift Dilli Altyapı (Full Turkish & English i18n):**
  - Navbar üzerindeki tek tıkla dil değişimi (`TR` / `EN`).
  - Dashboard, Canlı Ön Saha İşçileri, Satış Akışı, Raporlar, İstasyon & Pompa Yönetimi, Kullanıcı Yönetimi, Ayarlar ve tüm interaktif modallar (Sanal POS, FAST/QR, Vardiya Aç/Kapat) anlık olarak seçilen dile çevrilir.
  - Dil tercihi yerel depolamada (`localStorage`) kalıcı olarak saklanır.

- 👨‍💼 **Ön Saha Personeli (Forecourt Attendant) & RFID Entegrasyonu:**
  - Vardiya başlangıcında personele özel avatar / fotoğraf seçimi ve RFID kart kimliklendirmesi.
  - Pompa bazlı veya serbest saha görevlisi olarak vardiya ataması.
  - Ön saha personelinin anlık satılan litresi, nakit, kredi kartı ve FAST tahsilatlarının kart bazlı canlı takibi.

- ⚖️ **Akıllı Kasa Mutabakatı & Dinamik Tolerans Motoru (DEC-001 / K-001):**
  - Kasa doğrulama kuralı:
    $$\text{Beklenen Kasa} = \text{Açılış Nakdi} + \text{Vardiya İçi Nakit Satışlar}$$
  - **Dinamik Tolerans (Ayarlar Modülü):** İstasyonlarda bozuk para / kuruş yuvarlamalarından kaynaklanan küçük farkların kasayı yapay olarak açık veya fazla göstermesini engeller.
  - Tolerans limiti (varsayılan: $\pm 50.00$ ₺) dahilindeki farklar yeşil renkte **"Tolerans İçi"** olarak etiketlenir; limiti aşan farklar otomatik olarak **"KASA AÇIĞI"** veya **"KASA FAZLASI"** olarak raporlanır.

- ⏱️ **Otomatik Vardiya Kapanış Mekanizması:**
  - Vardiya başlatılırken 8 saat, 12 saat veya serbest süre seçimi.
  - Arka plan zamanlayıcısı ile süre dolduğunda vardiya güvenli şekilde kilitlenir.

- 💳 **Sanal Donanım & Ödeme Simülatörleri:**
  - **Sanal POS Simülatörü:** Gerçekçi banka POS cihazı arayüzü, sanal tuş takımı, temassız kart okutma ve banka onay slip dekontu.
  - **Dinamik QR / FAST Transfer Simülatörü:** Dinamik QR kodu üretimi, 120 saniyelik geçerlilik sayacı ve FAST banka transfer dekontu simülasyonu.

- 🏢 **SuperAdmin Multi-Station Genel Yönetim Paneli:**
  - Şirket bünyesindeki tüm istasyonların anlık açık vardiya sayıları, günlük ciroları, satılan toplam litreleri ve aktif personel durumları tek merkezden izlenir.

---

## 🔑 Güncel Giriş Bilgileri (Active Credentials)

Sistem tohumlama (seed) ve test ortamında geçerli olan kullanıcı hesapları:

| Rol (Role) | E-posta (Email) | Şifre (Password) | Açıklama & Yetki Kapsamı |
|---|---|---|---|
| **SuperAdmin** | `admin@fuelos.com` | `FuelOS2026!` | Tüm istasyonları, şirketleri, pompaları, tolerans ayarlarını ve personelleri tam yetkiyle yönetir. |
| **İstasyon Müdürü** | `mudur@fuelos.com` | `Mudur2026!` | Bağlı olduğu istasyonun vardiyalarını, pompalarını, raporlarını ve kasiyerlerini yönetir. |
| **Kasiyer / Ön Saha** | `kasiyer@fuelos.com` | `Kasiyer2026!` | Ön saha satışlarını kaydeder, vardiya açar ve kapanış kasası teslimi yapar. |

---

## 🛠️ Teknoloji Mimarisi (Tech Stack)

### Backend
- **Dil & Framework:** Python 3.12, FastAPI
- **Veritabanı ORM:** SQLAlchemy 2.0 (Tam Asenkron / AsyncIO), asyncpg sürücüsü
- **Veritabanı & Geçişler:** PostgreSQL 16, Alembic Migration Motoru
- **Doğrulama & Şemalar:** Pydantic v2
- **Güvenlik & Auth:** JWT (JSON Web Tokens), bcrypt şifreleme, RBAC (Rol Bazlı Yetki Denetimi)

### Frontend
- **Kütüphane & Dil:** React 19, TypeScript
- **Derleme & Paketleme:** Vite 8
- **Stil & Tasarım:** Tailwind CSS v4, Lucide Icons, Glassmorphism & Responsive UI
- **Yönlendirme & Durum:** React Router v7, Context API (`LanguageContext`, `AuthContext`, `ThemeContext`)
- **İstemci:** Axios (JWT Interceptor ve Bearer Token Yönetimi)

---

## 🚦 Kurulum ve Çalıştırma (Setup & Run)

### 1. PostgreSQL Veritabanı (Docker)
Proje kök dizininde PostgreSQL konteynerini başlatın:
```bash
docker compose up -d
```
*(PostgreSQL `5432` portunda `fuelos_db` veritabanı ile ayağa kalkar).*

### 2. Backend Kurulumu ve Başlatma
```bash
cd backend
# Sanal ortamı aktive edin (Windows)
.\venv\Scripts\Activate.ps1

# Bağımlılıkları yükleyin
pip install -r requirements.txt

# Veritabanı tablolarını en güncel sürüme güncelleyin
alembic upgrade head

# API sunucusunu başlatın
uvicorn app.main:app --host 127.0.0.1 --port 8000 --reload
```
- **API Adresi:** `http://127.0.0.1:8000`
- **Swagger UI:** `http://127.0.0.1:8000/docs`
- **ReDoc:** `http://127.0.0.1:8000/redoc`

### 3. Frontend Kurulumu ve Başlatma
```bash
cd frontend
npm install
npm run dev
```
- **Arayüz Adresi:** `http://localhost:5173`
- Üretim Derlemesi Doğrulaması: `npm run build`

---

## 📡 REST API Endpoint Özeti

| Kategori | Metot & Yol | Açıklama |
|---|---|---|
| **Auth** | `POST /api/auth/login` | JWT Erişim tokenı üretir |
| **Auth** | `GET /api/auth/me` | Giriş yapmış kullanıcının profilini ve rolünü getirir |
| **Admin** | `GET /api/admin/dashboard` | SuperAdmin için tüm şubelerin konsolide finansal ve vardiya özeti |
| **İstasyonlar** | `GET /api/stations` | İstasyonları listele (Role göre filtrelenir) |
| **İstasyonlar** | `POST /api/stations` | Yeni istasyon tanımla (SuperAdmin) |
| **Pompalar** | `GET /api/pumps/station/{id}` | İstasyona bağlı fiziksel pompaları listele |
| **Pompalar** | `POST /api/pumps` | Yeni pompa ekle |
| **Vardiya** | `GET /api/shifts` | Vardiyaları listele (Açık/Kapalı filtreleri) |
| **Vardiya** | `POST /api/shifts/open` | Yeni vardiya başlat (İstasyon, Pompa, Personel, Açılış Kasası) |
| **Vardiya** | `POST /api/shifts/{id}/close` | Vardiyayı kapat ve otomatik mutabakat yap |
| **İşlemler** | `POST /api/transactions` | Yeni akaryakıt satış kaydı ekle |
| **İşlemler** | `GET /api/transactions` | Satış kayıtları akışı |
| **Dashboard** | `GET /api/dashboard` | Günlük canlı mutabakat, işçi kartları ve ürün dağılımı |
| **Simülatör** | `POST /api/simulate/pos` | Sanal POS işlem simülasyonu |
| **Simülatör** | `POST /api/simulate/qr` | FAST / QR işlem simülasyonu |

---

## 🧪 Test Doğrulaması (Test Verification)

Full-stack akış ve mutabakat testini çalıştırmak için:
```bash
cd backend
.\venv\Scripts\python.exe test_full_flow.py
```
*Tüm test adımları (Kimlik doğrulama, RBAC, İstasyon ve Pompa oluşturma, Vardiya açma/kapatma, Dinamik Tolerans ve Otomatik Kasa Mutabakatı) %100 başarıyla tamamlanmaktadır.*

---

&copy; 2026 **FuelOS Platform Katmanı**. Tüm hakları saklıdır.
