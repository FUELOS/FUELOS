"""
FuelOS — Veresiye belge (imzalı fiş ve kimlik fotoğrafı) yükleme/okuma servisi.

Güvenlik kuralları:
- İstemcinin bildirdiği Content-Type veya dosya adına asla güvenilmez; tür
  yalnızca dosya başındaki sihirli baytlardan (magic bytes) tespit edilir.
- Dosya boyutu `MAX_UPLOAD_BYTES` sınırı içinde parça parça (chunk) okunur.
- Diskteki dosya adı sunucu tarafından rastgele üretilir (yol geçişi imkânsızdır).
- İçerik diskte Fernet ile şifreli saklanır; SHA-256 ve boyut düz metin üzerinden
  hesaplanır.
"""

from __future__ import annotations

import asyncio
import hashlib
import re
import uuid
from pathlib import Path

from fastapi import HTTPException, UploadFile, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings
from app.models.base import CreditDocumentKind
from app.models.credit import CreditDocument
from app.services import pii

_STORAGE_KEY_RE = re.compile(r"^[0-9a-f]{32}\.bin$")
_CHUNK_SIZE = 64 * 1024
_BACKEND_ROOT = Path(__file__).resolve().parents[2]


def sniff_content_type(data: bytes) -> str:
    """Dosyanın ilk baytlarından MIME türünü tespit eder; desteklenmiyorsa 415 fırlatır."""
    if len(data) >= 3 and data[:3] == b"\xff\xd8\xff":
        return "image/jpeg"
    if len(data) >= 8 and data[:8] == b"\x89PNG\r\n\x1a\n":
        return "image/png"
    if len(data) >= 12 and data[:4] == b"RIFF" and data[8:12] == b"WEBP":
        return "image/webp"
    if len(data) >= 5 and data[:5] == b"%PDF-":
        return "application/pdf"
    raise HTTPException(
        status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
        detail="Desteklenmeyen dosya türü. Yalnızca JPEG, PNG, WEBP veya fişler için PDF yüklenebilir",
    )


def validate_document_bytes(data: bytes, *, kind: str, max_bytes: int) -> str:
    """
    Belge içeriğini boyut, sihirli bayt ve belge türü kurallarına göre doğrular.
    Saf fonksiyondur; birim testlerde doğrudan kullanılır.
    """
    if kind not in (CreditDocumentKind.RECEIPT.value, CreditDocumentKind.ID_PHOTO.value):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Geçersiz belge türü",
        )
    if not data:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Yüklenen dosya boş olamaz",
        )
    if len(data) > max_bytes:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail=f"Dosya boyutu en fazla {max_bytes} bayt olabilir",
        )
    content_type = sniff_content_type(data)
    if kind == CreditDocumentKind.ID_PHOTO.value and content_type == "application/pdf":
        raise HTTPException(
            status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
            detail="Kimlik fotoğrafı için yalnızca JPEG, PNG veya WEBP görseli yüklenebilir",
        )
    return content_type


def validate_storage_key(storage_key: str) -> str:
    """Depolama anahtarının yalnızca güvenli rastgele biçimde olduğunu doğrular."""
    if not isinstance(storage_key, str) or not _STORAGE_KEY_RE.fullmatch(storage_key):
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Geçersiz belge depolama anahtarı",
        )
    return storage_key


def resolve_upload_dir() -> Path:
    """Yükleme dizinini çözer ve yoksa oluşturur."""
    settings = get_settings()
    configured = Path(settings.UPLOAD_DIR)
    directory = configured if configured.is_absolute() else (_BACKEND_ROOT / configured)
    directory.mkdir(parents=True, exist_ok=True)
    return directory


async def read_upload_bounded(upload: UploadFile, max_bytes: int) -> bytes:
    """UploadFile içeriğini Content-Length'a güvenmeden parça parça ve sınırla okur."""
    chunks: list[bytes] = []
    total = 0
    while True:
        chunk = await upload.read(_CHUNK_SIZE)
        if not chunk:
            break
        total += len(chunk)
        if total > max_bytes:
            raise HTTPException(
                status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
                detail=f"Dosya boyutu en fazla {max_bytes} bayt olabilir",
            )
        chunks.append(chunk)
    data = b"".join(chunks)
    if not data:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Yüklenen dosya boş olamaz",
        )
    return data


def _write_file(path: Path, payload: bytes) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(payload)


def _unlink_silent(path: Path) -> None:
    try:
        path.unlink(missing_ok=True)
    except OSError:
        pass


def _read_file(path: Path) -> bytes:
    return path.read_bytes()


async def store_document(
    db: AsyncSession,
    *,
    station_id: uuid.UUID,
    kind: str,
    upload: UploadFile,
    uploaded_by: uuid.UUID | None,
) -> CreditDocument:
    """Belgeyi doğrular, şifreleyip diske yazar ve `CreditDocument` kaydını flush eder."""
    settings = get_settings()
    kind_val = str(getattr(kind, "value", kind))
    data = await read_upload_bounded(upload, settings.MAX_UPLOAD_BYTES)
    content_type = validate_document_bytes(data, kind=kind_val, max_bytes=settings.MAX_UPLOAD_BYTES)

    digest = hashlib.sha256(data).hexdigest()
    size_bytes = len(data)
    encrypted = pii.encrypt_bytes(data)

    storage_key = validate_storage_key(f"{uuid.uuid4().hex}.bin")
    upload_dir = resolve_upload_dir()
    target_path = upload_dir / storage_key

    await asyncio.to_thread(_write_file, target_path, encrypted)

    doc = CreditDocument(
        station_id=station_id,
        kind=kind_val,
        content_type=content_type,
        size_bytes=size_bytes,
        sha256=digest,
        storage_key=storage_key,
        is_encrypted=True,
        uploaded_by=uploaded_by,
    )
    db.add(doc)
    try:
        await db.flush()
    except Exception:
        await asyncio.to_thread(_unlink_silent, target_path)
        raise
    return doc


async def read_document(doc: CreditDocument) -> bytes:
    """Belgeyi diskten okur ve gerekiyorsa şifresini çözer."""
    storage_key = validate_storage_key(doc.storage_key)
    target_path = resolve_upload_dir() / storage_key
    if not await asyncio.to_thread(target_path.exists):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Belge dosyası sunucuda bulunamadı",
        )
    raw = await asyncio.to_thread(_read_file, target_path)
    if not doc.is_encrypted:
        return raw
    try:
        return pii.decrypt_bytes(raw)
    except pii.PIIError:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Belge şifresi çözülemedi",
        ) from None
