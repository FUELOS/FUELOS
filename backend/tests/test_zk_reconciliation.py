"""
FuelOS — Zero-Knowledge Akıllı Mutabakat ve Bağımsız Doğrulama Testleri.
Compact reconciliation.compact ile tam matematiksel ve semantik uyumu doğrular.
"""

import unittest
from datetime import datetime, timezone
from decimal import Decimal
import uuid

from app.services.zk_service import (
    ZKReconciliationEngine,
    compute_shift_commitment,
    generate_proof_hash,
    to_kurus_int,
)


class TestZKReconciliation(unittest.TestCase):
    def test_to_kurus_int(self):
        self.assertEqual(to_kurus_int(Decimal("1000.00")), 100000)
        self.assertEqual(to_kurus_int(Decimal("0.01")), 1)
        self.assertEqual(to_kurus_int(Decimal("0.00")), 0)
        self.assertEqual(to_kurus_int(None), 0)
        self.assertEqual(to_kurus_int("75.43"), 7543)

    def test_compact_parity_vectors(self):
        # Vektör A: Dengeli (1000 TL Satış, 400 POS + 300 Nakit + 200 EFT + 100 Veresiye = 1000 TL)
        res_a = ZKReconciliationEngine.classify(
            sales_kurus=100000,
            pos_kurus=40000,
            cash_kurus=30000,
            eft_kurus=20000,
            credit_kurus=10000,
            tolerance_kurus=100,
        )
        self.assertEqual(res_a, "matched")

        # Vektör B: Kasa Açığı (2500 TL Satış, Toplam 2250 TL, 250 TL açık)
        res_b = ZKReconciliationEngine.classify(
            sales_kurus=250000,
            pos_kurus=25000,
            cash_kurus=100000,
            eft_kurus=75000,
            credit_kurus=25000,
            tolerance_kurus=100,
        )
        self.assertEqual(res_b, "shortage")

        # Vektör C: Sınır Dahil Tolerans (+1.00 TL fark, 1.00 TL tolerans) -> MATCHED
        res_c = ZKReconciliationEngine.classify(
            sales_kurus=100000,
            pos_kurus=39900,
            cash_kurus=30000,
            eft_kurus=20000,
            credit_kurus=10000,
            tolerance_kurus=100,
        )
        self.assertEqual(res_c, "matched")

        # Vektör D: Sınır Dışı (+1.01 TL fark, 1.00 TL tolerans) -> SHORTAGE
        res_d = ZKReconciliationEngine.classify(
            sales_kurus=100000,
            pos_kurus=39900,
            cash_kurus=30000,
            eft_kurus=20000,
            credit_kurus=9999,
            tolerance_kurus=100,
        )
        self.assertEqual(res_d, "shortage")

        # Vektör E: Kasa Fazlası (1000 TL Satış, 1100 TL Tahsilat) -> SURPLUS
        res_e = ZKReconciliationEngine.classify(
            sales_kurus=100000,
            pos_kurus=40000,
            cash_kurus=40000,
            eft_kurus=20000,
            credit_kurus=10000,
            tolerance_kurus=100,
        )
        self.assertEqual(res_e, "surplus")

    def test_shift_commitment_determinism(self):
        shift_id = uuid.uuid4()
        station_id = uuid.uuid4()
        user_id = uuid.uuid4()
        start_time = datetime(2026, 10, 3, 8, 0, 0, tzinfo=timezone.utc)
        end_time = datetime(2026, 10, 3, 16, 0, 0, tzinfo=timezone.utc)

        c1 = compute_shift_commitment(shift_id, station_id, user_id, start_time, end_time, 100)
        c2 = compute_shift_commitment(shift_id, station_id, user_id, start_time, end_time, 100)
        self.assertEqual(c1, c2)
        self.assertTrue(c1.startswith("fuelos:shift:v1:"))

        # Farklı vardiyada taahhüt değişmeli
        c3 = compute_shift_commitment(uuid.uuid4(), station_id, user_id, start_time, end_time, 100)
        self.assertNotEqual(c1, c3)

    def test_standalone_verification_security(self):
        commitment = "fuelos:shift:v1:abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890"
        proof_hash = generate_proof_hash("matched", 100, commitment)

        # Geçerli bağımsız doğrulama
        self.assertTrue(ZKReconciliationEngine.verify_standalone("matched", 100, commitment, proof_hash))

        # Tahrif edilmiş mutabakat sınıfı reddedilir
        self.assertFalse(ZKReconciliationEngine.verify_standalone("shortage", 100, commitment, proof_hash))
        self.assertFalse(ZKReconciliationEngine.verify_standalone("surplus", 100, commitment, proof_hash))

        # Tahrif edilmiş tolerans reddedilir
        self.assertFalse(ZKReconciliationEngine.verify_standalone("matched", 500, commitment, proof_hash))

        # Replay saldırısı (farklı vardiya taahhüdü) reddedilir
        fake_commitment = "fuelos:shift:v1:9999999999999999999999999999999999999999999999999999999999999999"
        self.assertFalse(ZKReconciliationEngine.verify_standalone("matched", 100, fake_commitment, proof_hash))


if __name__ == "__main__":
    unittest.main()
