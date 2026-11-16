"""Birim testleri: Veresiye PII koruma ve plaka normalleştirme yardımcıları."""

import pytest

from app.services import pii


def test_tc_validation_and_normalization():
    # Geçerli resmi kontrol basamağı örnekleri
    assert pii.is_valid_tc("10000000146") is True
    assert pii.is_valid_tc("11111111110") is True
    assert pii.is_valid_tc("34567890170") is True
    assert pii.normalize_tc(" 10000000146 ") == "10000000146"

    # Geçersiz vakalar
    assert pii.is_valid_tc("00000000146") is False  # İlk hane 0 olamaz
    assert pii.is_valid_tc("10000000147") is False  # 11. hane hatalı
    assert pii.is_valid_tc("10000000156") is False  # 10. hane hatalı
    assert pii.is_valid_tc("1000000014") is False   # 10 hane
    assert pii.is_valid_tc("100000001461") is False # 12 hane
    assert pii.is_valid_tc("1000000014a") is False  # Harf içeriyor
    assert pii.is_valid_tc("") is False


def test_tc_encrypt_decrypt_blind_index_and_mask():
    tc = "10000000146"
    token1 = pii.encrypt_tc(tc)
    token2 = pii.encrypt_tc(tc)

    assert token1 != token2  # Fernet rastgele IV kullanır
    assert tc not in token1
    assert pii.decrypt_tc(token1) == tc
    assert pii.decrypt_tc(token2) == tc

    idx1 = pii.tc_blind_index(tc)
    idx2 = pii.tc_blind_index(f" {tc} ")
    assert idx1 == idx2
    assert len(idx1) == 64
    assert pii.tc_matches(tc, idx1) is True
    assert pii.tc_matches("11111111110", idx1) is False

    assert pii.mask_tc(tc) == "100******46"
    assert pii.masked_tc_from_token(token1) == "100******46"


def test_plate_normalization_and_formatting():
    assert pii.normalize_plate(" 06 abc 123 ") == "06ABC123"
    assert pii.normalize_plate("34-ışğ-01") == "34ISG01"
    assert pii.normalize_plate("06 ıiüöç 9") == "06IIUOC9"
    with pytest.raises(pii.PIIError):
        pii.normalize_plate("34-istanbul-01")  # 12 karakter > 10 sınır

    assert pii.format_plate("06ABC123") == "06 ABC 123"
    assert pii.format_plate("34A1234") == "34 A 1234"


def test_document_bytes_encrypt_decrypt():
    raw = b"\x89PNG\r\n\x1a\n" + b"gizli-belge-baytlari-123456"
    enc = pii.encrypt_bytes(raw)
    assert enc != raw
    assert b"gizli-belge" not in enc
    assert pii.decrypt_bytes(enc) == raw
