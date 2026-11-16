"""Birim testleri: Veresiye belge sihirli bayt tespiti, boyut ve depolama anahtarı doğrulamaları."""

import pytest
from fastapi import HTTPException

from app.services import credit_documents


def test_sniff_content_type_magic_bytes():
    jpeg = b"\xff\xd8\xff\xe0" + b"\x00" * 16
    png = b"\x89PNG\r\n\x1a\n" + b"\x00" * 16
    webp = b"RIFF\x24\x00\x00\x00WEBP" + b"VP8 "
    pdf = b"%PDF-1.7\n%FuelOS\n"

    assert credit_documents.sniff_content_type(jpeg) == "image/jpeg"
    assert credit_documents.sniff_content_type(png) == "image/png"
    assert credit_documents.sniff_content_type(webp) == "image/webp"
    assert credit_documents.sniff_content_type(pdf) == "application/pdf"


def test_sniff_content_type_rejects_unknown_bytes():
    with pytest.raises(HTTPException) as exc:
        credit_documents.sniff_content_type(b"<html><script>alert(1)</script></html>")
    assert exc.value.status_code == 415

    with pytest.raises(HTTPException) as exc2:
        credit_documents.sniff_content_type(b"RIFF\x00\x00\x00\x00AVI ")
    assert exc2.value.status_code == 415


def test_validate_document_bytes_rules():
    png = b"\x89PNG\r\n\x1a\n" + b"\x00" * 20
    pdf = b"%PDF-1.4\n%content\n"

    assert credit_documents.validate_document_bytes(png, kind="id_photo", max_bytes=1024) == "image/png"
    assert credit_documents.validate_document_bytes(pdf, kind="receipt", max_bytes=1024) == "application/pdf"

    # Kimlik fotoğrafı PDF olamaz
    with pytest.raises(HTTPException) as exc_pdf:
        credit_documents.validate_document_bytes(pdf, kind="id_photo", max_bytes=1024)
    assert exc_pdf.value.status_code == 415

    # Boş içerik
    with pytest.raises(HTTPException) as exc_empty:
        credit_documents.validate_document_bytes(b"", kind="receipt", max_bytes=1024)
    assert exc_empty.value.status_code == 422

    # Boyut aşımı
    with pytest.raises(HTTPException) as exc_big:
        credit_documents.validate_document_bytes(png, kind="receipt", max_bytes=10)
    assert exc_big.value.status_code == 413

    # Bilinmeyen belge türü
    with pytest.raises(HTTPException) as exc_kind:
        credit_documents.validate_document_bytes(png, kind="other", max_bytes=1024)
    assert exc_kind.value.status_code == 422


def test_validate_storage_key_prevents_traversal():
    good_key = "0123456789abcdef0123456789abcdef.bin"
    assert credit_documents.validate_storage_key(good_key) == good_key

    for bad in ("../etc/passwd", "abc.png", "0123456789ABCDEF0123456789ABCDEF.bin", "..\\x.bin"):
        with pytest.raises(HTTPException) as exc:
            credit_documents.validate_storage_key(bad)
        assert exc.value.status_code == 500
