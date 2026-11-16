# FuelOS Veresiye Defteri Mahremiyet ve Bütünlük Katmanı

Bu belge, FuelOS Dijital Veresiye ve Borç Takip Sistemi içinde hassas müşteri/işlem verilerinin korunması ve kayıt bütünlüğünün kriptografik olarak desteklenmesi için uygulanan mekanizmaları, kesin veri biçimlerini ve güven sınırlarını tanımlar.

> **Dürüstlük Notu:** Burada tanımlanan yaprak taahhüdü ve RFC 6962 Merkle ağacı katmanı **uygulama düzeyinde bir bütünlük ve seçici açıklama katmanıdır**; tek başına bir sıfır bilgi kanıtı (ZK-SNARK) **değildir**, Midnight blokzincirine zincir üstü (on-chain) sabitlenmez ve veritabanı kayıtlarının fiziksel dünyada gerçekliğini tek başına kanıtlamaz.

---

## 1. Amaç

Veresiye kayıtları şirket/müşteri kimliği, T.C. kimlik numarası, araç plakası, sürücü kimliği, yakıt türü, litre ve tutar gibi ticari ve kişisel açıdan hassas bilgiler içerir. Amaç, bu alanları herkese açık göstermeden bir vardiya içindeki veresiye kayıtlarının varlığını, bütünlüğünü ve sonradan değiştirilmediğini kriptografik olarak doğrulayabilmek; yalnızca gerektiğinde ve yetkili yöneticinin onayıyla tek bir kaydı seçici olarak açabilmektir.

---

## 2. Uygulanan Üç Katman

### 2.1 Uygulama İçi Veri ve Belge Koruması
- **T.C. Kimlik Numarası:** Veritabanında durağan halde Fernet simetrik şifrelemesiyle saklanır (`backend/app/services/pii.py`). Birebir arama ve mükerrer kayıt kontrolü için düz metin yerine anahtarlı HMAC-SHA256 kör indeksi (blind index) kullanılır. Tüm varsayılan API yanıtlarında ve günlüklerde yalnızca maskelenmiş biçim (ör. `100******46`) döndürülür.
- **Yüklenen Belgeler (İmzalı Fişler ve Kimlik Fotoğrafları):** Şifrelenerek saklanır (`backend/app/services/credit_documents.py`) ve yalnızca yetkili rollere akış üzerinden sunulur (ör. bireysel müşteri kimlik fotoğrafı yalnızca `station_manager` tarafından görüntülenebilir; kasiyerler için `403` ile reddedilir).
- **Anahtar Türetimi:** Şifreleme ve kör indeks alt anahtarları `PII_ENCRYPTION_KEY` (geliştirme ortamında tanımlı değilse `SECRET_KEY`) üzerinden HKDF-SHA256 ile türetilir.

### 2.2 Taahhüt ve Seçici Açıklama Katmanı
- **Referans ve Ayna Gerçekleme:** Python referansı [`backend/app/services/credit_commitment.py`](../backend/app/services/credit_commitment.py) ve saf TypeScript aynası [`midnight/src/credit-ledger.ts`](./src/credit-ledger.ts) (`node:crypto` dışında harici bağımlılık içermez; Compact derleyicisi olmadan da çalışır) aynı ortak test vektörleri üzerinde bayt düzeyinde özdeş çıktı üretir.
- **Kayıt Başına Tuzlu Taahhüt:** Her veresiye satışı (`CreditSale`) kalıcı değerlerinden 32 baytlık rastgele `nonce` ile SHA-256 yaprak taahhüdü üretir (`credit_sales.commitment`).
- **Vardiya RFC 6962 Merkle Ağacı:** Bir vardiyanın tüm taahhütleri küçük harfli `sale_id` sırasıyla RFC 6962 ikili Merkle ağacında birleştirilir ve açık `statement_digest` hesaplanır (`GET /api/veresiye/proofs/shifts/{shift_id}`).
- **Seçici Açıklama ve Çevrimdışı Doğrulama:** Yönetici `GET /api/veresiye/proofs/sales/{sale_id}?disclose=true` ile tek bir satış için Merkle dahil etme yolunu ve açılış bilgilerini (`SaleDisclosure`) üretebilir. Üçüncü taraflar `npm run verify:credit` (`src/verify-credit-inclusion-cli.ts`) ile `SaleInclusionProof` JSON çıktısını çevrimdışı doğrulayabilir.

### 2.3 Mevcut Midnight Devresi ile İlişki
- Veresiye satışları ödeme yöntemi `veresiye` olan `Transaction` kayıtlarıdır. Dolayısıyla kurumsal + bireysel veresiye satış toplamı, mevcut `reconcile-v4-financial-commitment` Compact devresine özel `credit` tanığı (witness) olarak girmeye devam eder.
- Bu sürümde Compact devresinde, doğrulayıcı anahtarlarda veya `StatementVersion` değerinde değişiklik yapılmamıştır.

---

## 3. Kesin Biçimler ve Kurallar

Üçüncü taraf doğrulayıcıların aynı çıktıyı üretebilmesi için aşağıdaki kurallar zorunludur:

1. **Domain Sabitleri:**
   - Yaprak taahhüdü: `"FUELOS_VERESIYE_SALE_V1"`
   - Vardiya beyan özeti: `"FUELOS_VERESIYE_SHIFT_LEDGER_V1"`

2. **Yaprak Yükü (`SaleLeaf.payload`):**
   Aşağıdaki anahtarlar kanonik JSON nesnesine girer:
   - `domain`: `"FUELOS_VERESIYE_SALE_V1"`
   - `saleId`, `transactionId`, `shiftId`, `stationId`, `accountId`: küçük harfli UUID metni
   - `accountType`: `"corporate"` veya `"individual"`
   - `plate`: metin veya `null` (verildiği hâliyle)
   - `driverId`: küçük harfli UUID metni veya `null` (boş metin `""` da `null` olarak normalleştirilir)
   - `fuelType`: metin veya `null`
   - `litersMl`: tam mililitre değerinin ondalık metin (string) temsili veya `null`
   - `amountKurus`: pozitif tam kuruş değerinin ondalık metin (string) temsili
   - `saleTime`: UTC, saniye hassasiyetinde ISO-8601 `Z` biçimi (`YYYY-MM-DDTHH:MM:SSZ`)
   - `nonce`: 64 karakterlik küçük harfli hex (32 bayt)

3. **Kanonik JSON ve Yaprak Özeti:**
   - Anahtarlar Unicode kod noktasına göre artan sırayla dizilir; `,` ve `:` ayraçlarından sonra boşluk konmaz.
   - `U+007F` ve üzerindeki tüm karakterler (UTF-16 surrogate çiftleri dahil, ör. Türkçe `Kurşunsuz` -> `Kur\u015funsuz`) küçük harfli `\uXXXX` biçiminde kaçışlanır (`json.dumps(..., sort_keys=True, separators=(",", ":"), ensure_ascii=True)` ile bayt düzeyinde özdeştir).
   - Yaprak taahhüdü: `SHA-256(ASCII_bytes(canonical_json))` → 64 karakterlik küçük harfli hex.

4. **RFC 6962 Merkle Ağacı ve Beyan Özeti:**
   - Yaprak sırası: küçük harfli `sale_id` değerine göre artan sıra; mükerrer `sale_id` reddedilir.
   - Boş ağaç (`leafCount = 0`): `SHA-256("")` (`e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855`).
   - Yaprak düğüm özeti: `SHA-256(0x00 || raw_bytes(commitment))`.
   - İç düğüm özeti: `SHA-256(0x01 || left_32B || right_32B)` (RFC 6962 §2.1 ikili bölme kuralı: `n`'den küçük en büyük 2 kuvveti `k`).
   - Vardiya beyan özeti (`statementDigest`): `{"domain":"FUELOS_VERESIYE_SHIFT_LEDGER_V1","leafCount":"<n>","merkleRoot":"<hex64>","shiftId":"<lower_uuid>"}` kanonik JSON'ının SHA-256 özeti.

5. **Çevrimdışı Doğrulama CLI (`verify:credit`):**
   - Standart girdiden (stdin) API'nin `SaleInclusionProof` JSON şemasında veri okur.
   - `{"inclusionValid": boolean, "statementDigestValid": boolean, "commitmentOpens"?: boolean}` sonucunu yazar; başarısız herhangi bir kontrolde sıfır olmayan çıkış kodu döner ve `nonce` ya da açıklanan PII alanlarını asla geri basmaz.

---

## 4. Güven Sınırları Tablosu

| Mekanizma / Katman | Neyi Kanıtlar / Sağlar | Neyi Kanıtlamaz / Sınırı Nedir |
| --- | --- | --- |
| **Fernet + HMAC Kör İndeks (`pii.py`)** | T.C. kimlik numaraları DB'de şifreli kalır; tam eşleşmeli arama ve maskeli yanıt sağlanır. | Veritabanına + `PII_ENCRYPTION_KEY`/`SECRET_KEY` anahtarına erişen taraf düz metni çözebilir. |
| **Tuzlu Yaprak Taahhüdü (`credit_commitment.py`)** | Bilinen `SaleLeaf + nonce` ile taahhüdün tutarlı olduğunu bağlar; 256-bit `nonce` düşük entropili tutar tahminini önler. | Kaydın fiziksel dünyada gerçekten gerçekleştiğini kanıtlamaz; `nonce` sızarsa gizlilik kaybolur. |
| **RFC 6962 Merkle Yolu + `statement_digest`** | Bir taahhüdün verilen `(shift_id, leaf_count, merkle_root)` özetine dahil olduğunu doğrular; yalnızca tek satış açılırsa diğer satışlar gizli kalır. | Tek başına ZK-SNARK değildir. Kök zincir üstünde sabitlenmediği veya bağımsızca imzalanmadığı için yetkili DB yazarı geçmişi baştan yazıp yeni bir kök/beyan özeti üretebilir (daha önce paylaşılan kökle karşılaştırılmadıkça). |
| **Mevcut Midnight Devresi (`reconcile-v4`)** | Vardiya özetindeki toplam `credit` tutarının mutabakat sınıfı ve finansal taahhüt ile tutarlılığını ZK ile kanıtlar. | Toplam `credit` tutarının kurumsal/bireysel veresiye yapraklarının toplamına eşit olduğunu devre içinde henüz doğrulamaz. |

---

## 5. Gelecek Çalışmalar (Uygulanmadı)

Aşağıdaki geliştirmeler bu sürümün parçası **değildir** ve bilinçli olarak kapsam dışı bırakılmıştır:

1. **Vardiya Defteri Kökünün Sabitlenmesi (Anchoring):** `statement_digest` veya `merkle_root` değerinin mevcut imzalı kaynak tasdiki (`source-attestation`) içine bağlanması veya Midnight Compact sözleşmesinde yeni bir herkese açık defter alanıyla sabitlenmesi.
2. **Kurumsal + Bireysel = Credit ZK Devresi:** Veresiye yapraklarının toplamını (`corporate + individual == credit`) yayımlanan `financialCommitment` ile ilişkilendiren özel bir Compact devresi. Bu adım Compact `0.31.1` derleyici araç zinciri, yeni devre dağıtımı / doğrulayıcı anahtar ve yeni bir `StatementVersion` gerektirir.
