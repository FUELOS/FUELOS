"""
FuelOS — Vardiya Kapanışı Mutabakat Motoru (K-001).

TS referans uygulama: FuelOS-engine/src/reconciliation.ts (Görev 1 teslimi).
Bu modül onun birebir Python portudur; DEC-001 semantiğini (varsayılan tolerans
1 TL, sınır dahil) ve ortak test vektörlerini (backend/tests/test_reconciliation.py)
paylaşır.

Saf modüldür: veritabanı veya API bağımlılığı yoktur — yalnızca pydantic kullanır.
"""

from decimal import Decimal, ROUND_HALF_UP
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator

# ─────────────────────────── SABİTLER ───────────────────────────

KURUS = Decimal("0.01")

# Varsayılan mutabakat toleransı (TL) — DEC-001.
DEFAULT_TOLERANCE = Decimal("1.00")


# ─────────────────────────── ŞEMA ───────────────────────────


class ReconciliationInput(BaseModel):
    """Vardiya kapanışı mutabakat girdisi (TL).

    Şema katıdır: eksik alan, negatif değer, NaN/Infinity ve bilinmeyen alan
    reddedilir (TS tarafındaki Zod şemasının karşılığı).
    """

    model_config = ConfigDict(extra="forbid")

    total_sales: Decimal = Field(ge=0)
    pos: Decimal = Field(ge=0)
    cash: Decimal = Field(ge=0)
    eft: Decimal = Field(ge=0)
    credit: Decimal = Field(ge=0)

    @field_validator("total_sales", "pos", "cash", "eft", "credit")
    @classmethod
    def _sonlu_olmali(cls, v: Decimal) -> Decimal:
        if not v.is_finite():
            raise ValueError("değer sonlu (finite) olmalıdır")
        return v


class ReconciliationResult(BaseModel):
    """Mutabakat sonucu — K-001 motor çıktısı."""

    status: Literal["BAŞARILI", "UYUŞMAZLIK"]
    # total_sales − calculated_total (TL, kuruş hassasiyeti).
    # Pozitif = açık (tahsilat satışları karşılamıyor), negatif = fazla.
    difference: Decimal
    # pos + cash + eft + credit toplamı (TL, kuruş hassasiyeti).
    calculated_total: Decimal


# ─────────────────────────── MOTOR ───────────────────────────


def reconcile(
    raw: object,
    tolerance: Decimal | float = DEFAULT_TOLERANCE,
) -> ReconciliationResult:
    """Vardiya kapanışı eşitliğini denetler (K-001, DEC-001):

    Toplam Satış = POS + Nakit + EFT + Veresiye
    |fark| ≤ tolerance ise BAŞARILI (sınır dahil).

    Geçersiz girdide pydantic ValidationError, negatif toleransta ValueError
    fırlatır. Saf fonksiyondur; hiçbir dış bağımlılığa dokunmaz.
    """
    tol = _decimal_yap(tolerance)
    if not tol.is_finite() or tol < 0:
        raise ValueError(f"tolerance 0 veya daha büyük olmalı, gelen: {tolerance}")

    data = ReconciliationInput.model_validate(raw)

    calculated_total = _kurus(data.pos + data.cash + data.eft + data.credit)
    difference = _kurus(data.total_sales - calculated_total)

    return ReconciliationResult(
        status="BAŞARILI" if abs(difference) <= tol else "UYUŞMAZLIK",
        difference=difference,
        calculated_total=calculated_total,
    )


def to_api_status(result: ReconciliationResult) -> Literal["matched", "shortage", "surplus"]:
    """Motor sonucunu FuelOS API durum sözlüğüne çevirir (DEC-002).

    BAŞARILI → matched (tolerans dahilinde), UYUŞMAZLIK →
    shortage (pozitif fark / açık) veya surplus (negatif fark / fazla).
    """
    if result.status == "BAŞARILI":
        return "matched"
    return "shortage" if result.difference > 0 else "surplus"


def _kurus(value: Decimal) -> Decimal:
    """Kuruş (2 hane) hassasiyetine yuvarlar — ondalık tozunu temizler."""
    return value.quantize(KURUS, rounding=ROUND_HALF_UP)


def _decimal_yap(v: Decimal | float) -> Decimal:
    return v if isinstance(v, Decimal) else Decimal(str(v))
