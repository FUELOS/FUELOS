"""Unit tests for the backend-to-Midnight proof bridge."""

import base64
import hashlib
import os
import unittest
import uuid
from datetime import datetime, timezone
from decimal import Decimal

from app.services.zk_service import (
    classify,
    compute_shift_context_digest,
    proof_integrity_matches,
    generate_reconciliation_proof,
    to_kurus_int,
)


class TestZKReconciliation(unittest.TestCase):
    def test_to_kurus_int(self):
        self.assertEqual(to_kurus_int(Decimal("1000.00")), 100000)
        self.assertEqual(to_kurus_int("75.43"), 7543)
        self.assertEqual(to_kurus_int(None), 0)
        with self.assertRaises(ValueError):
            to_kurus_int("-0.01")

    def test_compact_parity_vectors(self):
        vectors = [
            ((100000, 40000, 30000, 20000, 10000, 100), "matched"),
            ((250000, 25000, 100000, 75000, 25000, 100), "shortage"),
            ((100000, 39900, 30000, 20000, 10000, 100), "matched"),
            ((100000, 39900, 30000, 20000, 9999, 100), "shortage"),
            ((100000, 40000, 40000, 20000, 10000, 100), "surplus"),
        ]
        for arguments, expected in vectors:
            with self.subTest(expected=expected):
                self.assertEqual(classify(*arguments), expected)

    def test_shift_context_digest_is_metadata_only_and_deterministic(self):
        shift_id = uuid.uuid4()
        station_id = uuid.uuid4()
        user_id = uuid.uuid4()
        start = datetime(2026, 10, 3, 8, tzinfo=timezone.utc)
        end = datetime(2026, 10, 3, 16, tzinfo=timezone.utc)
        first = compute_shift_context_digest(shift_id, station_id, user_id, start, end, 100)
        second = compute_shift_context_digest(shift_id, station_id, user_id, start, end, 100)
        changed = compute_shift_context_digest(uuid.uuid4(), station_id, user_id, start, end, 100)
        self.assertEqual(first, second)
        self.assertNotEqual(first, changed)

    def test_proof_hash_checks_bytes_but_does_not_claim_zk_verification(self):
        proof = b"real-proof-placeholder-for-integrity-unit-test"
        encoded = base64.b64encode(proof).decode()
        digest = hashlib.sha256(proof).hexdigest()
        self.assertTrue(proof_integrity_matches(encoded, digest))
        self.assertFalse(proof_integrity_matches(encoded, "0" * 64))
        self.assertFalse(proof_integrity_matches("not base64", digest))


@unittest.skipUnless(os.getenv("FUELOS_RUN_PROOF_TESTS") == "1", "requires local proof server")
class TestRealProofBridge(unittest.IsolatedAsyncioTestCase):
    async def test_vector_a_returns_real_nonempty_proof(self):
        result = await generate_reconciliation_proof(
            total_sales=Decimal("1000.00"),
            pos=Decimal("400.00"),
            cash=Decimal("300.00"),
            eft=Decimal("200.00"),
            credit=Decimal("100.00"),
            tolerance_tl=Decimal("1.00"),
        )
        self.assertEqual(result["status"], "proved")
        self.assertEqual(result["class"], "matched")
        self.assertEqual(result["proof_bytes"], 2940)
        self.assertTrue(result["proof_server_checked"])
        self.assertFalse(result["ledger_verified"])
        self.assertTrue(proof_integrity_matches(result["proof"], result["proof_hash"]))


if __name__ == "__main__":
    unittest.main()
