"""
FuelOS — Uçtan Uca Full-Stack Entegrasyon Testi.
1. SuperAdmin ve Demo Şirket tohumlama (Seed)
2. JWT ile SuperAdmin girişi
3. İstasyon oluşturma (Ankara Merkez - IST-001)
4. Kasiyer kullanıcısı oluşturma (kasiyer@fuelos.com)
5. Kasiyer ile giriş yapıp JWT alma
6. Vardiya başlatma (1.500 TL açılış nakit)
7. Farklı ödeme türlerinde (Nakit, POS, Veresiye) akaryakıt ve market satışları ekleme
8. Dashboard API'sinden canlı verileri çekip doğrulama
"""

import asyncio
import sys
from decimal import Decimal

sys.stdout.reconfigure(encoding="utf-8")
from httpx import AsyncClient, ASGITransport

from app.main import app
from app.database import async_session_factory
from app.services.seed import seed_initial_data


async def run_full_flow_test():
    print("\n" + "=" * 60)
    print("🚀 FUELOS FAZ 1 — FULL-STACK ENTEGRASYON VE DOĞRULAMA TESTİ")
    print("=" * 60 + "\n")

    # 1. Seed
    async with async_session_factory() as session:
        await seed_initial_data(session)
    print("✅ 1. Veritabanı tohumlama tamamlandı.")

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        # 2. SuperAdmin Giriş
        res = await client.post("/api/auth/login", json={
            "email": "admin@fuelos.com",
            "password": "FuelOS2026!"
        })
        assert res.status_code == 200, f"Login failed: {res.text}"
        admin_data = res.json()
        admin_token = admin_data["access_token"]
        admin_headers = {"Authorization": f"Bearer {admin_token}"}
        print(f"✅ 2. SuperAdmin giriş yaptı: {admin_data['full_name']} ({admin_data['role']})")

        # 3. İstasyon Oluşturma (varsa es geç veya oluştur)
        st_res = await client.get("/api/stations", headers=admin_headers)
        stations = st_res.json()
        if not stations:
            create_st_res = await client.post("/api/stations", headers=admin_headers, json={
                "name": "Ankara Merkez İstasyonu",
                "code": "IST-001",
                "city": "Ankara",
                "district": "Çankaya",
                "address": "Eskişehir Yolu 12. Km"
            })
            assert create_st_res.status_code == 201, f"Station create failed: {create_st_res.text}"
            station = create_st_res.json()
            print(f"✅ 3. Yeni istasyon oluşturuldu: {station['name']} [{station['code']}]")
        else:
            station = stations[0]
            print(f"✅ 3. Mevcut istasyon kullanılıyor: {station['name']} [{station['code']}]")

        station_id = station["id"]

        # 4. Kasiyer Kullanıcısı Oluşturma
        users_res = await client.get("/api/users", headers=admin_headers)
        users = users_res.json()
        cashier = next((u for u in users if u["email"] == "kasiyer@fuelos.com"), None)
        if not cashier:
            create_u_res = await client.post("/api/users", headers=admin_headers, json={
                "email": "kasiyer@fuelos.com",
                "password": "Kasiyer2026!",
                "full_name": "Ahmet Yılmaz",
                "role": "cashier",
                "station_id": station_id
            })
            assert create_u_res.status_code == 201, f"Cashier create failed: {create_u_res.text}"
            cashier = create_u_res.json()
            print(f"✅ 4. Kasiyer oluşturuldu: {cashier['full_name']} ({cashier['email']})")
        else:
            print(f"✅ 4. Mevcut kasiyer kullanılıyor: {cashier['full_name']}")

        # 5. Kasiyer Girişi
        k_login_res = await client.post("/api/auth/login", json={
            "email": "kasiyer@fuelos.com",
            "password": "Kasiyer2026!"
        })
        assert k_login_res.status_code == 200, f"Cashier login failed: {k_login_res.text}"
        k_token = k_login_res.json()["access_token"]
        cashier_headers = {"Authorization": f"Bearer {k_token}"}
        print("✅ 5. Kasiyer başarıyla JWT oturumu aldı.")

        # 6. Açık vardiya kontrolü veya yeni vardiya açma
        shifts_res = await client.get("/api/shifts?shift_status=open", headers=cashier_headers)
        open_shifts = shifts_res.json()
        if not open_shifts:
            open_res = await client.post("/api/shifts/open", headers=cashier_headers, json={
                "station_id": station_id,
                "opening_cash": "1500.00",
                "notes": "Sabah vardiyası açılışı"
            })
            assert open_res.status_code == 201, f"Shift open failed: {open_res.text}"
            shift = open_res.json()
            print(f"✅ 6. Yeni vardiya açıldı! ID: {shift['id']} | Açılış Kasa: {shift['opening_cash']} TL")
        else:
            shift = open_shifts[0]
            print(f"✅ 6. Mevcut açık vardiya bulundu: {shift['id']}")

        shift_id = shift["id"]

        # 7. Satış İşlemleri Ekleme
        # İşlem 1: Motorin (Kredi Kartı)
        t1 = await client.post("/api/transactions", headers=cashier_headers, json={
            "shift_id": shift_id,
            "type": "fuel",
            "payment_method": "credit_card",
            "amount": "2150.00",
            "liters": "50.000",
            "fuel_type": "Motorin (Dizel)",
            "description": "06 ABC 123"
        })
        assert t1.status_code == 201, f"Tx1 failed: {t1.text}"

        # İşlem 2: Kurşunsuz 95 (Nakit)
        t2 = await client.post("/api/transactions", headers=cashier_headers, json={
            "shift_id": shift_id,
            "type": "fuel",
            "payment_method": "cash",
            "amount": "1320.00",
            "liters": "30.000",
            "fuel_type": "Kurşunsuz 95 (Benzin)",
            "description": "34 XYZ 789"
        })
        assert t2.status_code == 201, f"Tx2 failed: {t2.text}"

        # İşlem 3: Market (Nakit)
        t3 = await client.post("/api/transactions", headers=cashier_headers, json={
            "shift_id": shift_id,
            "type": "market",
            "payment_method": "cash",
            "amount": "150.00",
            "description": "Madensuyu + Kahve"
        })
        assert t3.status_code == 201, f"Tx3 failed: {t3.text}"

        # İşlem 4: Otogaz LPG (Veresiye)
        t4 = await client.post("/api/transactions", headers=cashier_headers, json={
            "shift_id": shift_id,
            "type": "fuel",
            "payment_method": "veresiye",
            "amount": "980.00",
            "liters": "40.000",
            "fuel_type": "Otogaz (LPG)",
            "description": "Çiftçi Kooperatifi cari hesabı"
        })
        assert t4.status_code == 201, f"Tx4 failed: {t4.text}"

        print("✅ 7. Dört farklı satış kaydı (Nakit, POS, Veresiye, Akaryakıt, Market) başarıyla işlendi.")

        # 8. Dashboard Canlı Verilerini Kontrol Etme
        dash_res = await client.get("/api/dashboard", headers=admin_headers)
        assert dash_res.status_code == 200, f"Dashboard failed: {dash_res.text}"
        dash = dash_res.json()

        print("\n" + "-" * 50)
        print("📊 CANLI DASHBOARD API VERİ RAPORU")
        print("-" * 50)
        print(f"Toplam Günlük Ciro        : {dash['today_total_sales']} ₺")
        print(f"Toplam Satılan Yakıt Hacmi: {dash['today_total_liters']} Litre")
        print(f"Toplam İşlem Sayısı       : {dash['today_transaction_count']} Adet")
        print(f"  • Nakit Tahsilat        : {dash['today_cash']} ₺")
        print(f"  • Kredi Kartı (POS)     : {dash['today_credit_card']} ₺")
        print(f"  • Veresiye Kaydı        : {dash['today_veresiye']} ₺")
        print(f"Aktif Vardiya Sayısı      : {dash['active_shift_count']}")
        print(f"Kayıtlı İstasyon Sayısı   : {dash['total_stations']}")
        print(f"Aktif Kullanıcı Sayısı    : {dash['total_users']}")
        print("-" * 50)

        assert float(dash['today_total_sales']) >= 4600.0, "Total sales mismatch"
        assert float(dash['today_total_liters']) >= 120.0, "Total liters mismatch"
        assert dash['active_shift_count'] >= 1, "Active shift count mismatch"

        print("\n🎉 TÜM TESTLER VE İŞ MANTIKLARI %100 BAŞARIYLA TAMAMLANDI!\n")

if __name__ == "__main__":
    asyncio.run(run_full_flow_test())
