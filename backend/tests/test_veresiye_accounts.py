"""
Entegrasyon testi: Veresiye Kurumsal Şirketler, Bireysel Müşteriler, Doğrulama ve Belge Yükleme.

Çalıştırma (backend dizininden):
    ./venv/Scripts/python.exe tests/test_veresiye_accounts.py
"""

import asyncio
import json
import sys
import time
import uuid
from datetime import datetime, timezone
from decimal import Decimal
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from httpx import ASGITransport, AsyncClient

from app.database import async_session_factory, engine
from app.main import app
from app.models.base import CreditAccountType, PaymentMethod, ShiftStatus, TransactionType
from app.models.credit import CreditSale
from app.models.shift import Shift
from app.models.transaction import Transaction
from app.services import credit_commitment, credit_documents


PNG_BYTES = b"\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR" + b"\x42" * 32
PDF_BYTES = b"%PDF-1.4\n%FuelOS signed receipt\n%%EOF\n"
RAW_TC_1 = "10000000146"
RAW_TC_2 = "11111111110"
RAW_TC_CUST = "34567890170"


async def run_tests() -> None:
    suffix = str(int(time.time() * 1000))[-8:]
    transport = ASGITransport(app=app)

    async with AsyncClient(transport=transport, base_url="http://test") as client:
        # 1. SuperAdmin girişi
        r_admin = await client.post(
            "/api/auth/login",
            json={"email": "admin@fuelos.com", "password": "FuelOS2026!"},
        )
        assert r_admin.status_code == 200, f"Admin login failed: {r_admin.text}"
        admin_h = {"Authorization": f"Bearer {r_admin.json()['access_token']}"}

        # 2. İki ayrı istasyon oluştur (A ve B — kiracı/istasyon izolasyonu için)
        r_sa = await client.post(
            "/api/stations",
            headers=admin_h,
            json={"name": f"Veresiye İstasyon A {suffix}", "code": f"VRA-{suffix}", "city": "Ankara"},
        )
        assert r_sa.status_code == 201, r_sa.text
        station_a = r_sa.json()["id"]

        r_sb = await client.post(
            "/api/stations",
            headers=admin_h,
            json={"name": f"Veresiye İstasyon B {suffix}", "code": f"VRB-{suffix}", "city": "İzmir"},
        )
        assert r_sb.status_code == 201, r_sb.text
        station_b = r_sb.json()["id"]

        # 3. İstasyon A için müdür + kasiyer, İstasyon B için müdür oluştur
        mgr_a_email = f"mgra_{suffix}@test.fuelos"
        cas_a_email = f"casa_{suffix}@test.fuelos"
        mgr_b_email = f"mgrb_{suffix}@test.fuelos"

        user_ids: dict[str, str] = {}
        for email, name, role, sid in [
            (mgr_a_email, "Müdür A", "station_manager", station_a),
            (cas_a_email, "Kasiyer A", "cashier", station_a),
            (mgr_b_email, "Müdür B", "station_manager", station_b),
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

        async def login_headers(email: str) -> tuple[dict[str, str], str]:
            rl = await client.post("/api/auth/login", json={"email": email, "password": "Pass1234!"})
            assert rl.status_code == 200, rl.text
            data = rl.json()
            return {"Authorization": f"Bearer {data['access_token']}"}, user_ids[email]

        mgr_a_h, _ = await login_headers(mgr_a_email)
        cas_a_h, cas_a_id = await login_headers(cas_a_email)
        mgr_b_h, _ = await login_headers(mgr_b_email)

        # 4. Kasiyer şirket oluşturamaz (403)
        r_forbid = await client.post(
            "/api/veresiye/companies",
            headers=cas_a_h,
            json={"name": "Yetkisiz Şirket"},
        )
        assert r_forbid.status_code == 403

        # 5. Müdür A şirket + araç + sürücü oluşturur
        r_comp = await client.post(
            "/api/veresiye/companies",
            headers=mgr_a_h,
            json={
                "name": f"Anadolu Lojistik {suffix}",
                "tax_number": f"900{suffix}",
                "credit_limit": "50000.00",
                "payment_term_days": 30,
                "vehicles": [{"plate": "06 abc 123", "description": "Çekici"}],
                "drivers": [{"full_name": "Ahmet Sürücü", "tc_no": RAW_TC_1, "phone": "05551112233"}],
            },
        )
        assert r_comp.status_code == 201, r_comp.text
        comp = r_comp.json()
        comp_id = comp["id"]
        vehicle_id = comp["vehicles"][0]["id"]
        driver_id = comp["drivers"][0]["id"]

        # Yanıtta ham T.C. asla görünmemeli
        comp_dump = json.dumps(comp)
        assert RAW_TC_1 not in comp_dump, "Ham T.C. yanıta sızdı!"
        assert comp["drivers"][0]["tc_masked"] == "100******46"
        assert comp["vehicles"][0]["plate"] == "06ABC123"

        # Geçersiz T.C. -> 422
        r_bad_tc = await client.post(
            f"/api/veresiye/companies/{comp_id}/drivers",
            headers=mgr_a_h,
            json={"full_name": "Hatalı Sürücü", "tc_no": "10000000147"},
        )
        assert r_bad_tc.status_code == 422

        # Aynı plaka aynı istasyondaki başka şirkette -> 409
        r_dup_plate = await client.post(
            "/api/veresiye/companies",
            headers=mgr_a_h,
            json={
                "name": f"Rakip Nakliyat {suffix}",
                "tax_number": f"901{suffix}",
                "vehicles": [{"plate": "06ABC123"}],
            },
        )
        assert r_dup_plate.status_code == 409, r_dup_plate.text
        assert "06ABC123" in r_dup_plate.text

        # Kasiyer şirketleri listeler -> bakiye null dönmeli, müdürde dolu olmalı
        r_cas_list = await client.get("/api/veresiye/companies?search=06 abc", headers=cas_a_h)
        assert r_cas_list.status_code == 200
        assert len(r_cas_list.json()) == 1
        assert r_cas_list.json()[0]["balance"] is None

        r_mgr_list = await client.get("/api/veresiye/companies", headers=mgr_a_h)
        assert r_mgr_list.status_code == 200
        assert r_mgr_list.json()[0]["balance"] is not None

        # 6. Kurumsal doğrulama senaryoları
        # Sadece plaka -> sürücü seçimi gerekli + aktif sürücü listesi döner
        r_v1 = await client.post("/api/veresiye/verify", headers=cas_a_h, json={"plate": "06 abc 123"})
        assert r_v1.status_code == 200
        v1 = r_v1.json()
        assert v1["authorized"] is False
        assert "driver_required" in v1["reasons"]
        assert len(v1["drivers"]) == 1

        # Yanlış T.C. -> driver_tc_mismatch (veya driver_not_found/mismatch)
        r_v_bad = await client.post(
            "/api/veresiye/verify",
            headers=cas_a_h,
            json={"plate": "06ABC123", "driver_id": driver_id, "driver_tc": RAW_TC_2},
        )
        assert r_v_bad.status_code == 200
        assert r_v_bad.json()["authorized"] is False
        assert "driver_tc_mismatch" in r_v_bad.json()["reasons"]

        # Doğru plaka + doğru T.C. -> authorized & identity_verified
        r_v_ok = await client.post(
            "/api/veresiye/verify",
            headers=cas_a_h,
            json={"plate": "06ABC123", "driver_id": driver_id, "driver_tc": RAW_TC_1},
        )
        assert r_v_ok.status_code == 200
        assert r_v_ok.json()["authorized"] is True
        assert r_v_ok.json()["identity_verified"] is True

        # Bilinmeyen plaka -> plate_not_registered
        r_v_unk = await client.post("/api/veresiye/verify", headers=cas_a_h, json={"plate": "99XYZ999"})
        assert r_v_unk.status_code == 200
        assert "plate_not_registered" in r_v_unk.json()["reasons"]

        # Kiracı/İstasyon izolasyonu: İstasyon B müdürü İstasyon A şirketini göremez -> 404 & plaka bulunamaz
        r_iso_comp = await client.get(f"/api/veresiye/companies/{comp_id}", headers=mgr_b_h)
        assert r_iso_comp.status_code == 404
        r_iso_verify = await client.post("/api/veresiye/verify", headers=mgr_b_h, json={"plate": "06ABC123"})
        assert "plate_not_registered" in r_iso_verify.json()["reasons"]

        # Yetki sonlandırma -> company_not_authorized, yeniden açma
        r_end = await client.post(
            f"/api/veresiye/companies/{comp_id}/authorization",
            headers=mgr_a_h,
            json={"authorized": False, "reason": "Ödeme gecikmesi"},
        )
        assert r_end.status_code == 200
        assert r_end.json()["is_authorized"] is False

        r_v_noauth = await client.post(
            "/api/veresiye/verify",
            headers=cas_a_h,
            json={"plate": "06ABC123", "driver_tc": RAW_TC_1},
        )
        assert "company_not_authorized" in r_v_noauth.json()["reasons"]

        await client.post(
            f"/api/veresiye/companies/{comp_id}/authorization",
            headers=mgr_a_h,
            json={"authorized": True},
        )

        # Araç pasifleştirme -> vehicle_inactive, sonra tekrar aktifleştirme
        await client.patch(
            f"/api/veresiye/vehicles/{vehicle_id}",
            headers=mgr_a_h,
            json={"is_active": False},
        )
        r_v_inact = await client.post(
            "/api/veresiye/verify",
            headers=cas_a_h,
            json={"plate": "06ABC123", "driver_tc": RAW_TC_1},
        )
        assert "vehicle_inactive" in r_v_inact.json()["reasons"]

        r_v_react = await client.post(
            f"/api/veresiye/companies/{comp_id}/vehicles",
            headers=mgr_a_h,
            json={"plate": "06ABC123", "description": "Yeniden Aktif"},
        )
        assert r_v_react.status_code == 201
        assert r_v_react.json()["id"] == vehicle_id
        assert r_v_react.json()["is_active"] is True

        # Sürücü pasifleştirme -> driver_inactive, sonra yeniden aktifleştirme
        await client.patch(
            f"/api/veresiye/drivers/{driver_id}",
            headers=mgr_a_h,
            json={"is_active": False},
        )
        r_d_inact = await client.post(
            "/api/veresiye/verify",
            headers=cas_a_h,
            json={"plate": "06ABC123", "driver_id": driver_id, "driver_tc": RAW_TC_1},
        )
        assert "driver_inactive" in r_d_inact.json()["reasons"]

        # 7. Bireysel müşteri + kimlik fotoğrafı + şifreleme
        # Kasiyer credit_limit belirleyemez -> 403
        r_cas_lim = await client.post(
            "/api/veresiye/customers",
            headers=cas_a_h,
            json={"full_name": "Limitli Müşteri", "tc_no": RAW_TC_CUST, "phone": "05321112233", "credit_limit": "1000.00"},
        )
        assert r_cas_lim.status_code == 403

        r_cust = await client.post(
            "/api/veresiye/customers",
            headers=cas_a_h,
            json={"full_name": "Ayşe Müşteri", "tc_no": RAW_TC_CUST, "phone": "05321112233", "plate": "06 bir 01"},
        )
        assert r_cust.status_code == 201, r_cust.text
        cust = r_cust.json()
        cust_id = cust["id"]
        assert RAW_TC_CUST not in json.dumps(cust)
        assert cust["balance"] is None  # Kasiyer oluşturdu -> bakiye gizli

        # Aynı T.C. ile tekrar kayıt -> 409
        r_cust_dup = await client.post(
            "/api/veresiye/customers",
            headers=mgr_a_h,
            json={"full_name": "Tekrar", "tc_no": RAW_TC_CUST, "phone": "05321112234"},
        )
        assert r_cust_dup.status_code == 409

        # Kör indeks lookup
        r_lookup = await client.post(
            "/api/veresiye/customers/lookup",
            headers=cas_a_h,
            json={"tc_no": RAW_TC_CUST},
        )
        assert r_lookup.status_code == 200
        assert r_lookup.json()["id"] == cust_id

        r_lookup_none = await client.post(
            "/api/veresiye/customers/lookup",
            headers=cas_a_h,
            json={"tc_no": RAW_TC_2},
        )
        assert r_lookup_none.status_code == 200 and r_lookup_none.json() is None

        # Kimlik fotoğrafı: geçersiz içerik (HTML) -> 415; geçerli PNG -> 200
        r_bad_doc = await client.post(
            f"/api/veresiye/customers/{cust_id}/id-photo",
            headers=cas_a_h,
            files={"file": ("sahte.png", b"<html>bad</html>", "image/png")},
        )
        assert r_bad_doc.status_code == 415

        r_id_up = await client.post(
            f"/api/veresiye/customers/{cust_id}/id-photo",
            headers=cas_a_h,
            files={"file": ("kimlik.png", PNG_BYTES, "image/png")},
        )
        assert r_id_up.status_code == 200, r_id_up.text
        id_doc_id = r_id_up.json()["id_photo_document_id"]
        assert id_doc_id is not None

        # Kasiyer kimlik fotoğrafını indiremez (403) ve değiştiremez (403)
        r_cas_dl_id = await client.get(f"/api/veresiye/documents/{id_doc_id}", headers=cas_a_h)
        assert r_cas_dl_id.status_code == 403
        r_cas_rep_id = await client.post(
            f"/api/veresiye/customers/{cust_id}/id-photo",
            headers=cas_a_h,
            files={"file": ("yeni.png", PNG_BYTES, "image/png")},
        )
        assert r_cas_rep_id.status_code == 403

        # Müdür kimlik fotoğrafını indirir -> baytlar birebir eşleşir ve diskteki dosya şifrelidir
        r_mgr_dl_id = await client.get(f"/api/veresiye/documents/{id_doc_id}", headers=mgr_a_h)
        assert r_mgr_dl_id.status_code == 200
        assert r_mgr_dl_id.content == PNG_BYTES
        assert r_mgr_dl_id.headers["cache-control"] == "no-store"

        # 8. İmzalı satış fişi testi için DB fixture üzerinden CreditSale oluştur
        now = datetime.now(timezone.utc)
        async with async_session_factory() as session:
            shift = Shift(
                id=uuid.uuid4(),
                station_id=uuid.UUID(station_a),
                user_id=uuid.UUID(cas_a_id),
                start_time=now,
                status=ShiftStatus.OPEN,
                opening_cash=Decimal("0.00"),
            )
            tx = Transaction(
                id=uuid.uuid4(),
                shift_id=shift.id,
                station_id=uuid.UUID(station_a),
                type=TransactionType.FUEL,
                payment_method=PaymentMethod.VERESIYE,
                amount=Decimal("500.00"),
                liters=Decimal("10.000"),
                fuel_type="Motorin",
                transaction_time=now,
            )
            sale_id = uuid.uuid4()
            nonce = credit_commitment.new_nonce()
            leaf = credit_commitment.SaleLeaf(
                sale_id=str(sale_id),
                transaction_id=str(tx.id),
                shift_id=str(shift.id),
                station_id=station_a,
                account_type=CreditAccountType.INDIVIDUAL.value,
                account_id=cust_id,
                plate="06BIR01",
                driver_id=None,
                fuel_type="Motorin",
                liters_ml=10000,
                amount_kurus=50000,
                sale_time=credit_commitment.canonical_time(now),
            )
            commitment = credit_commitment.sale_commitment(leaf, nonce)
            credit_sale = CreditSale(
                id=sale_id,
                transaction_id=tx.id,
                station_id=uuid.UUID(station_a),
                shift_id=shift.id,
                account_type=CreditAccountType.INDIVIDUAL,
                credit_customer_id=uuid.UUID(cust_id),
                plate="06BIR01",
                identity_verified=False,
                amount=Decimal("500.00"),
                liters=Decimal("10.000"),
                fuel_type="Motorin",
                sale_time=now,
                commitment=commitment,
                commitment_nonce=nonce,
                created_by=uuid.UUID(cas_a_id),
            )
            session.add_all([shift, tx, credit_sale])
            await session.commit()

        # Kasiyer kendi satışına PDF fiş yükler -> 200; ikinci denemesi -> 409; müdür değiştirebilir -> 200
        r_rec_1 = await client.post(
            f"/api/veresiye/sales/{sale_id}/receipt",
            headers=cas_a_h,
            files={"file": ("fis.pdf", PDF_BYTES, "application/pdf")},
        )
        assert r_rec_1.status_code == 200, r_rec_1.text
        rec_doc_1 = r_rec_1.json()["receipt_document_id"]
        assert r_rec_1.json()["has_receipt"] is True

        # Kasiyer kendi fişini indirebilir; İstasyon B müdürü indiremez (404)
        r_cas_dl_rec = await client.get(f"/api/veresiye/documents/{rec_doc_1}", headers=cas_a_h)
        assert r_cas_dl_rec.status_code == 200 and r_cas_dl_rec.content == PDF_BYTES
        r_b_dl_rec = await client.get(f"/api/veresiye/documents/{rec_doc_1}", headers=mgr_b_h)
        assert r_b_dl_rec.status_code == 404

        r_rec_dup = await client.post(
            f"/api/veresiye/sales/{sale_id}/receipt",
            headers=cas_a_h,
            files={"file": ("fis2.png", PNG_BYTES, "image/png")},
        )
        assert r_rec_dup.status_code == 409

        r_rec_mgr = await client.post(
            f"/api/veresiye/sales/{sale_id}/receipt",
            headers=mgr_a_h,
            files={"file": ("fis2.png", PNG_BYTES, "image/png")},
        )
        assert r_rec_mgr.status_code == 200
        assert r_rec_mgr.json()["receipt_document_id"] != rec_doc_1

        # Diskteki dosya düz metin değildir (şifrelidir)
        upload_dir = credit_documents.resolve_upload_dir()
        stored_bins = list(upload_dir.glob("*.bin"))
        assert stored_bins, "Yükleme dizininde şifreli dosya bulunamadı"
        assert all(PNG_BYTES not in p.read_bytes() for p in stored_bins)

    await engine.dispose()
    print("[PASS] test_veresiye_accounts (18/18 kontrol senaryosu geçti)")


if __name__ == "__main__":
    asyncio.run(run_tests())
