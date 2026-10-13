"""Preview handoff authorization, source binding, and receipt regressions."""

import asyncio
import base64
import hashlib
import uuid
from datetime import datetime, timezone
from decimal import Decimal
from types import SimpleNamespace
from unittest.mock import AsyncMock, Mock, patch

import pytest
from fastapi import HTTPException, Response

from app.api.zk_preview import (
    IntentRequest, PrepareRequest, ReceiptRequest, _matching_preview_receipt, _preview_user,
    confirm_shift_preview, issue_preview_session, prepare_shift_preview,
    register_shift_preview_intent, shift_preview_status,
)
from app.auth.dependencies import get_current_user
from app.auth.security import create_access_token
from app.models.base import PaymentMethod, ShiftStatus, UserRole
from app.models.zk_preview_handoff import ZKPreviewHandoff
from app.services.zk_service import compute_shift_context_digest
from app.services.zk_snapshot import reconciliation_snapshot
from app.services.zk_preview import PreviewHandoffError


def fixture():
    now = datetime(2026, 10, 8, tzinfo=timezone.utc)
    user = SimpleNamespace(id=uuid.uuid4(), role=UserRole.STATION_MANAGER,
                           station_id=uuid.uuid4(), company_id=uuid.uuid4(), is_active=True)
    shift = SimpleNamespace(
        id=uuid.uuid4(), station_id=user.station_id, user_id=uuid.uuid4(),
        start_time=now, end_time=now, status=ShiftStatus.CLOSED,
        opening_cash=Decimal("50.00"), closing_cash=Decimal("350.00"),
        declared_pos=None, declared_eft=None, declared_credit=None,
        reconciliation_tolerance=Decimal("1.00"), zk_tolerance=Decimal("1.00"),
        zk_proof_status="proved", zk_statement_version="reconcile-v4-financial-commitment",
        zk_reconciliation_class="matched", zk_financial_nonce="ab" * 32,
        zk_financial_commitment="cd" * 32,
    )
    rows = [SimpleNamespace(id=uuid.UUID(int=1), payment_method=PaymentMethod.CASH,
                            amount=Decimal("300.00"))]
    shift.zk_source_snapshot_hash = reconciliation_snapshot(shift, rows, Decimal("1.00"))[1]
    shift.zk_commitment = compute_shift_context_digest(
        shift.id, shift.station_id, shift.user_id, shift.start_time, shift.end_time, 100,
    )
    proof = b"proof-bytes"
    shift.zk_proof = base64.b64encode(proof).decode()
    shift.zk_proof_hash = hashlib.sha256(proof).hexdigest()
    registry = {"contractAddress": "11" * 32, "verifierKeySha256": "22" * 32}
    handoff = ZKPreviewHandoff(
        id=uuid.uuid4(), shift_id=shift.id, proof_hash=shift.zk_proof_hash,
        source_snapshot_hash=shift.zk_source_snapshot_hash,
        contract_address=registry["contractAddress"],
        verifier_key_sha256=registry["verifierKeySha256"],
        created_at=now, expires_at=now,
    )
    db = SimpleNamespace(
        scalar=AsyncMock(), execute=AsyncMock(return_value=Mock(all=Mock(return_value=rows))),
        flush=AsyncMock(), add=Mock(),
    )
    return user, shift, handoff, registry, db


def run(coroutine):
    return asyncio.run(coroutine)


def test_scoped_token_cannot_use_general_api_or_other_shift():
    user, shift, _, _, db = fixture()
    db.scalar.return_value = shift
    response = Response()
    token = run(issue_preview_session(shift.id, response, user, db))["token"]
    assert response.headers["Cache-Control"] == "no-store"
    with pytest.raises(HTTPException) as general:
        run(get_current_user(token, db))
    assert general.value.status_code == 401
    db.scalar.return_value = user
    assert run(_preview_user(shift.id, token, db)) is user
    with pytest.raises(HTTPException) as other:
        run(_preview_user(uuid.uuid4(), token, db))
    assert other.value.status_code == 401


def test_prepare_rejects_stale_source_without_invoking_prover():
    user, shift, _, registry, db = fixture()
    shift.zk_source_snapshot_hash = "00" * 32
    db.scalar.side_effect = [shift, None]
    request = PrepareRequest(shielded_coin_public_key="a" * 64,
                             shielded_encryption_public_key="b" * 64)
    with patch("app.api.zk_preview.trusted_preview_deployment", return_value=registry), \
         patch("app.api.zk_preview.prepare_preview_transaction", new_callable=AsyncMock) as prove:
        with pytest.raises(HTTPException) as raised:
            run(prepare_shift_preview(shift.id, request, Response(), user, db))
    assert raised.value.status_code == 409
    prove.assert_not_awaited()


def test_prepare_reuses_same_proof_handoff_without_returning_witness():
    user, shift, handoff, registry, db = fixture()
    db.scalar.side_effect = [shift, handoff, shift, handoff]
    request = PrepareRequest(shielded_coin_public_key="a" * 64,
                             shielded_encryption_public_key="b" * 64)
    with patch("app.api.zk_preview.trusted_preview_deployment", return_value=registry), \
         patch("app.api.zk_preview.prepare_preview_transaction", new_callable=AsyncMock,
               return_value={"tx_hex": "ab" * 200}):
        result = run(prepare_shift_preview(shift.id, request, Response(), user, db))
    assert result["handoffId"] == str(handoff.id)
    assert result["txHex"] == "ab" * 200
    assert "nonceHex" not in result and "totalSales" not in result
    db.add.assert_not_called()


def test_receipt_rejects_wrong_public_class_and_insufficient_confirmations():
    user, shift, handoff, _, db = fixture()
    tx_id = "00" + "aa" * 32
    handoff.pending_tx_id = tx_id
    db.scalar.side_effect = [shift, handoff]
    wrong = {"contractAddress": handoff.contract_address,
             "verifierKeySha256": handoff.verifier_key_sha256,
             "publicClass": "SHORTAGE", "toleranceKurus": "100",
             "contextDigest": shift.zk_commitment.split(":")[-1],
             "financialCommitment": shift.zk_financial_commitment,
             "confirmations": 6}
    with patch("app.api.zk_preview.inspect_preview_transaction", new_callable=AsyncMock,
               return_value=wrong), \
         patch("app.api.zk_preview.trusted_preview_deployment", return_value={
             "contractAddress": handoff.contract_address}):
        with pytest.raises(HTTPException) as raised:
            run(confirm_shift_preview(shift.id, ReceiptRequest(handoff_id=handoff.id, tx_id=tx_id),
                                      Response(), user, db))
    assert raised.value.status_code == 409
    assert handoff.submitted_tx_id is None
    wrong["publicClass"] = "MATCHED"
    wrong["confirmations"] = 5
    db.scalar.side_effect = [shift, handoff]
    with patch("app.api.zk_preview.inspect_preview_transaction", new_callable=AsyncMock,
               return_value=wrong), \
         patch("app.api.zk_preview.trusted_preview_deployment", return_value={
             "contractAddress": handoff.contract_address}):
        with pytest.raises(HTTPException) as raised:
            run(confirm_shift_preview(shift.id, ReceiptRequest(handoff_id=handoff.id, tx_id=tx_id),
                                      Response(), user, db))
    assert raised.value.status_code == 409


@pytest.mark.parametrize("field,value", [
    ("verifierKeySha256", "ee" * 32),
    ("financialCommitment", "ff" * 32),
    ("contextDigest", "aa" * 32),
    ("toleranceKurus", "101"),
])
def test_receipt_rejects_public_statement_mismatch(field, value):
    _, shift, handoff, registry, _ = fixture()
    observed = {
        "contractAddress": handoff.contract_address,
        "verifierKeySha256": handoff.verifier_key_sha256,
        "publicClass": "MATCHED", "toleranceKurus": "100",
        "contextDigest": shift.zk_commitment.split(":")[-1],
        "financialCommitment": shift.zk_financial_commitment,
        "confirmations": 6,
    }
    observed[field] = value
    with patch("app.api.zk_preview.inspect_preview_transaction", new_callable=AsyncMock,
               return_value=observed), \
         patch("app.api.zk_preview.trusted_preview_deployment", return_value=registry):
        with pytest.raises(PreviewHandoffError):
            run(_matching_preview_receipt(shift, handoff, "00" + "aa" * 32))


def test_status_fails_closed_when_preview_block_is_reorged():
    user, shift, handoff, _, db = fixture()
    handoff.submitted_tx_id = "00" + "aa" * 32
    handoff.pending_tx_id = handoff.submitted_tx_id
    handoff.tx_hash = "33" * 32
    handoff.block_hash = "44" * 32
    handoff.block_height = 100
    db.scalar.side_effect = [shift, handoff]
    observed = {"txHash": handoff.tx_hash, "blockHash": "55" * 32,
                "blockHeight": 100}
    with patch("app.api.zk_preview._matching_preview_receipt", new_callable=AsyncMock,
               return_value=observed):
        result = run(shift_preview_status(shift.id, Response(), user, db))
    assert result["ledgerConfirmed"] is False
    assert result["sourceAuthenticated"] is False
    assert result["pendingTxId"] == handoff.submitted_tx_id
    assert result["handoffId"] == str(handoff.id)


def test_intent_is_idempotent_for_one_tx_and_rejects_second_browser_tx():
    user, shift, handoff, _, db = fixture()
    handoff.expires_at = datetime(2099, 1, 1, tzinfo=timezone.utc)
    db.scalar.side_effect = [shift, handoff]
    first = "00" + "aa" * 32
    result = run(register_shift_preview_intent(
        shift.id, IntentRequest(handoff_id=handoff.id, tx_id=first), Response(), user, db,
    ))
    assert result["pendingTxId"] == first
    assert handoff.pending_tx_id == first
    db.scalar.side_effect = [shift, handoff]
    same = run(register_shift_preview_intent(
        shift.id, IntentRequest(handoff_id=handoff.id, tx_id=first), Response(), user, db,
    ))
    assert same == result
    db.scalar.side_effect = [shift, handoff]
    with pytest.raises(HTTPException) as raised:
        run(register_shift_preview_intent(
            shift.id, IntentRequest(handoff_id=handoff.id, tx_id="00" + "bb" * 32),
            Response(), user, db,
        ))
    assert raised.value.status_code == 409


def test_status_exposes_pending_tx_for_popup_recovery():
    user, shift, handoff, _, db = fixture()
    handoff.pending_tx_id = "00" + "aa" * 32
    db.scalar.side_effect = [shift, handoff]
    result = run(shift_preview_status(shift.id, Response(), user, db))
    assert result["ledgerConfirmed"] is False
    assert result["pendingTxId"] == handoff.pending_tx_id
    assert result["handoffId"] == str(handoff.id)
