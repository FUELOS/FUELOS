"""
FuelOS — Kişisel veri (PII) koruma yardımcıları.

Veresiye sisteminde tutulan T.C. kimlik numaraları ve yüklenen belgeler için:

- `normalize_tc` / `is_valid_tc`   : biçim + resmi sağlama (checksum) doğrulaması
- `encrypt_tc` / `decrypt_tc`      : alan düzeyinde şifreleme (Fernet: AES-128-CBC + HMAC-SHA256)
- `tc_blind_index` / `tc_matches`  : şifre çözmeden eşleştirme için anahtarlı HMAC-SHA256 kör indeks
- `mask_tc`                        : ekranda gösterim için maskeleme (123******01)
- `encrypt_bytes` / `decrypt_bytes`: belge içeriğinin diskte şifreli saklanması
- `normalize_plate` / `format_plate`: plaka normalizasyonu

Anahtarlar `PII_ENCRYPTION_KEY` (yoksa `SECRET_KEY`) üzerinden HKDF-SHA256 ile,
her amaç için ayrı etiketle türetilir; aynı anahtar iki amaçla kullanılmaz.
Bu modül hiçbir T.C. numarasını veya anahtarı loglamaz, hata mesajına koymaz.
"""

from __future__ import annotations

import base64
import hashlib
import hmac
import logging
import re
from functools import lru_cache

from cryptography.fernet import Fernet, InvalidToken
from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.kdf.hkdf import HKDF

from app.config import get_settings

logger = logging.getLogger(__name__)

_TC_ENCRYPTION_INFO = b"fuelos:pii:tc-encryption:v1"
_TC_INDEX_INFO = b"fuelos:pii:tc-blind-index:v1"
_DOCUMENT_ENCRYPTION_INFO = b"fuelos:pii:document-encryption:v1"
_HKDF_SALT = b"fuelos:pii:hkdf-salt:v1"

_TC_PATTERN = re.compile(r"^[1-9][0-9]{10}$")
# Normalize edilmiş plaka: yalnızca A-Z ve 0-9, 4–10 karakter.
_PLATE_PATTERN = re.compile(r"^[A-Z0-9]{4,10}$")
# Standart sivil TR plakası: il kodu (01–81) + 1–3 harf + 2–4 rakam.
_TR_PLATE_PATTERN = re.compile(r"^(0[1-9]|[1-7][0-9]|8[01])([A-Z]{1,3})([0-9]{2,4})$")
_TURKISH_UPPER = str.maketrans({"ı": "I", "i": "I", "İ": "I", "ş": "S", "Ş": "S", "ğ": "G", "Ğ": "G",
                                "ü": "U", "Ü": "U", "ö": "O", "Ö": "O", "ç": "C", "Ç": "C"})


class PIIError(ValueError):
    """Geçersiz kişisel veri girdisi veya çözülemeyen şifreli değer."""


# ─────────────────────────── ANAHTAR TÜRETME ───────────────────────────


@lru_cache(maxsize=1)
def _master_key() -> bytes:
    settings = get_settings()
    configured = (settings.PII_ENCRYPTION_KEY or "").strip()
    if configured:
        return configured.encode("utf-8")
    logger.warning(
        "PII_ENCRYPTION_KEY tanımlı değil; kişisel veri anahtarı SECRET_KEY'den türetiliyor. "
        "Production ortamında ayrı ve kalıcı bir PII_ENCRYPTION_KEY tanımlayın."
    )
    return settings.SECRET_KEY.encode("utf-8")


def _derive(info: bytes) -> bytes:
    return HKDF(algorithm=hashes.SHA256(), length=32, salt=_HKDF_SALT, info=info).derive(_master_key())


@lru_cache(maxsize=1)
def _tc_fernet() -> Fernet:
    return Fernet(base64.urlsafe_b64encode(_derive(_TC_ENCRYPTION_INFO)))


@lru_cache(maxsize=1)
def _document_fernet() -> Fernet:
    return Fernet(base64.urlsafe_b64encode(_derive(_DOCUMENT_ENCRYPTION_INFO)))


@lru_cache(maxsize=1)
def _tc_index_key() -> bytes:
    return _derive(_TC_INDEX_INFO)


def reset_key_cache() -> None:
    """Türetilmiş anahtar önbelleğini temizler (yalnızca testler için)."""
    _master_key.cache_clear()
    _tc_fernet.cache_clear()
    _document_fernet.cache_clear()
    _tc_index_key.cache_clear()


# ─────────────────────────── T.C. KİMLİK NO ───────────────────────────


def is_valid_tc(value: str | None) -> bool:
    """T.C. kimlik no biçim ve sağlama kontrolü (11 hane, ilk hane 0 olamaz)."""
    if not isinstance(value, str) or not _TC_PATTERN.fullmatch(value):
        return False
    digits = [int(ch) for ch in value]
    odd_sum = sum(digits[0:9:2])   # 1., 3., 5., 7., 9. haneler
    even_sum = sum(digits[1:8:2])  # 2., 4., 6., 8. haneler
    tenth = (odd_sum * 7 - even_sum) % 10
    eleventh = (sum(digits[:10])) % 10
    return digits[9] == tenth and digits[10] == eleventh


def normalize_tc(value: str | None) -> str:
    """Boşlukları temizler ve doğrular; geçersizse PIIError fırlatır (değeri ifşa etmez)."""
    cleaned = re.sub(r"\s+", "", value or "")
    if not is_valid_tc(cleaned):
        raise PIIError("Geçersiz T.C. kimlik numarası")
    return cleaned


def encrypt_tc(tc: str) -> str:
    return _tc_fernet().encrypt(normalize_tc(tc).encode("ascii")).decode("ascii")


def decrypt_tc(token: str) -> str:
    try:
        return _tc_fernet().decrypt(token.encode("ascii")).decode("ascii")
    except (InvalidToken, ValueError, AttributeError) as exc:
        raise PIIError("Şifreli T.C. kimlik numarası çözülemedi") from exc


def tc_blind_index(tc: str) -> str:
    """Eşleştirme/benzersizlik için anahtarlı özet. Anahtar olmadan sözlük saldırısı yapılamaz."""
    return hmac.new(_tc_index_key(), normalize_tc(tc).encode("ascii"), hashlib.sha256).hexdigest()


def tc_matches(candidate: str | None, stored_index: str | None) -> bool:
    """Girilen T.C. no kayıtlı kör indeksle eşleşiyor mu (sabit zamanlı karşılaştırma)."""
    if not candidate or not stored_index:
        return False
    try:
        computed = tc_blind_index(candidate)
    except PIIError:
        return False
    return hmac.compare_digest(computed, stored_index)


def mask_tc(tc: str) -> str:
    """Gösterim için maske: ilk 3 ve son 2 hane açık (örn. 123******01)."""
    if not isinstance(tc, str) or len(tc) != 11:
        return "*" * 11
    return f"{tc[:3]}{'*' * 6}{tc[-2:]}"


def masked_tc_from_token(token: str | None) -> str:
    """Şifreli değerden maske üretir; çözülemezse tümü yıldızlı döner (istisna fırlatmaz)."""
    if not token:
        return "*" * 11
    try:
        return mask_tc(decrypt_tc(token))
    except PIIError:
        return "*" * 11


# ─────────────────────────── BELGE İÇERİĞİ ───────────────────────────


def encrypt_bytes(data: bytes) -> bytes:
    return _document_fernet().encrypt(data)


def decrypt_bytes(data: bytes) -> bytes:
    try:
        return _document_fernet().decrypt(data)
    except InvalidToken as exc:
        raise PIIError("Şifreli belge çözülemedi") from exc


# ─────────────────────────── PLAKA ───────────────────────────


def normalize_plate(value: str | None) -> str:
    """Plakayı büyük harfe çevirir, boşluk/tire/noktaları atar (örn. '06 abc 123' → '06ABC123')."""
    cleaned = re.sub(r"[\s\-._]+", "", (value or "")).translate(_TURKISH_UPPER).upper()
    if not _PLATE_PATTERN.fullmatch(cleaned):
        raise PIIError("Geçersiz plaka: yalnızca harf ve rakamdan oluşan 4–10 karakter olmalıdır")
    return cleaned


def format_plate(plate: str | None) -> str | None:
    """Normalize plakayı okunur biçime çevirir ('06ABC123' → '06 ABC 123'); TR kalıbına uymuyorsa aynen döner."""
    if not plate:
        return plate
    match = _TR_PLATE_PATTERN.fullmatch(plate)
    return " ".join(match.groups()) if match else plate
