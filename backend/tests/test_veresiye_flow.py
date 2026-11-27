"""
Entegrasyon testi: Veresiye satış akışı, atomik işlem bütünlüğü, geçmiş işlem eşleştirme,
tahsilat/iptal ve ekstre hesapları.

Çalıştırma (backend dizininden):
    ./venv/Scripts/python.exe tests/test_veresiye_flow.py
"""

import asyncio
import sys
import time
import uuid
from datetime import datetime, timedelta, timezone
from decimal import Decimal
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from httpx import ASGITransport, AsyncClient
from sqlalchemy import func, select

from app.database import async_session_factory, engine
from app.main import app
from app.models.base import CreditAccountType, PaymentMethod, ShiftStatus, TransactionType
from app.models.credit import (
    CreditCompany,
    CreditCustomer,
    CreditDriver,
    CreditSale,
    CreditVehicle,
)
from app.models.transaction import Transaction
from app.services import credit_commitment, pii

TC_DRIVER = "10000000146"
TC_WRONG = "11111111110"
TC_CUST = "34567890170"


async def run_tests() -> None:
    suffix = str(int(time.time() * 1000))[-8:]
    transport = ASGITransport(app=app)

    async with AsyncClient(transport=transport, base_url="http://test") as client:
        # 1. Admin girişi, iki istasyon, pompa, müdürler ve 2 kasiyer
        r_admin = await client.post(
            "/api/auth/login",
            json={"email": "admin@fuelos.com", "password": "FuelOS2026!"},
        )
        assert r_admin.status_code == 200, r_admin.text
        admin_h = {"Authorization": f"Bearer {r_admin.json()['access_token']}"}

        st_a = (
            await client.post(
                "/api/stations",
                headers=admin_h,
                json={"name": f"Flow İst A {suffix}", "code": f"FLA-{suffix}", "city": "Ankara"},
            )
        ).json()
        st_b = (
            await client.post(
                "/api/stations",
                headers=admin_h,
                json={"name": f"Flow İst B {suffix}", "code": f"FLB-{suffix}", "city": "Bursa"},
            )
        ).json()

        pump_a = (
            await client.post(
                "/api/pumps/",
                headers=admin_h,
                json={
                    "station_id": st_a["id"],
                    "pump_number": 1,
                    "label": "Pompa 1",
                    "fuel_types": "Motorin,Benzin 95",
                },
            )
        ).json()

        user_map: dict[str, str] = {}
        for email, name, role, sid in [
            (f"flmgr_a_{suffix}@test.fuelos", "Müdür A", "station_manager", st_a["id"]),
            (f"flcas_1_{suffix}@test.fuelos", "Kasiyer 1", "cashier", st_a["id"]),
            (f"flcas_2_{suffix}@test.fuelos", "Kasiyer 2", "cashier", st_a["id"]),
            (f"flmgr_b_{suffix}@test.fuelos", "Müdür B", "station_manager", st_b["id"]),
        ]:
            ru = await client.post(
                "/api/users",
                headers=admin_h,
                json={
                    "email": email,
                    "password": "Pass1234!",
                    "full_name": name,
                    "role": role,
                    "station_id": sid,
                },
            )
            assert ru.status_code == 201, ru.text
            user_map[email] = ru.json()["id"]

        async def login_h(email: str) -> dict[str, str]:
            r = await client.post("/api/auth/login", json={"email": email, "password": "Pass1234!"})
            assert r.status_code == 200, r.text
            return {"Authorization": f"Bearer {r.json()['access_token']}"}

        mgr_a_h = await login_h(f"flmgr_a_{suffix}@test.fuelos")
        cas_1_h = await login_h(f"flcas_1_{suffix}@test.fuelos")
        cas_2_h = await login_h(f"flcas_2_{suffix}@test.fuelos")
        mgr_b_h = await login_h(f"flmgr_b_{suffix}@test.fuelos")

        # Açık vardiyalar
        sh1 = (
            await client.post(
                "/api/shifts/open",
                headers=cas_1_h,
                json={"station_id": st_a["id"], "opening_cash": "0.00"},
            )
        ).json()
        sh2 = (
            await client.post(
                "/api/shifts/open",
                headers=cas_2_h,
                json={"station_id": st_a["id"], "opening_cash": "0.00"},
            )
        ).json()

        # Bağımsız DB fixture'ları ile şirket ve müşteriler oluştur
        comp_id = uuid.uuid4()
        comp_unauth_id = uuid.uuid4()
        veh_active_id = uuid.uuid4()
        veh_inactive_id = uuid.uuid4()
        driver_id = uuid.uuid4()
        cust_active_id = uuid.uuid4()
        cust_inactive_id = uuid.uuid4()

        async with async_session_factory() as session:
            comp = CreditCompany(
                id=comp_id,
                station_id=uuid.UUID(st_a["id"]),
                name=f"Flow Lojistik {suffix}",
                is_authorized=True,
                credit_limit=Decimal("3000.00"),
                payment_term_days=15,
            )
            comp_unauth = CreditCompany(
                id=comp_unauth_id,
                station_id=uuid.UUID(st_a["id"]),
                name=f"Yetkisiz Şirket {suffix}",
                is_authorized=False,
            )
            veh_active = CreditVehicle(
                id=veh_active_id,
                credit_company_id=comp_id,
                station_id=uuid.UUID(st_a["id"]),
                plate="06FLW01",
                is_active=True,
            )
            veh_inactive = CreditVehicle(
                id=veh_inactive_id,
                credit_company_id=comp_id,
                station_id=uuid.UUID(st_a["id"]),
                plate="06FLW02",
                is_active=False,
            )
            veh_unauth = CreditVehicle(
                id=uuid.uuid4(),
                credit_company_id=comp_unauth_id,
                station_id=uuid.UUID(st_a["id"]),
                plate="06UNAUTH1",
                is_active=True,
            )
            driver = CreditDriver(
                id=driver_id,
                credit_company_id=comp_id,
                full_name="Ali Sürücü",
                tc_encrypted=pii.encrypt_tc(TC_DRIVER),
                tc_hash=pii.tc_blind_index(TC_DRIVER),
                is_active=True,
            )
            driver_unauth_id = uuid.uuid4()
            driver_unauth = CreditDriver(
                id=driver_unauth_id,
                credit_company_id=comp_unauth_id,
                full_name="Yetkisiz Sürücü",
                tc_encrypted=pii.encrypt_tc(TC_DRIVER),
                tc_hash=pii.tc_blind_index(TC_DRIVER),
                is_active=True,
            )
            cust_active = CreditCustomer(
                id=cust_active_id,
                station_id=uuid.UUID(st_a["id"]),
                full_name="Mehmet Bireysel",
                tc_encrypted=pii.encrypt_tc(TC_CUST),
                tc_hash=pii.tc_blind_index(TC_CUST),
                phone="05321000001",
                plate="06BRY01",
                credit_limit=Decimal("2000.00"),
                is_active=True,
            )
            cust_inactive = CreditCustomer(
                id=cust_inactive_id,
                station_id=uuid.UUID(st_a["id"]),
                full_name="Pasif Müşteri",
                tc_encrypted=pii.encrypt_tc(TC_WRONG),
                tc_hash=pii.tc_blind_index(TC_WRONG),
                phone="05321000002",
                is_active=False,
            )
            session.add_all(
                [
                    comp,
                    comp_unauth,
                    veh_active,
                    veh_inactive,
                    veh_unauth,
                    driver,
                    driver_unauth,
                    cust_active,
                    cust_inactive,
                ]
            )
            await session.commit()

        # 2. veresiye için credit zorunlu (422); nakit için credit yasak (422)
        r_no_credit = await client.post(
            "/api/transactions",
            headers=cas_1_h,
            json={
                "shift_id": sh1["id"],
                "type": "fuel",
                "payment_method": "veresiye",
                "amount": "500.00",
                "liters": "10.000",
                "fuel_type": "Motorin",
                "pump_id": pump_a["id"],
            },
        )
        assert r_no_credit.status_code == 422

        r_cash_with_credit = await client.post(
            "/api/transactions",
            headers=cas_1_h,
            json={
                "shift_id": sh1["id"],
                "type": "fuel",
                "payment_method": "cash",
                "amount": "500.00",
                "liters": "10.000",
                "fuel_type": "Motorin",
                "pump_id": pump_a["id"],
                "credit": {"account_type": "individual", "credit_customer_id": str(cust_active_id)},
            },
        )
        assert r_cash_with_credit.status_code == 422

        # 3. Yanlış sürücü T.C. -> 422 ve işlem sayısı değişmemeli (atomik rollback)
        async with async_session_factory() as session:
            before_count = await session.scalar(
                select(func.count(Transaction.id)).where(Transaction.shift_id == uuid.UUID(sh1["id"]))
            )

        r_bad_tc = await client.post(
            "/api/transactions",
            headers=cas_1_h,
            json={
                "shift_id": sh1["id"],
                "type": "fuel",
                "payment_method": "veresiye",
                "amount": "1200.00",
                "liters": "25.000",
                "fuel_type": "Motorin",
                "pump_id": pump_a["id"],
                "credit": {
                    "account_type": "corporate",
                    "credit_company_id": str(comp_id),
                    "plate": "06FLW01",
                    "driver_id": str(driver_id),
                    "driver_tc": TC_WRONG,
                },
            },
        )
        assert r_bad_tc.status_code == 422, r_bad_tc.text
        assert "kimlik" in r_bad_tc.text.lower() or "t.c." in r_bad_tc.text.lower()

        async with async_session_factory() as session:
            after_count = await session.scalar(
                select(func.count(Transaction.id)).where(Transaction.shift_id == uuid.UUID(sh1["id"]))
            )
            assert before_count == after_count, "Başarısız veresiye Transaction persist edilmemeliydi!"

        # 4. Yetkisiz şirket -> 403, pasif araç -> 403, limit aşımı -> 409
        r_unauth = await client.post(
            "/api/transactions",
            headers=cas_1_h,
            json={
                "shift_id": sh1["id"],
                "type": "fuel",
                "payment_method": "veresiye",
                "amount": "500.00",
                "liters": "10.000",
                "fuel_type": "Motorin",
                "pump_id": pump_a["id"],
                "credit": {
                    "account_type": "corporate",
                    "credit_company_id": str(comp_unauth_id),
                    "plate": "06UNAUTH1",
                    "driver_id": str(driver_unauth_id),
                    "driver_tc": TC_DRIVER,
                },
            },
        )
        assert r_unauth.status_code == 403, f"Expected 403, got {r_unauth.status_code}: {r_unauth.text}"

        r_inact_veh = await client.post(
            "/api/transactions",
            headers=cas_1_h,
            json={
                "shift_id": sh1["id"],
                "type": "fuel",
                "payment_method": "veresiye",
                "amount": "500.00",
                "liters": "10.000",
                "fuel_type": "Motorin",
                "pump_id": pump_a["id"],
                "credit": {
                    "account_type": "corporate",
                    "credit_company_id": str(comp_id),
                    "plate": "06FLW02",
                    "driver_id": str(driver_id),
                    "driver_tc": TC_DRIVER,
                },
            },
        )
        assert r_inact_veh.status_code == 403, r_inact_veh.text

        r_over = await client.post(
            "/api/transactions",
            headers=cas_1_h,
            json={
                "shift_id": sh1["id"],
                "type": "fuel",
                "payment_method": "veresiye",
                "amount": "3500.00",
                "liters": "70.000",
                "fuel_type": "Motorin",
                "pump_id": pump_a["id"],
                "credit": {
                    "account_type": "corporate",
                    "credit_company_id": str(comp_id),
                    "plate": "06FLW01",
                    "driver_id": str(driver_id),
                    "driver_tc": TC_DRIVER,
                },
            },
        )
        assert r_over.status_code == 409, r_over.text

        # 5. Kurumsal mutlu yol + taahhüt DB doğrulaması
        r_corp_ok = await client.post(
            "/api/transactions",
            headers=cas_1_h,
            json={
                "shift_id": sh1["id"],
                "type": "fuel",
                "payment_method": "veresiye",
                "amount": "1500.00",
                "liters": "30.000",
                "fuel_type": "Motorin",
                "pump_id": pump_a["id"],
                "credit": {
                    "account_type": "corporate",
                    "credit_company_id": str(comp_id),
                    "plate": "06 flw 01",
                    "driver_id": str(driver_id),
                    "driver_tc": TC_DRIVER,
                },
            },
        )
        assert r_corp_ok.status_code == 201, r_corp_ok.text
        corp_tx = r_corp_ok.json()
        assert corp_tx["credit_sale"] is not None
        assert corp_tx["credit_sale"]["account_name"] == f"Flow Lojistik {suffix}"
        assert corp_tx["credit_sale"]["identity_verified"] is True
        corp_sale_id = corp_tx["credit_sale"]["id"]

        async with async_session_factory() as session:
            reloaded = await session.scalar(
                select(CreditSale).where(CreditSale.id == uuid.UUID(corp_sale_id))
            )
            assert reloaded is not None
            leaf = credit_commitment.leaf_from_record(reloaded)
            assert credit_commitment.verify_sale_commitment(leaf, reloaded.commitment_nonce, reloaded.commitment)

        # 6. Bireysel: pasif müşteri -> 403, TC'siz izinli (identity_verified=False), TC'li (True)
        r_cust_inact = await client.post(
            "/api/transactions",
            headers=cas_2_h,
            json={
                "shift_id": sh2["id"],
                "type": "fuel",
                "payment_method": "veresiye",
                "amount": "200.00",
                "liters": "5.000",
                "fuel_type": "Motorin",
                "pump_id": pump_a["id"],
                "credit": {"account_type": "individual", "credit_customer_id": str(cust_inactive_id)},
            },
        )
        assert r_cust_inact.status_code == 403

        r_ind_no_tc = await client.post(
            "/api/transactions",
            headers=cas_2_h,
            json={
                "shift_id": sh2["id"],
                "type": "fuel",
                "payment_method": "veresiye",
                "amount": "400.00",
                "liters": "10.000",
                "fuel_type": "Benzin 95",
                "pump_id": pump_a["id"],
                "credit": {"account_type": "individual", "credit_customer_id": str(cust_active_id)},
            },
        )
        assert r_ind_no_tc.status_code == 201, r_ind_no_tc.text
        assert r_ind_no_tc.json()["credit_sale"]["identity_verified"] is False
        ind_sale_id = r_ind_no_tc.json()["credit_sale"]["id"]

        # 7. Satış listeleme & kasiyer kendi kayıtlarını görme kısıtı
        r_c1_sales = await client.get("/api/veresiye/sales", headers=cas_1_h)
        assert r_c1_sales.status_code == 200
        c1_ids = {s["id"] for s in r_c1_sales.json()}
        assert corp_sale_id in c1_ids and ind_sale_id not in c1_ids

        r_mgr_sales = await client.get("/api/veresiye/sales?account_type=individual", headers=mgr_a_h)
        assert len(r_mgr_sales.json()) == 1

        # 8. Eşleşmemiş eski Transaction oluştur -> /unlinked-transactions -> /sales/link -> 409 tekrar
        legacy_tx_id = uuid.uuid4()
        async with async_session_factory() as session:
            legacy_tx = Transaction(
                id=legacy_tx_id,
                shift_id=uuid.UUID(sh1["id"]),
                station_id=uuid.UUID(st_a["id"]),
                pump_id=uuid.UUID(pump_a["id"]),
                type=TransactionType.FUEL,
                payment_method=PaymentMethod.VERESIYE,
                amount=Decimal("250.00"),
                liters=Decimal("5.000"),
                fuel_type="Motorin",
                transaction_time=datetime.now(timezone.utc),
            )
            session.add(legacy_tx)
            await session.commit()

        r_unlinked = await client.get("/api/veresiye/unlinked-transactions", headers=mgr_a_h)
        assert r_unlinked.status_code == 200
        assert any(t["id"] == str(legacy_tx_id) for t in r_unlinked.json())

        r_link = await client.post(
            "/api/veresiye/sales/link",
            headers=mgr_a_h,
            json={
                "transaction_id": str(legacy_tx_id),
                "account_type": "corporate",
                "credit_company_id": str(comp_id),
                "plate": "06ESKI99",
            },
        )
        assert r_link.status_code == 201, r_link.text
        assert r_link.json()["plate"] == "06ESKI99"
        assert r_link.json()["identity_verified"] is False

        r_link_dup = await client.post(
            "/api/veresiye/sales/link",
            headers=mgr_a_h,
            json={
                "transaction_id": str(legacy_tx_id),
                "account_type": "individual",
                "credit_customer_id": str(cust_active_id),
            },
        )
        assert r_link_dup.status_code == 409

        # 9. Tahsilat, iptal, bakiye matematiği ve ekstre
        # Kasiyer tahsilat ve ekstrede 403
        r_cas_pay = await client.post(
            "/api/veresiye/payments",
            headers=cas_1_h,
            json={"account_type": "corporate", "credit_company_id": str(comp_id), "amount": "500.00"},
        )
        assert r_cas_pay.status_code == 403
        r_cas_stmt = await client.get(f"/api/veresiye/companies/{comp_id}/statement", headers=cas_1_h)
        assert r_cas_stmt.status_code == 403

        # İstasyon B müdürü A şirketinin ekstresini göremez -> 404
        r_iso_stmt = await client.get(f"/api/veresiye/companies/{comp_id}/statement", headers=mgr_b_h)
        assert r_iso_stmt.status_code == 404

        # Gelecek tarih > 1 gün -> 422
        r_fut = await client.post(
            "/api/veresiye/payments",
            headers=mgr_a_h,
            json={
                "account_type": "corporate",
                "credit_company_id": str(comp_id),
                "amount": "100.00",
                "payment_date": (datetime.now(timezone.utc) + timedelta(days=3)).isoformat(),
            },
        )
        assert r_fut.status_code == 422

        r_excess = await client.post(
            "/api/veresiye/payments",
            headers=mgr_a_h,
            json={"account_type": "corporate", "credit_company_id": str(comp_id), "amount": "1750.01"},
        )
        assert r_excess.status_code == 409, r_excess.text

        p1 = await client.post(
            "/api/veresiye/payments",
            headers=mgr_a_h,
            json={
                "account_type": "corporate",
                "credit_company_id": str(comp_id),
                "amount": "600.00",
                "method": "eft",
                "reference": "EFT-001",
            },
        )
        assert p1.status_code == 201, p1.text
        p1_id = p1.json()["id"]

        p2 = await client.post(
            "/api/veresiye/payments",
            headers=mgr_a_h,
            json={
                "account_type": "corporate",
                "credit_company_id": str(comp_id),
                "amount": "900.00",
                "method": "cash",
            },
        )
        assert p2.status_code == 201
        p2_id = p2.json()["id"]

        # p2'yi iptal et; ikinci iptal 409
        r_void = await client.post(
            f"/api/veresiye/payments/{p2_id}/void",
            headers=mgr_a_h,
            json={"reason": "Yanlış tutar girildi"},
        )
        assert r_void.status_code == 200 and r_void.json()["voided_at"] is not None
        r_void2 = await client.post(
            f"/api/veresiye/payments/{p2_id}/void",
            headers=mgr_a_h,
            json={"reason": "Tekrar"},
        )
        assert r_void2.status_code == 409

        # Şirket toplam satış: 1500 + 250 = 1750; aktif tahsilat: 600 => kalan borç 1150
        r_stmt = await client.get(f"/api/veresiye/companies/{comp_id}/statement", headers=mgr_a_h)
        assert r_stmt.status_code == 200, r_stmt.text
        stmt = r_stmt.json()
        assert Decimal(stmt["period_sales"]) == Decimal("1750.00")
        assert Decimal(stmt["period_payments"]) == Decimal("600.00")
        assert Decimal(stmt["closing_balance"]) == Decimal("1150.00")
        assert len(stmt["vehicle_breakdown"]) == 2
        assert len(stmt["daily_spending"]) >= 1 and len(stmt["monthly_spending"]) == 1

        # Bireysel müşteri ekstresi
        r_cstmt = await client.get(f"/api/veresiye/customers/{cust_active_id}/statement", headers=mgr_a_h)
        assert r_cstmt.status_code == 200
        assert Decimal(r_cstmt.json()["closing_balance"]) == Decimal("400.00")

        # Tahsilat listesi iptal edilenleri varsayılan gizler, include_void=true ile gösterir
        r_plist_def = await client.get(f"/api/veresiye/payments?credit_company_id={comp_id}", headers=mgr_a_h)
        assert [p["id"] for p in r_plist_def.json()] == [p1_id]
        r_plist_all = await client.get(f"/api/veresiye/payments?credit_company_id={comp_id}&include_void=true", headers=mgr_a_h)
        assert len(r_plist_all.json()) == 2

    await engine.dispose()
    print("[PASS] test_veresiye_flow (tüm satış/eşleştirme/tahsilat/ekstre kontrolleri geçti)")


if __name__ == "__main__":
    asyncio.run(run_tests())
