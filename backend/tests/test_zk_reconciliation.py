"""Unit tests for the backend-to-Midnight proof bridge."""

import asyncio
import base64
import hashlib
import os
import unittest
import uuid
from datetime import datetime, timezone
from decimal import Decimal
from types import SimpleNamespace
from unittest.mock import AsyncMock

from fastapi import HTTPException

from app.api.shifts import verify_zk_proof
from app.models.base import UserRole

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
        for invalid in ("1.005", "NaN", "Infinity", "1e100", "not-a-number"):
            with self.subTest(invalid=invalid), self.assertRaises(ValueError):
                to_kurus_int(invalid)

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

    def test_shift_context_digest_is_deterministic(self):
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
        self.assertRegex(first, r"^fuelos:shift:v1:[0-9a-f]{64}$")

    def test_rejects_invalid_public_context_before_starting_prover(self):
        with self.assertRaises(ValueError):
            asyncio.run(generate_reconciliation_proof(
                total_sales=Decimal("0"), pos=Decimal("0"), cash=Decimal("0"),
                eft=Decimal("0"), credit=Decimal("0"),
                tolerance_tl=Decimal("1.00"), context_digest="not-a-context",
            ))

    def test_proof_hash_checks_bytes_but_does_not_claim_zk_verification(self):
        proof = b"real-proof-placeholder-for-integrity-unit-test"
        encoded = base64.b64encode(proof).decode()
        digest = hashlib.sha256(proof).hexdigest()
        self.assertTrue(proof_integrity_matches(encoded, digest))
        self.assertFalse(proof_integrity_matches(encoded, "0" * 64))
        self.assertFalse(proof_integrity_matches("not base64", digest))

    def test_old_statement_cannot_be_reported_as_context_bound(self):
        proof = b"old-proof-for-version-gate-test"
        shift = SimpleNamespace(
            id=uuid.uuid4(), zk_proof_status="proved",
            zk_proof=base64.b64encode(proof).decode(),
            zk_proof_hash=hashlib.sha256(proof).hexdigest(),
            zk_commitment="fuelos:shift:v1:" + "ab" * 32,
            zk_tolerance=Decimal("1.00"),
            zk_proved_at=datetime.now(timezone.utc),
            zk_statement_version=None,
        )
        user = SimpleNamespace(role=UserRole.CASHIER, id=uuid.uuid4())
        db = SimpleNamespace(scalar=AsyncMock(return_value=shift))
        with self.assertRaises(HTTPException) as raised:
            asyncio.run(verify_zk_proof(shift.id, user, db))
        self.assertEqual(raised.exception.status_code, 409)

    def test_changed_shift_metadata_rejects_stored_context(self):
        proof = b"proof-for-context-check-test"
        shift = SimpleNamespace(
            id=uuid.uuid4(), station_id=uuid.uuid4(), user_id=uuid.uuid4(),
            start_time=datetime(2026, 10, 3, 8, tzinfo=timezone.utc),
            end_time=datetime(2026, 10, 3, 16, tzinfo=timezone.utc),
            zk_proof_status="proved", zk_proof=base64.b64encode(proof).decode(),
            zk_proof_hash=hashlib.sha256(proof).hexdigest(),
            zk_commitment="fuelos:shift:v1:" + "ab" * 32,
            zk_tolerance=Decimal("1.00"),
            zk_proved_at=datetime.now(timezone.utc),
            zk_statement_version="reconcile-v4-financial-commitment",
            zk_source_snapshot_hash="0" * 64,
            zk_financial_commitment="1" * 64,
        )
        user = SimpleNamespace(role=UserRole.CASHIER, id=uuid.uuid4())
        db = SimpleNamespace(scalar=AsyncMock(return_value=shift))
        with self.assertRaises(HTTPException) as raised:
            asyncio.run(verify_zk_proof(shift.id, user, db))
        self.assertEqual(raised.exception.status_code, 409)


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
            context_digest="fuelos:shift:v1:" + "ab" * 32,
        )
        self.assertEqual(result["status"], "proved")
        self.assertEqual(result["class"], "matched")
        self.assertEqual(result["context_digest"], "fuelos:shift:v1:" + "ab" * 32)
        self.assertRegex(result["financial_commitment"], r"^[0-9a-f]{64}$")
        self.assertRegex(result["financial_nonce"], r"^[0-9a-f]{64}$")
        self.assertGreater(result["proof_bytes"], 0)
        self.assertTrue(result["proof_server_checked"])
        self.assertFalse(result["ledger_verified"])
        self.assertTrue(proof_integrity_matches(result["proof"], result["proof_hash"]))


if __name__ == "__main__":
    unittest.main()
