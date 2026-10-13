"""Verify two independently provisioned Ed25519 approvals of public ZK evidence."""

import base64
import binascii
import hashlib
import json
import re

from cryptography.exceptions import InvalidSignature
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PublicKey

from app.config import get_settings
from app.services.zk_service import to_kurus_int

STATEMENT_VERSION = "reconcile-v4-financial-commitment"
DOMAIN = "FUELOS_RECONCILIATION_ATTESTATION_V2"
FIELDS = (
    "network", "txId", "contractAddress", "contextDigest", "financialCommitment",
    "sourceSnapshotHash", "publicClass", "toleranceKurus", "verifierKeySha256",
    "statementVersion",
)
HEX64 = re.compile(r"^[0-9a-f]{64}$")
CONTEXT = re.compile(r"^fuelos:shift:v1:[0-9a-f]{64}$")


def public_statement(shift, handoff) -> dict[str, str]:
    """Build the exact public message understood by Midnight's independent verifier."""
    return {
        "network": "preview",
        "txId": handoff.submitted_tx_id,
        "contractAddress": handoff.contract_address,
        "contextDigest": shift.zk_commitment,
        "financialCommitment": shift.zk_financial_commitment,
        "sourceSnapshotHash": handoff.source_snapshot_hash,
        "publicClass": shift.zk_reconciliation_class.upper(),
        "toleranceKurus": str(to_kurus_int(shift.zk_tolerance)),
        "verifierKeySha256": handoff.verifier_key_sha256,
        "statementVersion": shift.zk_statement_version,
    }


def attestation_message(statement: dict[str, str]) -> bytes:
    if (set(statement) != set(FIELDS) or any(not isinstance(statement[key], str) for key in FIELDS)
        or statement["network"] != "preview"
        or not re.fullmatch(r"^[0-9a-f]{66}$", statement["txId"])
        or not HEX64.fullmatch(statement["contractAddress"])
        or not CONTEXT.fullmatch(statement["contextDigest"])
        or not HEX64.fullmatch(statement["financialCommitment"])
        or not HEX64.fullmatch(statement["sourceSnapshotHash"])
        or statement["publicClass"] not in {"MATCHED", "SHORTAGE", "SURPLUS"}
        or not re.fullmatch(r"^(0|[1-9][0-9]*)$", statement["toleranceKurus"])
        or int(statement["toleranceKurus"]) > 100000
        or not HEX64.fullmatch(statement["verifierKeySha256"])
        or statement["statementVersion"] != STATEMENT_VERSION):
        raise ValueError("Invalid reconciliation attestation")
    # Property order matches midnight/src/source-attestation.ts exactly.
    message = {"domain": DOMAIN, **{key: statement[key] for key in FIELDS}}
    return json.dumps(message, separators=(",", ":"), ensure_ascii=True).encode("ascii")


def _station_key(registry_json: str, station_id: str) -> str | None:
    try:
        registry = json.loads(registry_json)
    except (TypeError, ValueError):
        return None
    if not isinstance(registry, dict):
        return None
    value = registry.get(station_id.lower())
    return value if isinstance(value, str) else None


def _trusted_key(value: str | None) -> tuple[Ed25519PublicKey, str] | None:
    if not value:
        return None
    try:
        pem = base64.b64decode(value, validate=True)
        key = serialization.load_pem_public_key(pem)
    except (ValueError, binascii.Error):
        return None
    if not isinstance(key, Ed25519PublicKey):
        return None
    der = key.public_bytes(serialization.Encoding.DER, serialization.PublicFormat.SubjectPublicKeyInfo)
    return key, hashlib.sha256(der).hexdigest()


def _signature(value: str) -> bytes | None:
    if not isinstance(value, str) or not re.fullmatch(r"[A-Za-z0-9+/]{86}==", value):
        return None
    try:
        decoded = base64.b64decode(value, validate=True)
    except binascii.Error:
        return None
    return decoded if len(decoded) == 64 and base64.b64encode(decoded).decode() == value else None


def verify_dual_attestation(statement: dict[str, str], source_signature: str,
                            manager_signature: str, station_id: str) -> tuple[str, str] | None:
    """Trusted keys come only from server configuration, never from a submitted bundle."""
    message = attestation_message(statement)
    settings = get_settings()
    source = _trusted_key(_station_key(settings.ZK_SOURCE_PUBLIC_KEYS_JSON, station_id))
    manager = _trusted_key(_station_key(settings.ZK_MANAGER_PUBLIC_KEYS_JSON, station_id))
    source_bytes = _signature(source_signature)
    manager_bytes = _signature(manager_signature)
    if (source is None or manager is None or source[1] == manager[1]
        or source_bytes is None or manager_bytes is None):
        return None
    try:
        source[0].verify(source_bytes, message)
        manager[0].verify(manager_bytes, message)
    except InvalidSignature:
        return None
    return source[1], manager[1]
