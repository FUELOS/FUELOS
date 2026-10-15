# FuelOS — Akaryakıt İstasyonları İçin Yeni Nesil SaaS Operasyon, ZK Mutabakat & Lisanslama Platformu
> **Next-Gen Fuel Station Multi-Tenant SaaS, Midnight Zero-Knowledge Proof Reconciliation & License Management Platform**

FuelOS; akaryakıt dağıtım şirketleri ve bayiler için fiziksel pompa, otomasyon ve yazar kasa altyapılarına doğrudan dokunmadan, onların üzerine kurulan yüksek güvenlikli çok kiracılı (multi-tenant) SaaS operasyon, kurumsal lisanslama ve **Midnight Zero-Knowledge (ZK)** kriptografik mutabakat katmanıdır.

---
Giriş;
Süper Admin: admin@fuelos.com — FuelOS2026!

İstasyon Müdürü: mudur@fuelos.com — Mudur2026!

Kasiyer: kasiyer@fuelos.com — Kasiyer2026!

## 🌟 Temel Yetenekler & Mimari Katmanlar (Core Architecture)

### 1. 🛡️ Midnight Zero-Knowledge (ZK) Kriptografik Mutabakat
- **Veri Mahremiyeti (Privacy-Preserving Reconciliation):**  
  İstasyonların anlık litre satışları, nakit akışları ve işçi bazlı ciroları ticari bir sır olarak korunur.
- **Cardano / Midnight ZK Kanıt Motoru:**  
  Kapanmış vardiyanın özel finansal girdilerinden sıfır bilgi kanıtı üretilir. Midnight üzerindeki kayıt yalnız sonuç sınıfını, toleransı ve taahhütleri açıklar; tutarlar zincirde yayımlanmaz. FuelOS backend'i finansal kaynak kayıtlarını işler ve yetkili uygulama rolleri bu kayıtları görebilir. Preview zincir kaydı kaynak kayıtlarının bağımsız olarak onaylandığı anlamına gelmez.

### 2. 💳 SuperAdmin SaaS Lisanslama & Çoklu Şube Yönetimi
- **Abonelik Seviyeleri (Plans):** `Standart`, `Pro SaaS`, `Kurumsal` lisans paketleri.
- **Otomatik Kilit & Vade Denetimi:** Vadesi geçen istasyonlar arka planda otomatik olarak `past_due` (Ödeme Bekleniyor) statüsüne alınır; gerektiğinde askıya alınır (`suspended`).
- **MRR (Aylık Lisans Geliri) Havuzu:** Platform genelindeki aktif şubelerin toplam aylık abonelik cirosu SuperAdmin panelinde canlı olarak hesaplanır.
- **Tek Tıkla İstasyon & Lisans Yönetimi:** Ana panel üzerinden tek tıkla yeni istasyon açma (`+ Yeni İstasyon Ekle`) ve +30 / +90 gün lisans süresi uzatma modalı.

### 3. 🎭 Kusursuz Rol & Yetki Ayrımı (Strict RBAC)
- **Süper Yönetici (SaaS Platform Sahibi):**  
  Sahadaki pompacının vardiyasını, iç kasa cirosunu veya istasyon pompa satış detaylarını görmez. Menüsünde yalnızca kurumsal modüller yer alır:
  * 🎛️ **Sistem Paneli** (MRR, Canlı Ağ, Lisans Havuzu)
  * 🏢 **İstasyon Yönetimi** (Tüm Şubeler, Lisans Durumu, Yetkili Kadrosu)
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

## 🔑 Geliştirme Ortamı Hesapları

Yerel geliştirme seed hesabı `backend/app/services/seed.py` içinde tanımlıdır. Seed parolalarını yalnızca yerel geliştirmede kullanın ve dağıtım öncesinde değiştirin; gerçek hesap parolalarını README'ye veya kaynak denetimine eklemeyin.

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

#### Şifre sıfırlama e-postası
Şifre sıfırlama özelliğini etkinleştirmek için backend ortam değişkenlerini (veya `backend/.env` dosyasını) yapılandırın:

```env
FRONTEND_URL=http://localhost:5173
SMTP_HOST=smtp.gmail.com
SMTP_PORT=465
SMTP_USERNAME=your-gmail-address
SMTP_PASSWORD=your-google-app-password
SMTP_FROM_EMAIL=your-gmail-address
SMTP_USE_TLS=false
SMTP_USE_SSL=true
```

SMTP kimlik bilgilerini kaynak koduna veya Git'e eklemeyin. Gmail için normal hesap şifresi yerine Google Uygulama Şifresi kullanın. Başka sağlayıcılarda SMTP host/port ve TLS ayarlarını sağlayıcının verdiği değerlere göre değiştirin. Şifre sıfırlama bağlantıları 30 dakika geçerlidir.

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
| **Kimlik** | `POST /api/auth/forgot-password` | Herkes | Kayıtlı e-postaya 30 dakika geçerli şifre sıfırlama bağlantısı gönderir |
| **Kimlik** | `POST /api/auth/reset-password` | Herkes | Geçerli sıfırlama bağlantısıyla yeni şifre belirler |
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
