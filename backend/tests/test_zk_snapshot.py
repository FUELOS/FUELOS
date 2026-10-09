"""Proof inputs and source-drift digest must share one immutable snapshot."""

import asyncio
import base64
import hashlib
import uuid
from datetime import datetime, timezone
from decimal import Decimal
from types import SimpleNamespace
from unittest.mock import AsyncMock, Mock, patch

import pytest
from fastapi import HTTPException

from app.api.shifts import generate_zk_proof, verify_zk_proof
from app.models.base import PaymentMethod, ShiftStatus, UserRole
from app.services.zk_service import compute_shift_context_digest
from app.services.zk_snapshot import reconciliation_snapshot


def _shift():
    now = datetime(2026, 10, 8, 8, tzinfo=timezone.utc)
    return SimpleNamespace(
        id=uuid.uuid4(), station_id=uuid.uuid4(), user_id=uuid.uuid4(),
        start_time=now, end_time=now, opening_cash=Decimal("50.00"),
        closing_cash=Decimal("350.00"), declared_pos=None,
        declared_eft=None, declared_credit=None,
        zk_tolerance=Decimal("1.00"), zk_proof_status="proved",
        zk_statement_version="reconcile-v3-historical-context",
        zk_proved_at=now, zk_verified=False, zk_verified_at=None,
        zk_reconciliation_class="matched",
    )


def _rows():
    return [
        SimpleNamespace(id=uuid.UUID(int=2), payment_method=PaymentMethod.CASH, amount=Decimal("300.00")),
        SimpleNamespace(id=uuid.UUID(int=1), payment_method=PaymentMethod.CREDIT_CARD, amount=Decimal("400.00")),
    ]


def test_snapshot_is_order_independent_and_derived_inputs_match_rows():
    shift = _shift()
    inputs, digest = reconciliation_snapshot(shift, _rows(), Decimal("1.00"))
    _, reversed_digest = reconciliation_snapshot(shift, reversed(_rows()), Decimal("1.00"))
    assert digest == reversed_digest
    assert inputs == {"total_sales": Decimal("700"), "pos": Decimal("400"),
                      "cash": Decimal("300"), "eft": Decimal("0"), "credit": Decimal("0")}
    changed = _rows()
    changed[0].amount = Decimal("301.00")
    assert reconciliation_snapshot(shift, changed, Decimal("1.00"))[1] != digest
    shift.declared_pos = Decimal("399.00")
    assert reconciliation_snapshot(shift, _rows(), Decimal("1.00"))[1] != digest


def test_snapshot_rejects_sub_kurus_transaction_instead_of_rounding():
    rows = _rows()
    rows[0].amount = Decimal("300.005")
    with pytest.raises(ValueError, match="whole kurus"):
        reconciliation_snapshot(_shift(), rows, Decimal("1.00"))


def test_status_rejects_source_drift_without_claiming_ledger_verification():
    shift = _shift()
    rows = _rows()
    proof = b"integrity-test-bytes"
    shift.zk_proof = base64.b64encode(proof).decode()
    shift.zk_proof_hash = hashlib.sha256(proof).hexdigest()
    shift.zk_commitment = compute_shift_context_digest(
        shift.id, shift.station_id, shift.user_id, shift.start_time, shift.end_time, 100,
    )
    shift.zk_source_snapshot_hash = reconciliation_snapshot(shift, rows, Decimal("1.00"))[1]
    db = SimpleNamespace(
        scalar=AsyncMock(return_value=shift),
        execute=AsyncMock(return_value=Mock(all=Mock(return_value=rows))),
    )
    user = SimpleNamespace(role=UserRole.CASHIER, id=shift.user_id)
    result = asyncio.run(verify_zk_proof(shift.id, user, db))
    assert result.proof_integrity_valid is True
    assert result.source_snapshot_consistent is True
    assert result.ledger_verified is False

    # Legacy database flags must never be promoted without a finalized receipt.
    shift.zk_proof_status = "verified"
    shift.zk_verified = True
    shift.zk_verified_at = shift.zk_proved_at
    legacy = asyncio.run(verify_zk_proof(shift.id, user, db))
    assert legacy.proof_status == "proved"
    assert legacy.ledger_verified is False
    assert legacy.verified_at is None

    rows[0].amount = Decimal("301.00")
    with pytest.raises(HTTPException) as raised:
        asyncio.run(verify_zk_proof(shift.id, user, db))
    assert raised.value.status_code == 409


def test_legacy_proof_without_source_snapshot_requires_regeneration():
    shift = _shift()
    proof = b"integrity-test-bytes"
    shift.zk_proof = base64.b64encode(proof).decode()
    shift.zk_proof_hash = hashlib.sha256(proof).hexdigest()
    shift.zk_commitment = "fuelos:shift:v1:" + "ab" * 32
    shift.zk_source_snapshot_hash = None
    db = SimpleNamespace(scalar=AsyncMock(return_value=shift))
    user = SimpleNamespace(role=UserRole.CASHIER, id=shift.user_id)
    with pytest.raises(HTTPException) as raised:
        asyncio.run(verify_zk_proof(shift.id, user, db))
    assert raised.value.status_code == 409


def test_proving_persists_digest_of_the_exact_rows_used_for_witness():
    shift = _shift()
    shift.status = ShiftStatus.CLOSED
    shift.reconciliation_tolerance = Decimal("1.00")
    rows = _rows()
    expected_inputs, expected_hash = reconciliation_snapshot(shift, rows, Decimal("1.00"))
    db = SimpleNamespace(
        scalar=AsyncMock(return_value=shift),
        execute=AsyncMock(return_value=Mock(all=Mock(return_value=rows))),
        flush=AsyncMock(), refresh=AsyncMock(),
    )
    user = SimpleNamespace(role=UserRole.STATION_MANAGER, station_id=shift.station_id)
    fake_proof = {
        "status": "proved", "class": "matched", "tolerance_tl": Decimal("1.00"),
        "context_digest": compute_shift_context_digest(
            shift.id, shift.station_id, shift.user_id, shift.start_time, shift.end_time, 100,
        ),
        "proof": "cHJvb2Y=", "proof_hash": "0" * 64,
    }
    with patch("app.services.zk_service.generate_reconciliation_proof", new_callable=AsyncMock, return_value=fake_proof) as prove, \
         patch("app.api.shifts._build_shift_response", new_callable=AsyncMock, return_value="ok"):
        assert asyncio.run(generate_zk_proof(shift.id, user, db)) == "ok"
    assert prove.await_args.kwargs["total_sales"] == expected_inputs["total_sales"]
    assert prove.await_args.kwargs["pos"] == expected_inputs["pos"]
    assert prove.await_args.kwargs["cash"] == expected_inputs["cash"]
    assert shift.zk_source_snapshot_hash == expected_hash
