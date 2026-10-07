# FuelOS — Akaryakıt İstasyonları İçin Yeni Nesil SaaS Operasyon, ZK Mutabakat & Lisanslama Platformu
> **Next-Gen Fuel Station Multi-Tenant SaaS, Midnight Zero-Knowledge Proof Reconciliation & License Management Platform**

FuelOS; akaryakıt dağıtım şirketleri ve bayiler için fiziksel pompa, otomasyon ve yazar kasa altyapılarına doğrudan dokunmadan, onların üzerine kurulan yüksek güvenlikli çok kiracılı (multi-tenant) SaaS operasyon, kurumsal lisanslama ve **Midnight Zero-Knowledge (ZK)** kriptografik mutabakat katmanıdır.

---

## 🌟 Temel Yetenekler & Mimari Katmanlar (Core Architecture)

### 1. 🛡️ Midnight Zero-Knowledge (ZK) Kriptografik Mutabakat
- **Veri Mahremiyeti (Privacy-Preserving Reconciliation):**  
  İstasyonların anlık litre satışları, nakit akışları ve işçi bazlı ciroları ticari bir sır olarak korunur.
- **Cardano / Midnight ZK Kanıt Motoru:**  
  Vardiya kapandığında hesaplanan kasa mutabakatı (`shifts.zk_proof_status`, `shifts.zk_proof_hash`, `shifts.zk_verified_at`) üzerinden sıfır bilgi kanıtı üretilir. Rakamlar üçüncü taraflara veya SuperAdmin'e ifşa edilmeksizin vardiya mutabakatının matematiksel doğruluğu kriptografik olarak tescillenir.

### 2. 💳 SuperAdmin SaaS Lisanslama & Çoklu Şube Yönetimi
- **Abonelik Seviyeleri (Plans):** `Standart`, `Pro SaaS`, `Kurumsal` lisans paketleri.
- **Otomatik Kilit & Vade Denetimi:** Vadesi geçen istasyonlar arka planda otomatik olarak `past_due` (Ödeme Bekleniyor) statüsüne alınır; gerektiğinde askıya alınır (`suspended`).
- **MRR (Aylık Lisans Geliri) Havuzu:** Platform genelindeki aktif şubelerin toplam aylık abonelik cirosu SuperAdmin panelinde canlı olarak hesaplanır.
- **Tek Tıkla İstasyon & Lisans Yönetimi:** Ana panel üzerinden tek tıkla yeni istasyon açma (`+ Yeni İstasyon Ekle`) ve +30 / +90 gün lisans süresi uzatma modalı.

### 3. 🎭 Kusursuz Rol & Yetki Ayrımı (Strict RBAC)
- **Süper Yönetici (SaaS Platform Sahibi):**  
  Sahadaki pompacının vardiyasını veya iç kasa cirosunu görmez. Menüsünde yalnızca kurumsal modüller yer alır:
  * 🎛️ **Sistem Paneli** (MRR, Canlı Ağ, Lisans Havuzu)
  * 🏢 **İstasyon Yönetimi** (Tüm Şubeler, Pompa Altyapısı, Yetkili Kadrosu)
  * 👥 **Kullanıcılar** (Müdürler, Kasiyerler)
  * ⚙️ **Ayarlar** (SaaS Lisans Otomasyonu, ZK Parametreleri, Multi-Tenant Güvenliği)
- **İstasyon Müdürü (Saha Yöneticisi):**  
  Kendi şubesine kilitlidir (`📍 Ankara Merkez İstasyonu [ANK-01]` sabit kurumsal rozet). Şubesinin vardiyalarını, satış akışını, ZK mutabakat raporlarını ve **Kasa Mutabakat Toleransını (DEC-001 / K-001)** yönetir.
- **Kasiyer / Ön Saha Personeli:**  
  RFID kartı ile pompaya giriş yapar, satışları kaydeder ve gün sonu nakit/POS kasa teslimi yapar.

### 4. ⚖️ Akıllı Kasa Mutabakatı & Dinamik Tolerans Motoru (DEC-001 / K-001)
- **Kasa Doğrulama Kuralı:**  
  $$\text{Beklenen Kasa} = \text{Açılış Nakdi} + \text{Vardiya İçi Nakit Satışlar}$$
- **Kuruş / Bozuk Para Yuvarlama Toleransı:**  
  İstasyonlarda bozuk para bulunamaması nedeniyle gerçekleşen küçük yuvarlama farkları kasayı yapay olarak "Açık" veya "Fazla" göstermez.  
  $$|\text{Kasa Farkı}| \le \text{Tolerans Tutarı} \implies \text{EŞLEŞTİ (Matched)}$$
  *(Tolerans ayarı yalnızca İstasyon Müdürü'nün yetkisindedir).*

### 5. 🎨 Çift Tema & Tam İki Dilli (i18n) Destek
- **Obsidian Dark OLED Teması:** Apple / Linear tarzı derin mat siyah (`#090a0f`, `#111218`, `zinc-800` kenarlıklar).
- **Klasik Aydınlık (Light) Tema:** Göz yormayan, temiz kurumsal açık gri/beyaz palet.
- **Tam TR / EN Desteği:** Navbar üzerinden tek tıkla dil değişimi; tüm tablolar, grafikler, ayarlar ve simülatörler anında seçilen dile çevrilir.

### 6. 📟 Sanal Donanım & Ödeme Simülatörleri
- **Sanal POS Cihazı:** Gerçekçi banka POS cihazı arayüzü, tuş takımı, temassız kart okutma ve banka onay slip dekontu üretimi.
- **Dinamik FAST / QR Transfer:** Dinamik QR kodu üretimi, 120 saniyelik geçerlilik sayacı ve banka dekontu simülasyonu.

---

## 🔑 Güncel Giriş Hesapları (Default Credentials)

Sistem tohumlama (seed) ve test ortamında geçerli olan kullanıcı hesapları:

| Rol (Role) | E-posta (Email) | Şifre (Password) | Açıklama & Yetki Kapsamı |
|---|---|---|---|
| **SuperAdmin** | `admin@fuelos.com` | `FuelOS2026!` | SaaS platform sahibi; tüm şubeleri, lisansları, kullanıcıları ve genel MRR havuzunu yönetir. |
| **İstasyon Müdürü** | `mudur@fuelos.com` | `Mudur2026!` | Ankara Merkez İstasyonu yöneticisi; vardiya mutabakatı, kasa toleransı ve raporları yönetir. |
| **Kasiyer / Ön Saha** | `kasiyer@fuelos.com` | `Kasiyer2026!` | Ön saha satışlarını kaydeder, vardiya açar ve kapanış kasası teslimi yapar. |

---

## 🛠️ Teknoloji Yığını (Tech Stack)

### Backend
* **Çekirdek:** Python 3.12, FastAPI
* **Veritabanı ORM:** SQLAlchemy 2.0 (Tam Asenkron / AsyncIO), `asyncpg` sürücüsü
* **Veritabanı & Migrasyon:** PostgreSQL 16, Alembic (`e6f7a8b9c0d1_add_station_subscription_fields`)
* **Kriptografi & Kanıt:** Midnight ZK Entegrasyon Katmanı, bcrypt, JWT
* **Şema & Doğrulama:** Pydantic v2

### Frontend
* **Çekirdek:** React 19, TypeScript
* **Derleyici:** Vite 8
* **Stil & Tasarım:** Tailwind CSS v4, Lucide React Icons, Obsidian Dark OLED Theme
* **Yönlendirme & Durum:** React Router v7, React Context (`LanguageContext`, `AuthContext`, `ThemeContext`)
* **HTTP İstemcisi:** Axios (JWT Bearer Interceptor)

---

## 🚦 Kurulum ve Çalıştırma (Quickstart Guide)

### 1. PostgreSQL Veritabanı (Docker)
Proje kök dizininde veritabanını başlatın:
```bash
docker compose up -d
```
*(PostgreSQL `5432` portunda `fuelos_db` veritabanı ile çalışır).*

### 2. Backend Başlatma
```bash
cd backend

# Sanal ortamı aktive edin (Windows PowerShell)
.\venv\Scripts\Activate.ps1

# Bağımlılıkları yükleyin
pip install -r requirements.txt

# Veritabanı şemasını güncelleyin (Alembic)
alembic upgrade head

# API sunucusunu başlatın
uvicorn app.main:app --host 127.0.0.1 --port 8000 --reload
```
* **API Adresi:** `http://127.0.0.1:8000`
* **Swagger API Belgeleri:** `http://127.0.0.1:8000/docs`

### 3. Frontend Başlatma
```bash
cd frontend
npm install
npm run dev
```
* **Kullanıcı Arayüzü:** `http://localhost:5173`
* **Üretim Derlemesi:** `npm run build`

---

## 📡 Temel API Endpoint Haritası

| Kategori | Metot & Yol | Rol | Açıklama |
|---|---|---|---|
| **Kimlik** | `POST /api/auth/login` | Herkes | JWT token üretir |
| **Kimlik** | `GET /api/auth/me` | Herkes | Oturum açan kullanıcının yetki ve şube profili |
| **SaaS Panel** | `GET /api/admin/dashboard` | SuperAdmin | Tüm şubelerin konsolide lisans, MRR ve vardiya özeti |
| **İstasyon** | `GET /api/stations` | Herkes | İstasyon listesi (Role göre yetkilendirilmiş) |
| **İstasyon** | `POST /api/stations` | SuperAdmin | Yeni istasyon kaydı ve başlangıç SaaS paketi tanımlama |
| **Abonelik** | `PATCH /api/stations/{id}/subscription` | SuperAdmin | İstasyon lisansını askıya alma / aktifleştirme ve gün uzatma |
| **Kullanıcı** | `GET /api/users` | Admin/Müdür | Şirket / istasyon çalışanlarını listele |
| **Kullanıcı** | `POST /api/users` | Admin/Müdür | Yeni istasyon müdürü veya kasiyer oluştur |
| **Pompalar** | `GET /api/pumps/station/{id}` | Herkes | İstasyona bağlı fiziksel pompalar |
| **Pompalar** | `POST /api/pumps` | Admin/Müdür | Yeni pompa / ada tanımlama |
| **Vardiya** | `POST /api/shifts/open` | Müdür/Kasiyer | Yeni vardiya açılışı (RFID & açılış nakdi) |
| **Vardiya** | `POST /api/shifts/{id}/close` | Müdür/Kasiyer | Vardiya kapanışı & Midnight ZK mutabakat mühürleme |
| **Ayarlar** | `GET/PUT /api/settings/tolerance` | Müdür | Kasa mutabakat bozuk para tolerans limiti (DEC-001) |

---

## 🧪 Test Doğrulaması

Sistem testlerini çalıştırmak için:
```bash
cd backend
.\venv\Scripts\python.exe test_full_flow.py
```
*Tüm test adımları (Kimlik doğrulama, RBAC rol izolasyonu, İstasyon & Pompa CRUD, Vardiya açma/kapatma, Tolerans motoru ve Dashboard API) %100 başarıyla tamamlanmaktadır.*

---

&copy; 2026 **FuelOS Platform Katmanı**. Tüm hakları saklıdır.
