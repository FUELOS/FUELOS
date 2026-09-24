"""
FuelOS — Mutabakat motoru testleri (K-001, DEC-001/DEC-002).

TS referans uygulamayla (FuelOS-engine, Jest) ortak test vektörlerini paylaşır:
aynı girdiler, aynı beklenen sonuçlar. Vektörler değişirse iki taraf birlikte
güncellenmelidir.
"""

from decimal import Decimal

import pytest
from pydantic import ValidationError

from app.services.reconciliation import DEFAULT_TOLERANCE, reconcile

D = Decimal


def girdi(**override):
    """Varsayılan dengeli kapanış girdisi (1000 = 400+300+200+100)."""
    tam = {
        "total_sales": "1000",
        "pos": "400",
        "cash": "300",
        "eft": "200",
        "credit": "100",
    }
    tam.update(override)
    return tam


class TestK001Senaryolari:
    """Brifingin 5 senaryosu — TC-001…TC-005 ile birebir aynı vektörler."""

    def test_1_dengeli_kapanis(self):
        r = reconcile(girdi())
        assert r.status == "BAŞARILI"
        assert r.difference == D("0.00")
        assert r.calculated_total == D("1000.00")

    def test_2_pos_acik(self):
        r = reconcile(
            girdi(total_sales="2500", pos="250", cash="1000", eft="750", credit="250")
        )
        assert r.status == "UYUŞMAZLIK"
        assert r.calculated_total == D("2250.00")
        assert r.difference == D("250.00")

    def test_3_nakit_fazlasi(self):
        r = reconcile(girdi(pos="300", cash="800", eft="100", credit="0"))
        assert r.status == "UYUŞMAZLIK"
        assert r.calculated_total == D("1200.00")
        assert r.difference == D("-200.00")

    def test_4_tolerans_siniri(self):
        tam_sinir = reconcile(girdi(pos="399"))
        assert tam_sinir.difference == DEFAULT_TOLERANCE
        assert tam_sinir.status == "BAŞARILI"

        bir_kurus_ustunde = reconcile(girdi(pos="399", credit="99.99"))
        assert bir_kurus_ustunde.difference == D("1.01")
        assert bir_kurus_ustunde.status == "UYUŞMAZLIK"

    def test_5_gecersiz_girdi(self):
        with pytest.raises(ValidationError):
            reconcile({"total_sales": "1000", "pos": "400", "cash": "300", "eft": "200"})

        with pytest.raises(ValidationError):
            reconcile(girdi(pos="-1"))

        with pytest.raises(ValidationError):
            reconcile(girdi(surcharge="50"))


class TestSozlesmeDetaylari:
    def test_ondalik_toz_kurus_yuvarlama(self):
        r = reconcile(girdi(total_sales="0.3", pos="0.1", cash="0.2", eft="0", credit="0"))
        assert r.difference == D("0.00")
        assert r.status == "BAŞARILI"

    def test_ozel_tolerans_parametresi(self):
        r = reconcile(girdi(pos="300", cash="300", eft="200", credit="100"), tolerance=D("200"))
        assert r.status == "BAŞARILI"
        assert r.difference == D("100.00")

    def test_negatif_tolerans_reddedilir(self):
        with pytest.raises(ValueError):
            reconcile(girdi(), tolerance=-1)

    def test_api_durum_eslemesi(self):
        from app.services.reconciliation import to_api_status

        dengeli = reconcile(girdi())
        assert to_api_status(dengeli) == "matched"

        acik = reconcile(girdi(pos="250"))
        assert to_api_status(acik) == "shortage"

        fazla = reconcile(girdi(cash="400"))
        assert to_api_status(fazla) == "surplus"
