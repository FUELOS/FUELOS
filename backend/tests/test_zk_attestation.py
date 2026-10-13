"""Independent source/manager signatures must bind exactly one public statement."""

import asyncio
import base64
import hashlib
import json
import uuid
from datetime import datetime, timezone
from types import SimpleNamespace
from unittest.mock import AsyncMock, patch

import pytest
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey
from fastapi import HTTPException, Response

from app.api.zk_preview import AttestationSubmission, submit_preview_attestation
from app.models.base import UserRole
from app.services.zk_attestation import attestation_message, verify_dual_attestation

STATEMENT = {
    "network": "preview",
    "txId": "00" + "ab" * 32,
    "contractAddress": "ab" * 32,
    "contextDigest": "fuelos:shift:v1:" + "cd" * 32,
    "financialCommitment": "ef" * 32,
    "sourceSnapshotHash": "12" * 32,
    "publicClass": "MATCHED",
    "toleranceKurus": "100",
    "verifierKeySha256": "34" * 32,
    "statementVersion": "reconcile-v4-financial-commitment",
}
STATION_ID = str(uuid.uuid4())


def public_key_b64(private_key):
    pem = private_key.public_key().public_bytes(
        serialization.Encoding.PEM, serialization.PublicFormat.SubjectPublicKeyInfo,
    )
    return base64.b64encode(pem).decode()


def signatures(source, manager):
    message = attestation_message(STATEMENT)
    return (
        base64.b64encode(source.sign(message)).decode(),
        base64.b64encode(manager.sign(message)).decode(),
    )


def test_message_matches_midnight_canonical_encoding():
    message = attestation_message(dict(reversed(list(STATEMENT.items()))))
    assert message.startswith(b'{"domain":"FUELOS_RECONCILIATION_ATTESTATION_V2","network":"preview"')
    assert b'"sourceSnapshotHash":"' + b'12' * 32 + b'"' in message
    assert b" " not in message
    assert hashlib.sha256(message).hexdigest() == "db4d491a41aa795582ab764e2758b70ee1c1c731b46ff6d1b6c14d7cbeb5fd69"


def test_two_distinct_trusted_signatures_are_required():
    source = Ed25519PrivateKey.generate()
    manager = Ed25519PrivateKey.generate()
    trusted = SimpleNamespace(
        ZK_SOURCE_PUBLIC_KEYS_JSON=json.dumps({STATION_ID: public_key_b64(source)}),
        ZK_MANAGER_PUBLIC_KEYS_JSON=json.dumps({STATION_ID: public_key_b64(manager)}),
    )
    source_sig, manager_sig = signatures(source, manager)
    with patch("app.services.zk_attestation.get_settings", return_value=trusted):
        fingerprints = verify_dual_attestation(STATEMENT, source_sig, manager_sig, STATION_ID)
        assert fingerprints is not None and fingerprints[0] != fingerprints[1]
        assert verify_dual_attestation({**STATEMENT, "publicClass": "SURPLUS"}, source_sig, manager_sig, STATION_ID) is None
        assert verify_dual_attestation(STATEMENT, manager_sig, source_sig, STATION_ID) is None
        assert verify_dual_attestation(STATEMENT, source_sig, "bad", STATION_ID) is None
        assert verify_dual_attestation(STATEMENT, source_sig, manager_sig, str(uuid.uuid4())) is None
    trusted.ZK_MANAGER_PUBLIC_KEYS_JSON = trusted.ZK_SOURCE_PUBLIC_KEYS_JSON
    with patch("app.services.zk_attestation.get_settings", return_value=trusted):
        assert verify_dual_attestation(STATEMENT, source_sig, source_sig, STATION_ID) is None


def test_attestation_endpoint_is_locked_and_rejects_invalid_signature():
    source = Ed25519PrivateKey.generate()
    manager = Ed25519PrivateKey.generate()
    trusted = SimpleNamespace(
        ZK_SOURCE_PUBLIC_KEYS_JSON=json.dumps({STATION_ID: public_key_b64(source)}),
        ZK_MANAGER_PUBLIC_KEYS_JSON=json.dumps({STATION_ID: public_key_b64(manager)}),
    )
    source_sig, manager_sig = signatures(source, manager)
    user = SimpleNamespace(role=UserRole.STATION_MANAGER, station_id=uuid.uuid4())
    shift = SimpleNamespace(id=uuid.uuid4(), station_id=STATION_ID, zk_verified=False, zk_verified_at=None,
                            zk_proof_status="proved", zk_proof_hash="proof")
    handoff = SimpleNamespace(
        attested_at=None, source_signature=None, manager_signature=None,
        source_key_fingerprint=None, manager_key_fingerprint=None,
        submitted_tx_id="00" + "ab" * 32, tx_hash="hash", block_hash="block",
        block_height=123, proof_hash="proof", source_snapshot_hash="snapshot",
    )
    db = SimpleNamespace(scalar=AsyncMock(side_effect=[shift, handoff]), flush=AsyncMock())
    with (patch("app.api.zk_preview._attestable_statement", new=AsyncMock(return_value=STATEMENT)),
          patch("app.api.zk_preview._snapshot", new=AsyncMock(return_value=({}, "snapshot", "context", 1))),
          patch("app.api.zk_preview._valid_proof", return_value=True),
          patch("app.api.zk_preview.public_statement", return_value=STATEMENT),
          patch("app.services.zk_attestation.get_settings", return_value=trusted)):
        with pytest.raises(HTTPException) as bad:
            asyncio.run(submit_preview_attestation(
                shift.id, AttestationSubmission(source_signature=source_sig, manager_signature=source_sig),
                Response(), user, db,
            ))
        assert bad.value.status_code == 409
        assert shift.zk_verified is False and handoff.attested_at is None
        db.scalar.side_effect = [shift, handoff, shift, handoff]
        response = asyncio.run(submit_preview_attestation(
            shift.id, AttestationSubmission(source_signature=source_sig, manager_signature=manager_sig),
            Response(), user, db,
        ))
        assert response["sourceAuthenticated"] is True
        assert shift.zk_verified is False and shift.zk_proof_status == "proved"
        assert isinstance(handoff.attested_at, datetime)
        assert handoff.attested_at.tzinfo == timezone.utc
        assert handoff.source_signature == source_sig and handoff.manager_signature == manager_sig
        db.flush.assert_awaited_once()
