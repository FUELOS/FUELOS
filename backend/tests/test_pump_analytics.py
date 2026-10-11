"""
FuelOS — Pompa satış analizi API testleri.

Kapsam:
- Günlük özet: normal veri, satış olmayan pompanın 0 gelmesi, boş gün.
- Pompa + yakıt detayı: toplamlar, ortalama, saatlik dağılım (Türkiye saati),
  ödeme kanalı dağılımı.
- Yetki: müdür yalnızca kendi istasyonu (başka istasyon → 403); admin tümü.
- Geçersiz girdi: hatalı tarih (422), bilinmeyen yakıt türü (422),
  başka istasyona ait pompa (404).
- Saat dilimi: Türkiye (UTC+3) gün sınırları — UTC 20:59 önceki gün,
  UTC 21:00 aynı gün; saatlik dağılım Türkiye saatiyle.

Çalıştırma (backend kökünden, PostgreSQL ayakta olmalı):
    .\\venv\\Scripts\\python.exe tests/test_pump_analytics.py
"""

import asyncio
import sys
import time
from datetime import datetime, timedelta, timezone
from pathlib import Path

sys.stdout.reconfigure(encoding="utf-8")
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from httpx import AsyncClient, ASGITransport

from app.main import app
from app.database import async_session_factory
from app.services.seed import seed_initial_data

TR_TZ = timezone(timedelta(hours=3))
_TS = str(int(time.time()))
STATION_A = {"name": "Analiz İstasyonu A", "code": f"ANLZ-A-{_TS}", "city": "Ankara"}
STATION_B = {"name": "Analiz İstasyonu B", "code": f"ANLZ-B-{_TS}", "city": "İzmir"}
MANAGER_EMAIL = f"analizmgr{_TS}@fuelos.com"
CASHIER_EMAIL = f"analizkasiyer{_TS}@fuelos.com"

# Test günü: Türkiye'nin bugünü (kaynaklar bu güne yazılacak)
TEST_DAY = datetime.now(TR_TZ).date().isoformat()


def tr_time(day_iso: str, hour: int, minute: int = 0) -> str:
    """Verilen Türkiye günü ve saatine denk gelen anı ISO formatta döndürür.

    UTC 'bugünü' ile TR 'bugünü' gece yarısı sonrasında farklı günler olabildiği
    için saatler daima TR gününden türetilir (gün kaymasın diye).
    """
    d = datetime.strptime(day_iso, "%Y-%m-%d")
    return datetime(d.year, d.month, d.day, hour, minute, tzinfo=TR_TZ).isoformat()


async def setup_fixtures(client: AsyncClient, admin_headers: dict) -> dict:
    st_a = (await client.post("/api/stations", headers=admin_headers, json=STATION_A)).json()
    st_b = (await client.post("/api/stations", headers=admin_headers, json=STATION_B)).json()

    pump1 = (await client.post("/api/pumps/", headers=admin_headers, json={
        "station_id": st_a["id"], "pump_number": 1, "label": "Pompa 1",
        "fuel_types": "Motorin,Benzin",
    })).json()
    pump2 = (await client.post("/api/pumps/", headers=admin_headers, json={
        "station_id": st_a["id"], "pump_number": 2, "label": "Pompa 2",
        "fuel_types": "Motorin",
    })).json()

    # Müdür (istasyon A'ya kilitli) ve kasiyer
    await client.post("/api/users", headers=admin_headers, json={
        "email": MANAGER_EMAIL, "password": "Mudur2026!", "full_name": "Analiz Müdürü",
        "role": "station_manager", "station_id": st_a["id"],
    })
    await client.post("/api/users", headers=admin_headers, json={
        "email": CASHIER_EMAIL, "password": "Kasiyer2026!", "full_name": "Analiz Kasiyeri",
        "role": "cashier", "station_id": st_a["id"],
    })
    mgr_token = (await client.post("/api/auth/login", json={
        "email": MANAGER_EMAIL, "password": "Mudur2026!",
    })).json()["access_token"]
    cashier_token = (await client.post("/api/auth/login", json={
        "email": CASHIER_EMAIL, "password": "Kasiyer2026!",
    })).json()["access_token"]

    # Açık vardiya (kasiyer, istasyon A)
    shift = (await client.post("/api/shifts/open",
        headers={"Authorization": f"Bearer {cashier_token}"},
        json={"station_id": st_a["id"], "worker_name": "Analiz İşçisi", "opening_cash": 100},
    )).json()

    return {
        "st_a": st_a, "st_b": st_b, "pump1": pump1, "pump2": pump2,
        "manager_headers": {"Authorization": f"Bearer {mgr_token}"},
        "cashier_headers": {"Authorization": f"Bearer {cashier_token}"},
        "shift": shift,
    }


async def add_tx(client: AsyncClient, headers: dict, fx: dict, **kw) -> dict:
    """Akaryakıt satışı ekler; transaction_time (UTC ISO) verilebilir."""
    payload = {
        "shift_id": fx["shift"]["id"],
        "type": "fuel",
        "payment_method": "cash",
        "amount": "100.00",
        "liters": "10.000",
        "fuel_type": "Motorin",
        "pump_id": fx["pump1"]["id"],
    }
    payload.update(kw)
    res = await client.post("/api/transactions", headers=headers, json=payload)
    assert res.status_code == 201, f"Satış eklenemedi: {res.text}"
    return res.json()


async def run_tests() -> None:
    print("\n" + "=" * 60)
    print("🧪 FUELOS — POMPA SATIŞ ANALİZİ API TESTLERİ")
    print("=" * 60 + "\n")

    async with async_session_factory() as session:
        await seed_initial_data(session)

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        admin_token = (await client.post("/api/auth/login", json={
            "email": "admin@fuelos.com", "password": "FuelOS2026!",
        })).json()["access_token"]
        admin_headers = {"Authorization": f"Bearer {admin_token}"}

        fx = await setup_fixtures(client, admin_headers)
        ch = fx["cashier_headers"]
        passed = 0

        # ── Normal veri: pompa 1'e 3 satış, pompa 2'ye 1 satış ──
        # Tüm saatler TEST_DAY'ın Türkiye saatleri (gün kayması olmasın)
        # TR 10:00 (nakit, motorin, 50Lt/2250₺)
        await add_tx(client, ch, fx, amount="2250.00", liters="50.000",
                     payment_method="cash", transaction_time=tr_time(TEST_DAY, 10, 0))
        # TR 14:30 (POS, motorin, 30Lt/1350₺)
        await add_tx(client, ch, fx, amount="1350.00", liters="30.000",
                     payment_method="credit_card", transaction_time=tr_time(TEST_DAY, 14, 30))
        # TR 18:00 (veresiye, motorin, 20Lt/900₺) — pompa 2
        await add_tx(client, ch, fx, amount="900.00", liters="20.000",
                     payment_method="veresiye", pump_id=fx["pump2"]["id"],
                     transaction_time=tr_time(TEST_DAY, 18, 0))
        # Pompa 1'e benzin (TR 09:00, 25Lt/1100₺)
        await add_tx(client, ch, fx, amount="1100.00", liters="25.000",
                     fuel_type="Benzin", transaction_time=tr_time(TEST_DAY, 9, 0))

        # 1) Günlük özet — admin
        res = await client.get("/api/pump-analytics/daily-summary",
                               headers=admin_headers,
                               params={"station_id": fx["st_a"]["id"], "date": TEST_DAY})
        assert res.status_code == 200, f"Özet alınamadı: {res.text}"
        body = res.json()
        p1 = next(p for p in body["pumps"] if p["pump_id"] == fx["pump1"]["id"])
        p2 = next(p for p in body["pumps"] if p["pump_id"] == fx["pump2"]["id"])
        assert body["date"] == TEST_DAY
        assert str(p1["total_liters"]) == "105.000", p1
        assert str(p1["total_amount"]) == "4700.00", p1
        assert p1["transaction_count"] == 3, p1
        motorin = next(f for f in p1["fuel_breakdown"] if f["fuel_type"] == "Motorin")
        benzin = next(f for f in p1["fuel_breakdown"] if f["fuel_type"] == "Benzin")
        assert str(motorin["liters"]) == "80.000" and str(motorin["amount"]) == "3600.00"
        assert motorin["transaction_count"] == 2
        assert str(benzin["liters"]) == "25.000" and str(benzin["amount"]) == "1100.00"
        assert str(p2["total_liters"]) == "20.000" and str(p2["total_amount"]) == "900.00"
        assert p2["transaction_count"] == 1
        print("✅ 1. Günlük özet (admin): pompa/yakıt toplamları doğru")
        passed += 1

        # 2) Pompa 2'nin Benzin'i yok → fuel_breakdown'da listelenmez (pompa sadece Motorin satar)
        assert [f["fuel_type"] for f in p2["fuel_breakdown"]] == ["Motorin"], p2
        print("✅ 2. Pompa yalnızca sattığı yakıt türleriyle listelenir")
        passed += 1

        # 3) Günlük özet — müdür kendi istasyonu
        res = await client.get("/api/pump-analytics/daily-summary",
                               headers=fx["manager_headers"],
                               params={"station_id": fx["st_a"]["id"], "date": TEST_DAY})
        assert res.status_code == 200, f"Müdür özeti alamadı: {res.text}"
        assert len(res.json()["pumps"]) == 2
        print("✅ 3. Günlük özet (müdür, kendi istasyonu): 200")
        passed += 1

        # 4) Müdür başka istasyon → 403
        res = await client.get("/api/pump-analytics/daily-summary",
                               headers=fx["manager_headers"],
                               params={"station_id": fx["st_b"]["id"], "date": TEST_DAY})
        assert res.status_code == 403, f"Beklenen 403, gelen {res.status_code}: {res.text}"
        # pump-detail'te de aynı kontrol
        res = await client.get("/api/pump-analytics/pump-detail",
                               headers=fx["manager_headers"],
                               params={"station_id": fx["st_b"]["id"], "pump_id": fx["pump1"]["id"], "fuel_type": "Motorin"})
        assert res.status_code == 403, f"Beklenen 403, gelen {res.status_code}"
        print("✅ 4. Müdür başka istasyon → 403 (her iki endpoint)")
        passed += 1

        # 5) Kasiyer → 403 (yetkisiz rol)
        res = await client.get("/api/pump-analytics/daily-summary",
                               headers=ch, params={"station_id": fx["st_a"]["id"]})
        assert res.status_code == 403, f"Beklenen 403, gelen {res.status_code}"
        print("✅ 5. Kasiyer analitik erişimi → 403")
        passed += 1

        # 6) Pompa detayı — toplamlar, ortalama, saatlik, ödeme kanalı
        res = await client.get("/api/pump-analytics/pump-detail",
                               headers=fx["manager_headers"],
                               params={"station_id": fx["st_a"]["id"], "pump_id": fx["pump1"]["id"],
                                       "fuel_type": "Motorin", "date": TEST_DAY})
        assert res.status_code == 200, f"Detay alınamadı: {res.text}"
        d = res.json()
        assert str(d["total_liters"]) == "80.000" and str(d["total_amount"]) == "3600.00"
        assert d["transaction_count"] == 2
        assert str(d["average_transaction_amount"]) == "1800.00", d
        # Saatlik: TR 10:00 → hour 10; TR 14:30 → hour 14 (Türkiye saati)
        h10 = d["hourly_distribution"][10]
        h14 = d["hourly_distribution"][14]
        assert h10["transaction_count"] == 1 and str(h10["amount"]) == "2250.00", h10
        assert h14["transaction_count"] == 1 and str(h14["amount"]) == "1350.00", h14
        assert len(d["hourly_distribution"]) == 24
        assert sum(b["transaction_count"] for b in d["hourly_distribution"]) == 2
        # Ödeme kanalı: 2250 nakit + 1350 POS
        assert str(d["payment_breakdown"]["cash"]["amount"]) == "2250.00"
        assert d["payment_breakdown"]["cash"]["transaction_count"] == 1
        assert str(d["payment_breakdown"]["credit_card"]["amount"]) == "1350.00"
        assert d["payment_breakdown"]["credit_card"]["transaction_count"] == 1
        assert str(d["payment_breakdown"]["veresiye"]["amount"]) == "0.00"
        print("✅ 6. Pompa detayı: toplam/ortalama/saatlik(TR)/ödeme kanalı doğru")
        passed += 1

        # 7) Boş gün — tümü 0
        res = await client.get("/api/pump-analytics/daily-summary",
                               headers=admin_headers,
                               params={"station_id": fx["st_a"]["id"], "date": "2030-01-01"})
        assert res.status_code == 200
        empty = res.json()
        assert len(empty["pumps"]) == 2
        for p in empty["pumps"]:
            assert str(p["total_liters"]) == "0.000" and str(p["total_amount"]) == "0.00"
            assert p["transaction_count"] == 0
        res = await client.get("/api/pump-analytics/pump-detail",
                               headers=admin_headers,
                               params={"station_id": fx["st_a"]["id"], "pump_id": fx["pump1"]["id"],
                                       "fuel_type": "Motorin", "date": "2030-01-01"})
        assert res.status_code == 200
        d = res.json()
        assert str(d["total_amount"]) == "0.00" and d["transaction_count"] == 0
        assert str(d["average_transaction_amount"]) == "0.00"
        assert all(b["transaction_count"] == 0 for b in d["hourly_distribution"])
        print("✅ 7. Boş gün: özet ve detay tümüyle 0")
        passed += 1

        # 8) Geçersiz girdiler
        res = await client.get("/api/pump-analytics/daily-summary",
                               headers=admin_headers,
                               params={"station_id": fx["st_a"]["id"], "date": "31.12.2026"})
        assert res.status_code == 422 and "YYYY-MM-DD" in res.json()["detail"], res.text
        res = await client.get("/api/pump-analytics/pump-detail",
                               headers=admin_headers,
                               params={"station_id": fx["st_a"]["id"], "pump_id": fx["pump1"]["id"],
                                       "fuel_type": "Uçak Yakıtı"})
        assert res.status_code == 422 and "satmıyor" in res.json()["detail"], res.text
        print("✅ 8. Geçersiz tarih (422) ve bilinmeyen yakıt türü (422)")
        passed += 1

        # 9) Başka istasyona ait pompa → 404
        pump_b = (await client.post("/api/pumps/", headers=admin_headers, json={
            "station_id": fx["st_b"]["id"], "pump_number": 1, "label": "Pompa B1",
            "fuel_types": "Motorin",
        })).json()
        res = await client.get("/api/pump-analytics/pump-detail",
                               headers=admin_headers,
                               params={"station_id": fx["st_a"]["id"], "pump_id": pump_b["id"], "fuel_type": "Motorin"})
        assert res.status_code == 404, f"Beklenen 404, gelen {res.status_code}"
        print("✅ 9. Pompa başka istasyona ait → 404")
        passed += 1

        # 10) Saat dilimi gün sınırları (Türkiye, UTC+3)
        # TR 23:59 (bugünün son dakikası) → bugünün özetinde;
        # TR 00:01 (yarının ilk dakikası) → yarınki özette.
        await add_tx(client, ch, fx, amount="10.00", liters="1.000",
                     transaction_time=tr_time(TEST_DAY, 23, 59))
        res = await client.get("/api/pump-analytics/daily-summary",
                               headers=admin_headers,
                               params={"station_id": fx["st_a"]["id"], "date": TEST_DAY})
        p1 = next(p for p in res.json()["pumps"] if p["pump_id"] == fx["pump1"]["id"])
        motorin = next(f for f in p1["fuel_breakdown"] if f["fuel_type"] == "Motorin")
        assert motorin["transaction_count"] == 3 and str(motorin["amount"]) == "3610.00", motorin
        tomorrow = (datetime.strptime(TEST_DAY, "%Y-%m-%d").date() + timedelta(days=1)).isoformat()
        await add_tx(client, ch, fx, amount="20.00", liters="2.000",
                     transaction_time=tr_time(tomorrow, 0, 1))
        res_t = await client.get("/api/pump-analytics/daily-summary",
                                 headers=admin_headers,
                                 params={"station_id": fx["st_a"]["id"], "date": tomorrow})
        p1_t = next(p for p in res_t.json()["pumps"] if p["pump_id"] == fx["pump1"]["id"])
        motorin_t = next(f for f in p1_t["fuel_breakdown"] if f["fuel_type"] == "Motorin")
        # TR 00:01 kaydı kesin yarınki TR gününe düşmeli
        assert motorin_t["transaction_count"] == 1 and str(motorin_t["amount"]) == "20.00", motorin_t
        assert str(p1_t["total_amount"]) == "20.00", p1_t
        print("✅ 10. UTC+3 gün sınırları: TR 23:59 bugüne, TR 00:01 yarına düşüyor")
        passed += 1

    print("\n" + "=" * 60)
    print(f"🎉 TÜM POMPA ANALİZİ TESTLERİ GEÇTİ: {passed}/{passed}")
    print("=" * 60 + "\n")


if __name__ == "__main__":
    asyncio.run(run_tests())
