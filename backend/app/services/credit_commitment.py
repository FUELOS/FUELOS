"""
FuelOS — Veresiye defteri taahhüt (commitment) katmanı.

Amaç: şirket/müşteri kimliği, plaka, sürücü ve tutar gibi hassas alanları
açıklamadan, bir veresiye kaydının var olduğunu ve sonradan değiştirilmediğini
kriptografik olarak gösterebilmek.

1. Her veresiye satışı için gizleyici bir yaprak taahhüdü üretilir:
       commitment = SHA-256(kanonik JSON{alanlar, 32 baytlık rastgele nonce})
   Nonce olmadan taahhütten alanlar tahmin edilemez (düşük entropili tutarlar dahil).
2. Bir vardiyanın tüm taahhütleri RFC 6962 Merkle ağacında birleştirilir; kök
   tek başına hiçbir kaydı açıklamaz.
3. Tek bir kayıt, yalnızca kendi alanları + nonce + Merkle yolu verilerek
   bağımsız doğrulanabilir (seçici açıklama); diğer kayıtlar gizli kalır.

Sınırlar (dürüstlük notu): Bu modül uygulama düzeyinde bir taahhüt ve
bütünlük katmanıdır; kendi başına bir sıfır bilgi kanıtı (ZK-SNARK) DEĞİLDİR
ve kayıtların gerçek dünyadaki doğruluğunu kanıtlamaz. Veresiye toplamı ayrıca
mevcut Midnight mutabakat devresine `credit` özel girdisi olarak girer.

Saf modüldür: veritabanı, ağ veya yapılandırma bağımlılığı yoktur. Aynı
hesaplama `midnight/src/credit-ledger.ts` içinde yansıtılır ve iki taraf ortak
test vektörlerini paylaşır.
"""

from __future__ import annotations

import hashlib
import json
import re
import secrets
from dataclasses import dataclass
from datetime import datetime, timezone
from decimal import Decimal
from typing import Sequence

LEAF_DOMAIN = "FUELOS_VERESIYE_SALE_V1"
LEDGER_DOMAIN = "FUELOS_VERESIYE_SHIFT_LEDGER_V1"
_HEX64 = re.compile(r"^[0-9a-f]{64}$")
_KURUS = Decimal("0.01")
_MILLILITRE = Decimal("0.001")


def new_nonce() -> str:
    """32 baytlık kriptografik rastgele nonce (hex)."""
    return secrets.token_hex(32)


def to_kurus(amount: Decimal | int | str) -> int:
    """TL tutarını yuvarlamadan tam kuruşa çevirir; kesirli kuruş reddedilir."""
    value = Decimal(str(amount))
    if not value.is_finite() or value < 0:
        raise ValueError("Tutar sonlu ve negatif olmayan bir değer olmalıdır")
    if value != value.quantize(_KURUS):
        raise ValueError("Tutar tam kuruş olmalıdır")
    return int(value * 100)


def to_millilitres(liters: Decimal | int | str | None) -> int | None:
    """Litreyi yuvarlamadan tam mililitreye çevirir; None aynen döner."""
    if liters is None:
        return None
    value = Decimal(str(liters))
    if not value.is_finite() or value < 0:
        raise ValueError("Litre sonlu ve negatif olmayan bir değer olmalıdır")
    if value != value.quantize(_MILLILITRE):
        raise ValueError("Litre tam mililitre olmalıdır")
    return int(value * 1000)


def canonical_time(value: datetime) -> str:
    """Zamanı UTC, saniye hassasiyetinde ISO-8601 'Z' biçimine çevirir."""
    if value.tzinfo is None:
        raise ValueError("Zaman bilgisi saat dilimi içermelidir")
    return value.astimezone(timezone.utc).replace(microsecond=0).strftime("%Y-%m-%dT%H:%M:%SZ")


@dataclass(frozen=True)
class SaleLeaf:
    """Bir veresiye satışının taahhüde giren alanları (tümü özel veridir)."""

    sale_id: str
    transaction_id: str
    shift_id: str
    station_id: str
    account_type: str            # 'corporate' | 'individual'
    account_id: str              # şirket veya müşteri UUID'si
    plate: str | None
    driver_id: str | None
    fuel_type: str | None
    liters_ml: int | None
    amount_kurus: int
    sale_time: str               # canonical_time() çıktısı

    def payload(self, nonce_hex: str) -> dict[str, object]:
        return {
            "domain": LEAF_DOMAIN,
            "saleId": self.sale_id.lower(),
            "transactionId": self.transaction_id.lower(),
            "shiftId": self.shift_id.lower(),
            "stationId": self.station_id.lower(),
            "accountType": self.account_type,
            "accountId": self.account_id.lower(),
            "plate": self.plate,
            "driverId": self.driver_id.lower() if self.driver_id else None,
            "fuelType": self.fuel_type,
            "litersMl": None if self.liters_ml is None else str(self.liters_ml),
            "amountKurus": str(self.amount_kurus),
            "saleTime": self.sale_time,
            "nonce": nonce_hex,
        }


def leaf_from_record(sale) -> SaleLeaf:
    """
    Kalıcı bir veresiye satış kaydından (CreditSale veya aynı alanlara sahip
    nesne) yaprağı kurar. Taahhüt her zaman VERİTABANINA YAZILAN değerlerden
    üretilmeli ve doğrulanmalıdır; böylece üretim ve doğrulama tek kaynaktan gelir.
    """
    account_type = str(getattr(sale.account_type, "value", sale.account_type))
    account_id = sale.credit_company_id if account_type == "corporate" else sale.credit_customer_id
    if account_id is None:
        raise ValueError("Veresiye kaydının hesap kimliği yok")
    return SaleLeaf(
        sale_id=str(sale.id),
        transaction_id=str(sale.transaction_id),
        shift_id=str(sale.shift_id),
        station_id=str(sale.station_id),
        account_type=account_type,
        account_id=str(account_id),
        plate=sale.plate,
        driver_id=str(sale.driver_id) if sale.driver_id else None,
        fuel_type=sale.fuel_type,
        liters_ml=to_millilitres(sale.liters),
        amount_kurus=to_kurus(sale.amount),
        sale_time=canonical_time(sale.sale_time),
    )


def _require_hex64(value: str, name: str) -> str:
    if not isinstance(value, str) or not _HEX64.fullmatch(value):
        raise ValueError(f"{name} 64 karakterlik küçük harfli hex olmalıdır")
    return value


def sale_commitment(leaf: SaleLeaf, nonce_hex: str) -> str:
    """Tek bir veresiye satışının gizleyici taahhüdü (hex SHA-256)."""
    _require_hex64(nonce_hex, "nonce")
    if leaf.account_type not in ("corporate", "individual"):
        raise ValueError("Geçersiz hesap türü")
    if leaf.amount_kurus <= 0:
        raise ValueError("Tutar pozitif olmalıdır")
    canonical = json.dumps(leaf.payload(nonce_hex), sort_keys=True, separators=(",", ":"), ensure_ascii=True)
    return hashlib.sha256(canonical.encode("ascii")).hexdigest()


def verify_sale_commitment(leaf: SaleLeaf, nonce_hex: str, commitment: str) -> bool:
    """Açılan alanlar + nonce verilen taahhüdü üretiyor mu."""
    try:
        return secrets.compare_digest(sale_commitment(leaf, nonce_hex), commitment)
    except (ValueError, TypeError):
        return False


# ─────────────────────────── MERKLE (RFC 6962) ───────────────────────────


def _leaf_hash(commitment_hex: str) -> bytes:
    return hashlib.sha256(b"\x00" + bytes.fromhex(_require_hex64(commitment_hex, "commitment"))).digest()


def _node_hash(left: bytes, right: bytes) -> bytes:
    return hashlib.sha256(b"\x01" + left + right).digest()


def _largest_power_of_two_below(n: int) -> int:
    """n'den KÜÇÜK en büyük 2 kuvveti (n >= 2)."""
    k = 1
    while k * 2 < n:
        k *= 2
    return k


def _subtree_root(hashes: Sequence[bytes]) -> bytes:
    if len(hashes) == 1:
        return hashes[0]
    k = _largest_power_of_two_below(len(hashes))
    return _node_hash(_subtree_root(hashes[:k]), _subtree_root(hashes[k:]))


def merkle_root(commitments: Sequence[str]) -> str:
    """Sıralı taahhüt listesinin RFC 6962 Merkle kökü. Boş liste → SHA-256(b'')."""
    if not commitments:
        return hashlib.sha256(b"").hexdigest()
    return _subtree_root([_leaf_hash(c) for c in commitments]).hex()


def merkle_inclusion_path(commitments: Sequence[str], index: int) -> list[str]:
    """`index` konumundaki yaprağın denetim yolu (yapraktan köke doğru kardeş özetleri)."""
    if index < 0 or index >= len(commitments):
        raise IndexError("Yaprak indeksi aralık dışında")

    def path(hashes: Sequence[bytes], idx: int) -> list[bytes]:
        if len(hashes) == 1:
            return []
        k = _largest_power_of_two_below(len(hashes))
        if idx < k:
            return path(hashes[:k], idx) + [_subtree_root(hashes[k:])]
        return path(hashes[k:], idx - k) + [_subtree_root(hashes[:k])]

    return [node.hex() for node in path([_leaf_hash(c) for c in commitments], index)]


def verify_merkle_inclusion(
    commitment: str, index: int, leaf_count: int, path: Sequence[str], root: str,
) -> bool:
    """RFC 6962 §2.1.1 denetim yolu doğrulaması; hatalı girdide False döner."""
    try:
        if leaf_count <= 0 or index < 0 or index >= leaf_count:
            return False
        _require_hex64(root, "root")
        siblings = [bytes.fromhex(_require_hex64(p, "path")) for p in path]
        node = _leaf_hash(commitment)
        fn, sn = index, leaf_count - 1
        for sibling in siblings:
            if sn == 0:
                return False
            if fn % 2 == 1 or fn == sn:
                node = _node_hash(sibling, node)
                while fn % 2 == 0 and fn != 0:
                    fn >>= 1
                    sn >>= 1
            else:
                node = _node_hash(node, sibling)
            fn >>= 1
            sn >>= 1
        return sn == 0 and secrets.compare_digest(node.hex(), root)
    except (ValueError, TypeError):
        return False


# ─────────────────────────── VARDİYA DEFTERİ ───────────────────────────


@dataclass(frozen=True)
class ShiftLedger:
    """Bir vardiyanın veresiye defteri özeti. Kök ve sayı dışında hiçbir şey açıklanmaz."""

    shift_id: str
    leaf_count: int
    merkle_root: str
    ordered_sale_ids: tuple[str, ...]
    ordered_commitments: tuple[str, ...]
    statement_digest: str


def ledger_statement_digest(shift_id: str, leaf_count: int, root: str) -> str:
    """Vardiya + yaprak sayısı + kökü bağlayan genel (public) beyan özeti."""
    payload = {
        "domain": LEDGER_DOMAIN,
        "shiftId": str(shift_id).lower(),
        "leafCount": str(leaf_count),
        "merkleRoot": _require_hex64(root, "root"),
    }
    canonical = json.dumps(payload, sort_keys=True, separators=(",", ":"), ensure_ascii=True)
    return hashlib.sha256(canonical.encode("ascii")).hexdigest()


def build_shift_ledger(shift_id: str, sales: Sequence[tuple[str, str]]) -> ShiftLedger:
    """
    (sale_id, commitment) çiftlerinden vardiya defterini kurar.

    Yaprak sırası deterministiktir: küçük harfli sale_id'ye göre artan. Böylece
    aynı kayıt kümesi her zaman aynı kökü üretir (giriş sırasından bağımsız).
    """
    normalized = sorted((str(sale_id).lower(), commitment) for sale_id, commitment in sales)
    ids = tuple(sale_id for sale_id, _ in normalized)
    if len(set(ids)) != len(ids):
        raise ValueError("Aynı satış kimliği birden fazla kez verildi")
    commitments = tuple(commitment for _, commitment in normalized)
    root = merkle_root(commitments)
    return ShiftLedger(
        shift_id=str(shift_id).lower(),
        leaf_count=len(commitments),
        merkle_root=root,
        ordered_sale_ids=ids,
        ordered_commitments=commitments,
        statement_digest=ledger_statement_digest(shift_id, len(commitments), root),
    )
