"""
FuelOS — Satış kaydı pompa doğrulama testleri (pump_id).

Kapsam:
- Akaryakıt satışında belirli pompa veya tüm pompalar kapsamında kayıt.
- Pompanın satış istasyonuna ait olması.
- Pompanın aktif olması.
- Pompanın seçilen yakıt türünü satması.
- Market satışında pump_id gönderilmemesi (nullable) ve gönderilirse reddi.
- Geçerli akaryakıt satışında pump_id/pump_label kaydı ve yanıtta dönmesi.

Çalıştırma (backend kökünden, PostgreSQL ayakta olmalı):
    .\\venv\\Scripts\\python.exe tests/test_transaction_pump.py
"""

import asyncio
import sys
import time
from pathlib import Path

sys.stdout.reconfigure(encoding="utf-8")
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from httpx import AsyncClient, ASGITransport

from app.main import app
from app.database import async_session_factory
from app.services.seed import seed_initial_data

# Her çalıştırmada benzersiz kod/e-posta (test tekrar çalıştırılabilir olsun)
_TS = str(int(time.time()))
BASE_STATION = {
    "name": "Pompa Test İstasyonu A",
    "code": f"PMP-A-{_TS}",
    "city": "Ankara",
}
OTHER_STATION = {
    "name": "Pompa Test İstasyonu B",
    "code": f"PMP-B-{_TS}",
    "city": "İstanbul",
}
CASHIER_EMAIL = f"pumptest{_TS}@fuelos.com"


async def setup_fixtures(client: AsyncClient, admin_headers: dict) -> dict:
    """Test istasyonlarını, pompaları, kullanıcıları ve açık vardiyayı hazırlar."""
    # Ana istasyon
    st_res = await client.post("/api/stations", headers=admin_headers, json=BASE_STATION)
    assert st_res.status_code == 201, f"İstasyon oluşturulamadı: {st_res.text}"
    station = st_res.json()

    # Diğer istasyon (pompa istasyon uyumsuzluğu testi için)
    other_res = await client.post("/api/stations", headers=admin_headers, json=OTHER_STATION)
    assert other_res.status_code == 201, f"Diğer istasyon oluşturulamadı: {other_res.text}"
    other_station = other_res.json()

    # Ana istasyona pompa
    pump_res = await client.post("/api/pumps/", headers=admin_headers, json={
        "station_id": station["id"],
        "pump_number": 1,
        "label": "Pompa 1",
        "fuel_types": "Motorin,Benzin",
    })
    assert pump_res.status_code in (200, 201), f"Pompa oluşturulamadı: {pump_res.text}"
    pump = pump_res.json()

    # İkinci aktif pompa, tüm-pompalar yakıt doğrulaması için kullanılır.
    all_pumps_res = await client.post("/api/pumps/", headers=admin_headers, json={
        "station_id": station["id"],
        "pump_number": 3,
        "label": "Pompa 3",
        "fuel_types": "Otogaz",
    })
    assert all_pumps_res.status_code in (200, 201), f"Pompa 3 oluşturulamadı: {all_pumps_res.text}"

    # Diğer istasyona pompa
    other_pump_res = await client.post("/api/pumps/", headers=admin_headers, json={
        "station_id": other_station["id"],
        "pump_number": 1,
        "label": "Pompa B1",
        "fuel_types": "Motorin",
    })
    assert other_pump_res.status_code in (200, 201), f"Diğer pompa oluşturulamadı: {other_pump_res.text}"
    other_pump = other_pump_res.json()

    # Aktif olmayacak pompa
    inactive_pump_res = await client.post("/api/pumps/", headers=admin_headers, json={
        "station_id": station["id"],
        "pump_number": 2,
        "label": "Pompa 2",
        "fuel_types": "Motorin",
    })
    assert inactive_pump_res.status_code in (200, 201), f"Pompa 2 oluşturulamadı: {inactive_pump_res.text}"
    inactive_pump = inactive_pump_res.json()

    # Kasiyer + açık vardiya (satışlar bu vardiyaya eklenecek)
    create_u = await client.post("/api/users", headers=admin_headers, json={
        "email": CASHIER_EMAIL,
        "password": "Kasiyer2026!",
        "full_name": "Pompa Test Kasiyeri",
        "role": "cashier",
        "station_id": station["id"],
    })
    assert create_u.status_code in (200, 201), f"Kasiyer oluşturulamadı: {create_u.text}"

    cashier_login = await client.post("/api/auth/login", json={
        "email": CASHIER_EMAIL,
        "password": "Kasiyer2026!",
    })
    assert cashier_login.status_code == 200, f"Kasiyer girişi başarısız: {cashier_login.text}"
    cashier_headers = {"Authorization": f"Bearer {cashier_login.json()['access_token']}"}

    # Açık vardiya
    open_res = await client.post("/api/shifts/open", headers=cashier_headers, json={
        "station_id": station["id"],
        "worker_name": "Pompa Test İşçisi",
        "opening_cash": 500,
        "pump_id": None,
    })
    assert open_res.status_code in (200, 201), f"Vardiya açılamadı: {open_res.text}"
    shift = open_res.json()

    # İnaktif pompa: doğrudan DB üzerinden pasife çek
    from app.models.pump import Pump
    from sqlalchemy import update
    async with async_session_factory() as session:
        await session.execute(update(Pump).where(Pump.id == inactive_pump["id"]).values(is_active=False))
        await session.commit()

    return {
        "station": station,
        "other_station": other_station,
        "pump": pump,
        "other_pump": other_pump,
        "inactive_pump": inactive_pump,
        "cashier_headers": cashier_headers,
        "shift": shift,
    }


def fuel_payload(fx: dict, **override) -> dict:
    payload = {
        "shift_id": fx["shift"]["id"],
        "type": "fuel",
        "payment_method": "cash",
        "amount": 100,
        "liters": 2.2,
        "fuel_type": "Motorin",
        "pump_id": fx["pump"]["id"],
    }
    payload.update(override)
    return payload


async def run_tests() -> None:
    print("\n" + "=" * 60)
    print("🧪 FUELOS — SATIŞ POMPA DOĞRULAMA TESTLERİ (pump_id)")
    print("=" * 60 + "\n")

    async with async_session_factory() as session:
        await seed_initial_data(session)

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        # Admin girişi
        admin_login = await client.post("/api/auth/login", json={
            "email": "admin@fuelos.com",
            "password": "FuelOS2026!",
        })
        assert admin_login.status_code == 200, "Admin girişi başarısız"
        admin_headers = {"Authorization": f"Bearer {admin_login.json()['access_token']}"}

        fx = await setup_fixtures(client, admin_headers)
        passed = 0

        # 1) Tüm pompalar kapsamında pompa belirtilmeden satış kaydedilebilmeli
        res = await client.post("/api/transactions", headers=fx["cashier_headers"],
                                json=fuel_payload(fx, pump_id=None, fuel_type="Otogaz (LPG)"))
        assert res.status_code == 201, f"Beklenen 201, gelen {res.status_code}: {res.text}"
        assert res.json()["pump_id"] is None and res.json()["pump_label"] is None
        print("✅ 1. Tüm pompalar kapsamında satış pompa numarası olmadan kaydedildi")
        passed += 1

        # 2) Tüm aktif pompaların desteklemediği yakıt reddedilmeli
        res = await client.post("/api/transactions", headers=fx["cashier_headers"],
                                json=fuel_payload(fx, pump_id=None, fuel_type="AdBlue"))
        assert res.status_code == 422, f"Beklenen 422, gelen {res.status_code}: {res.text}"
        print("✅ 2. Hiçbir aktif pompanın satmadığı yakıt → 422")
        passed += 1

        # 3) Başka istasyonun pompası reddedilmeli
        res = await client.post("/api/transactions", headers=fx["cashier_headers"],
                                json=fuel_payload(fx, pump_id=fx["other_pump"]["id"]))
        assert res.status_code == 422, f"Beklenen 422, gelen {res.status_code}: {res.text}"
        print("✅ 3. Pompa başka istasyona ait → 422")
        passed += 1

        # 4) Aktif olmayan pompa reddedilmeli
        res = await client.post("/api/transactions", headers=fx["cashier_headers"],
                                json=fuel_payload(fx, pump_id=fx["inactive_pump"]["id"]))
        assert res.status_code == 422, f"Beklenen 422, gelen {res.status_code}: {res.text}"
        print("✅ 4. Pompa aktif değil → 422")
        passed += 1

        # 5) Pompanın satmadığı yakıt türü reddedilmeli
        res = await client.post("/api/transactions", headers=fx["cashier_headers"],
                                json=fuel_payload(fx, fuel_type="Otogaz (LPG)"))
        assert res.status_code == 422, f"Beklenen 422, gelen {res.status_code}: {res.text}"
        print("✅ 5. Pompa seçilen yakıtı satmıyor → 422")
        passed += 1

        # 6) Market satışında pump_id gönderilirse reddedilmeli
        res = await client.post("/api/transactions", headers=fx["cashier_headers"],
                                json=fuel_payload(fx, type="market", pump_id=fx["pump"]["id"]))
        assert res.status_code == 422, f"Beklenen 422, gelen {res.status_code}: {res.text}"
        print("✅ 6. Market satışında pump_id gönderilirse → 422")
        passed += 1

        # 7) Market satışı pump olmadan başarili olmalı (pump_id null)
        res = await client.post("/api/transactions", headers=fx["cashier_headers"],
                                json=fuel_payload(fx, type="market", pump_id=None, liters=None, fuel_type=None))
        assert res.status_code == 201, f"Beklenen 201, gelen {res.status_code}: {res.text}"
        body = res.json()
        assert body["pump_id"] is None and (body.get("pump_label") is None)
        print("✅ 7. Market satışı pump'sız → 201, pump_id=null")
        passed += 1

        # 8) Geçerli akaryakıt satışı: pump_id kaydedilmeli ve yanıtta pompa etiketi dönmeli
        res = await client.post("/api/transactions", headers=fx["cashier_headers"],
                                json=fuel_payload(fx))
        assert res.status_code == 201, f"Beklenen 201, gelen {res.status_code}: {res.text}"
        body = res.json()
        assert body["pump_id"] == fx["pump"]["id"], f"pump_id kaydedilmedi: {body}"
        assert body["pump_label"] == "Pompa 1", f"pump_label dönmedi: {body}"
        print("✅ 8. Geçerli akaryakıt satışı → 201, pump_id + pump_label doğru")
        passed += 1

        # 9) Liste endpoint'i pump_label döndürmeli
        res = await client.get("/api/transactions", headers=fx["cashier_headers"])
        assert res.status_code == 200
        items = res.json()
        fuel_items = [i for i in items if i["type"] == "fuel"]
        assert len(fuel_items) > 0, "Listede akaryakıt satışı bulunamadı"
        assert all("pump_label" in i for i in fuel_items), "Liste öğelerinde pump_label yok"
        print("✅ 9. GET /api/transactions yanıtında pump_label alanı mevcut")
        passed += 1

    print("\n" + "=" * 60)
    print(f"🎉 TÜM POMPA DOĞRULAMA TESTLERİ GEÇTİ: {passed}/{passed}")
    print("=" * 60 + "\n")


if __name__ == "__main__":
    asyncio.run(run_tests())
