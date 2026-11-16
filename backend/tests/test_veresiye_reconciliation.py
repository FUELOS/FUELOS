"""
Entegrasyon testi: Günlük mutabakat, vardiya/dashboard veresiye kırılımı ve Merkle kanıtları.

Çalıştırma (backend dizininden):
    ./venv/Scripts/python.exe tests/test_veresiye_reconciliation.py
"""

import asyncio
import sys
import time
import uuid
from datetime import datetime, timezone
from decimal import Decimal
from pathlib import Path
from zoneinfo import ZoneInfo

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from httpx import ASGITransport, AsyncClient

from app.database import async_session_factory, engine
from app.main import app
from app.models.base import (
    CollectionMethod,
    CreditAccountType,
    CreditEntryKind,
    PaymentMethod,
    TransactionType,
)
from app.models.credit import CreditCompany, CreditCustomer, CreditPayment, CreditSale
from app.models.transaction import Transaction
from app.services import credit_commitment, pii

ISTANBUL_TZ = ZoneInfo("Europe/Istanbul")


async def run_tests() -> None:
    suffix = str(int(time.time() * 1000))[-8:]
    transport = ASGITransport(app=app)

    async with AsyncClient(transport=transport, base_url="http://test") as client:
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
                json={"name": f"Recon İst A {suffix}", "code": f"RCA-{suffix}", "city": "Ankara"},
            )
        ).json()
        st_b = (
            await client.post(
                "/api/stations",
                headers=admin_h,
                json={"name": f"Recon İst B {suffix}", "code": f"RCB-{suffix}", "city": "İzmir"},
            )
        ).json()

        user_ids: dict[str, str] = {}
        for email, name, role, sid in [
            (f"rcmgr_a_{suffix}@test.fuelos", "Müdür A", "station_manager", st_a["id"]),
            (f"rccas_a_{suffix}@test.fuelos", "Kasiyer A", "cashier", st_a["id"]),
            (f"rcmgr_b_{suffix}@test.fuelos", "Müdür B", "station_manager", st_b["id"]),
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
            user_ids[email] = ru.json()["id"]

        async def login_h(email: str) -> dict[str, str]:
            r = await client.post("/api/auth/login", json={"email": email, "password": "Pass1234!"})
            assert r.status_code == 200, r.text
            return {"Authorization": f"Bearer {r.json()['access_token']}"}

        mgr_a_h = await login_h(f"rcmgr_a_{suffix}@test.fuelos")
        cas_a_h = await login_h(f"rccas_a_{suffix}@test.fuelos")
        mgr_b_h = await login_h(f"rcmgr_b_{suffix}@test.fuelos")

        sh_a = (
            await client.post(
                "/api/shifts/open",
                headers=cas_a_h,
                json={"station_id": st_a["id"], "opening_cash": "100.00", "worker_name": "Kasiyer A"},
            )
        ).json()
        shift_id = uuid.UUID(sh_a["id"])

        # Bağımsız DB fixture: kurumsal + bireysel cari hesaplar, işlemler, veresiye satışları, tahsilat
        now = datetime.now(timezone.utc)
        today_local = now.astimezone(ISTANBUL_TZ).date().isoformat()
        comp_id = uuid.uuid4()
        cust_id = uuid.uuid4()
        tx_cash_id = uuid.uuid4()
        tx_corp_id = uuid.uuid4()
        tx_ind_id = uuid.uuid4()
        sale_corp_id = uuid.uuid4()
        sale_ind_id = uuid.uuid4()
        nonce_corp = credit_commitment.new_nonce()
        nonce_ind = credit_commitment.new_nonce()

        async with async_session_factory() as session:
            comp = CreditCompany(
                id=comp_id,
                station_id=uuid.UUID(st_a["id"]),
                name=f"Recon Lojistik {suffix}",
                is_authorized=True,
            )
            cust = CreditCustomer(
                id=cust_id,
                station_id=uuid.UUID(st_a["id"]),
                full_name="Hasan Bireysel",
                tc_encrypted=pii.encrypt_tc("10000000146"),
                tc_hash=pii.tc_blind_index("10000000146"),
                phone="05550000099",
                is_active=True,
            )
            tx_cash = Transaction(
                id=tx_cash_id,
                shift_id=shift_id,
                station_id=uuid.UUID(st_a["id"]),
                type=TransactionType.FUEL,
                payment_method=PaymentMethod.CASH,
                amount=Decimal("2000.00"),
                liters=Decimal("40.000"),
                fuel_type="Motorin",
                transaction_time=now,
            )
            tx_corp = Transaction(
                id=tx_corp_id,
                shift_id=shift_id,
                station_id=uuid.UUID(st_a["id"]),
                type=TransactionType.FUEL,
                payment_method=PaymentMethod.VERESIYE,
                amount=Decimal("1200.00"),
                liters=Decimal("24.000"),
                fuel_type="Motorin",
                transaction_time=now,
            )
            tx_ind = Transaction(
                id=tx_ind_id,
                shift_id=shift_id,
                station_id=uuid.UUID(st_a["id"]),
                type=TransactionType.FUEL,
                payment_method=PaymentMethod.VERESIYE,
                amount=Decimal("300.00"),
                liters=Decimal("6.000"),
                fuel_type="Benzin 95",
                transaction_time=now,
            )

            s_corp = CreditSale(
                id=sale_corp_id,
                transaction_id=tx_corp_id,
                station_id=uuid.UUID(st_a["id"]),
                shift_id=shift_id,
                account_type=CreditAccountType.CORPORATE,
                credit_company_id=comp_id,
                plate="06REC01",
                identity_verified=True,
                amount=Decimal("1200.00"),
                liters=Decimal("24.000"),
                fuel_type="Motorin",
                sale_time=now,
                commitment="",
                commitment_nonce=nonce_corp,
                created_by=uuid.UUID(user_ids[f"rccas_a_{suffix}@test.fuelos"]),
            )
            s_corp.commitment = credit_commitment.sale_commitment(
                credit_commitment.leaf_from_record(s_corp), nonce_corp
            )

            s_ind = CreditSale(
                id=sale_ind_id,
                transaction_id=tx_ind_id,
                station_id=uuid.UUID(st_a["id"]),
                shift_id=shift_id,
                account_type=CreditAccountType.INDIVIDUAL,
                credit_customer_id=cust_id,
                identity_verified=False,
                amount=Decimal("300.00"),
                liters=Decimal("6.000"),
                fuel_type="Benzin 95",
                sale_time=now,
                commitment="",
                commitment_nonce=nonce_ind,
                created_by=uuid.UUID(user_ids[f"rccas_a_{suffix}@test.fuelos"]),
            )
            s_ind.commitment = credit_commitment.sale_commitment(
                credit_commitment.leaf_from_record(s_ind), nonce_ind
            )

            pay = CreditPayment(
                id=uuid.uuid4(),
                station_id=uuid.UUID(st_a["id"]),
                account_type=CreditAccountType.CORPORATE,
                credit_company_id=comp_id,
                kind=CreditEntryKind.PAYMENT,
                amount=Decimal("450.00"),
                method=CollectionMethod.EFT,
                payment_date=now,
            )
            session.add_all([comp, cust, tx_cash, tx_corp, tx_ind, s_corp, s_ind, pay])
            await session.commit()

        # 1. Kasiyer mutabakata erişemez -> 403
        r_cas = await client.get(f"/api/veresiye/reconciliation/daily?date={today_local}", headers=cas_a_h)
        assert r_cas.status_code == 403

        # 2. Müdür A günlük mutabakat (henüz eşleşmemiş yok, fiş eksikliği warning var -> attention)
        r_day = await client.get(f"/api/veresiye/reconciliation/daily?date={today_local}", headers=mgr_a_h)
        assert r_day.status_code == 200, r_day.text
        day = r_day.json()
        assert day["status"] == "attention"
        assert Decimal(day["total_sales"]) == Decimal("3500.00")
        assert Decimal(day["automation_veresiye_total"]) == Decimal("1500.00")
        assert Decimal(day["corporate_veresiye_total"]) == Decimal("1200.00")
        assert Decimal(day["individual_veresiye_total"]) == Decimal("300.00")
        assert Decimal(day["unlinked_veresiye_total"]) == Decimal("0.00")
        assert Decimal(day["collections_total"]) == Decimal("450.00")
        assert day["missing_receipt_count"] == 2
        assert [c["channel"] for c in day["channels"]] == [
            "cash",
            "credit_card",
            "eft",
            "corporate_veresiye",
            "individual_veresiye",
            "unlinked_veresiye",
        ]

        # 3. Kiracı izolasyonu: Müdür B İstasyon A vardiyası kanıtına ve mutabakatına erişemez
        r_b_proof = await client.get(f"/api/veresiye/proofs/shifts/{shift_id}", headers=mgr_b_h)
        assert r_b_proof.status_code == 404
        r_b_day = await client.get(
            f"/api/veresiye/reconciliation/daily?date={today_local}&station_id={st_a['id']}",
            headers=mgr_b_h,
        )
        assert r_b_day.status_code == 200 and Decimal(r_b_day.json()["total_sales"]) == Decimal("0.00")

        # 4. SuperAdmin şirket genelinde istasyonsuz sorgulayabilir -> "Tüm İstasyonlar"
        r_admin_all = await client.get(f"/api/veresiye/reconciliation/daily?date={today_local}", headers=admin_h)
        assert r_admin_all.status_code == 200
        assert r_admin_all.json()["station_name"] == "Tüm İstasyonlar"
        assert Decimal(r_admin_all.json()["corporate_veresiye_total"]) >= Decimal("1200.00")

        # 5. Shift + Dashboard additive kırılım kontrolü (total_sales değişmemiş, 1:1 join)
        r_shift = await client.get(f"/api/shifts/{shift_id}", headers=mgr_a_h)
        assert r_shift.status_code == 200, r_shift.text
        sh_data = r_shift.json()
        assert Decimal(sh_data["total_sales"]) == Decimal("3500.00")
        cb = sh_data["credit_breakdown"]
        assert Decimal(cb["corporate"]) == Decimal("1200.00")
        assert Decimal(cb["individual"]) == Decimal("300.00")
        assert Decimal(cb["unlinked"]) == Decimal("0.00")
        assert cb["sale_count"] == 2
        assert cb["missing_receipt_count"] == 2

        r_dash = await client.get(f"/api/dashboard?station_id={st_a['id']}", headers=mgr_a_h)
        assert r_dash.status_code == 200, r_dash.text
        d_data = r_dash.json()
        assert (
            Decimal(d_data["total_corporate_veresiye_sales"])
            + Decimal(d_data["total_individual_veresiye_sales"])
            + Decimal(d_data["total_unlinked_veresiye_sales"])
        ) == Decimal(d_data["total_veresiye_sales"])
        assert d_data["veresiye_missing_receipt_count"] == 2

        # 6. Merkle kanıtları & seçici açıklama (disclose=false vs disclose=true)
        r_sp = await client.get(f"/api/veresiye/proofs/shifts/{shift_id}", headers=mgr_a_h)
        assert r_sp.status_code == 200, r_sp.text
        sp = r_sp.json()
        expected_ledger = credit_commitment.build_shift_ledger(
            str(shift_id),
            [(str(sale_corp_id), s_corp.commitment), (str(sale_ind_id), s_ind.commitment)],
        )
        assert sp["leaf_count"] == 2
        assert sp["merkle_root"] == expected_ledger.merkle_root
        assert sp["statement_digest"] == expected_ledger.statement_digest
        assert sp["ledger_matches_recorded_credit"] is True

        r_inc_hidden = await client.get(f"/api/veresiye/proofs/sales/{sale_corp_id}", headers=mgr_a_h)
        assert r_inc_hidden.status_code == 200, r_inc_hidden.text
        inc_h = r_inc_hidden.json()
        assert inc_h["disclosure"] is None
        assert nonce_corp not in r_inc_hidden.text
        assert credit_commitment.verify_merkle_inclusion(
            inc_h["commitment"],
            inc_h["leaf_index"],
            inc_h["leaf_count"],
            inc_h["merkle_path"],
            inc_h["merkle_root"],
        )

        r_inc_open = await client.get(f"/api/veresiye/proofs/sales/{sale_corp_id}?disclose=true", headers=mgr_a_h)
        assert r_inc_open.status_code == 200, r_inc_open.text
        disc = r_inc_open.json()["disclosure"]
        assert disc is not None
        assert disc["nonce"] == nonce_corp
        re_leaf = credit_commitment.SaleLeaf(
            sale_id=disc["sale_id"],
            transaction_id=disc["transaction_id"],
            shift_id=disc["shift_id"],
            station_id=disc["station_id"],
            account_type=disc["account_type"],
            account_id=disc["account_id"],
            plate=disc["plate"],
            driver_id=disc["driver_id"],
            fuel_type=disc["fuel_type"],
            liters_ml=disc["liters_ml"],
            amount_kurus=disc["amount_kurus"],
            sale_time=disc["sale_time"],
        )
        assert credit_commitment.verify_sale_commitment(re_leaf, disc["nonce"], inc_h["commitment"])

        # 7. Eşleşmemiş veresiye işlem ekle -> mutabakat status == "mismatch", proof matches False
        async with async_session_factory() as session:
            session.add(
                Transaction(
                    id=uuid.uuid4(),
                    shift_id=shift_id,
                    station_id=uuid.UUID(st_a["id"]),
                    type=TransactionType.FUEL,
                    payment_method=PaymentMethod.VERESIYE,
                    amount=Decimal("250.00"),
                    liters=Decimal("5.000"),
                    fuel_type="Motorin",
                    transaction_time=now,
                )
            )
            await session.commit()

        r_day_bad = await client.get(f"/api/veresiye/reconciliation/daily?date={today_local}", headers=mgr_a_h)
        assert r_day_bad.json()["status"] == "mismatch"
        assert Decimal(r_day_bad.json()["veresiye_difference"]) == Decimal("250.00")

        r_sp_bad = await client.get(f"/api/veresiye/proofs/shifts/{shift_id}", headers=mgr_a_h)
        assert r_sp_bad.json()["ledger_matches_recorded_credit"] is False

    await engine.dispose()
    print("[PASS] test_veresiye_reconciliation (mutabakat, kırılım ve Merkle kanıtları geçti)")


if __name__ == "__main__":
    asyncio.run(run_tests())
