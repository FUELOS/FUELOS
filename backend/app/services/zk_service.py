"""Bridge from FuelOS shift data to the real local Midnight prover.

Private monetary values are sent only to the local Node process and its
localhost proof server. They are never included in returned errors or logs.
"""

from __future__ import annotations

import asyncio
import base64
import hashlib
import json
import os
import re
import secrets
import uuid
from datetime import datetime
from decimal import Decimal, InvalidOperation
from pathlib import Path
from typing import Any, Literal

KURUS = Decimal("0.01")
DEFAULT_TOLERANCE = Decimal("1.00")
SHIFT_CONTEXT_PATTERN = re.compile(r"^fuelos:shift:v1:[0-9a-f]{64}$")
MAX_INPUT_KURUS = (1 << 64) - 1
MAX_TOLERANCE_KURUS = 100_000
ZKClass = Literal["matched", "shortage", "surplus"]


class ZKProofGenerationError(RuntimeError):
    """Sanitized prover failure; never carries private prover diagnostics."""

    def __init__(self, stage: str = "unknown") -> None:
        self.stage = stage
        super().__init__(f"Midnight proof generation failed at stage: {stage}")


def to_kurus_int(value: Decimal | float | int | str | None) -> int:
    if value is None:
        return 0
    try:
        amount = Decimal(str(value))
    except (InvalidOperation, TypeError, ValueError) as exc:
        raise ValueError("Financial amount is not a decimal number") from exc
    if not amount.is_finite() or amount < 0 or amount > Decimal(MAX_INPUT_KURUS) / 100:
        raise ValueError("Financial amount is outside the Compact Uint<64> range")
    if amount != amount.quantize(KURUS):
        raise ValueError("Financial amount must contain whole kurus without rounding")
    result = int(amount * 100)
    if result < 0 or result > MAX_INPUT_KURUS:
        raise ValueError("Financial amount is outside the Compact Uint<64> range")
    return result


def classify(
    sales_kurus: int,
    pos_kurus: int,
    cash_kurus: int,
    eft_kurus: int,
    credit_kurus: int,
    tolerance_kurus: int,
) -> ZKClass:
    """Select the public claim; the Compact circuit independently constrains it."""
    calculated_total = pos_kurus + cash_kurus + eft_kurus + credit_kurus
    if sales_kurus >= calculated_total:
        return "matched" if sales_kurus - calculated_total <= tolerance_kurus else "shortage"
    return "matched" if calculated_total - sales_kurus <= tolerance_kurus else "surplus"


def compute_shift_context_digest(
    shift_id: uuid.UUID | str,
    station_id: uuid.UUID | str,
    user_id: uuid.UUID | str | None,
    start_time: datetime | str,
    end_time: datetime | str | None,
    authorized_tolerance_kurus: int,
) -> str:
    """Create the metadata digest now published by the Compact circuit."""
    payload = {
        "domain": "FUELOS_RECONCILIATION_V1",
        "shiftId": str(shift_id).lower(),
        "stationId": str(station_id).lower(),
        "userId": str(user_id or "").lower(),
        "startTime": start_time.isoformat() if isinstance(start_time, datetime) else str(start_time),
        "endTime": end_time.isoformat() if isinstance(end_time, datetime) else (str(end_time) if end_time else None),
        "authorizedToleranceKurus": str(authorized_tolerance_kurus),
    }
    canonical = json.dumps(payload, sort_keys=True, separators=(",", ":"))
    return f"fuelos:shift:v1:{hashlib.sha256(canonical.encode()).hexdigest()}"


def proof_integrity_matches(proof_base64: str, expected_hash: str) -> bool:
    """Check stored-byte integrity only; this is not ZK or ledger verification."""
    try:
        proof = base64.b64decode(proof_base64, validate=True)
    except (ValueError, TypeError):
        return False
    return bool(proof) and hashlib.sha256(proof).hexdigest() == expected_hash


def _midnight_dir() -> Path:
    configured = os.getenv("FUELOS_MIDNIGHT_DIR")
    return Path(configured) if configured else Path(__file__).resolve().parents[3] / "midnight"


async def generate_reconciliation_proof(
    *,
    total_sales: Decimal,
    pos: Decimal,
    cash: Decimal,
    eft: Decimal,
    credit: Decimal,
    tolerance_tl: Decimal,
    context_digest: str,
) -> dict[str, Any]:
    """Run Compact execution, proof-server check, and real proof generation."""
    values = {
        "totalSales": to_kurus_int(total_sales),
        "pos": to_kurus_int(pos),
        "cash": to_kurus_int(cash),
        "eft": to_kurus_int(eft),
        "credit": to_kurus_int(credit),
    }
    tolerance_kurus = to_kurus_int(tolerance_tl)
    if tolerance_kurus > MAX_TOLERANCE_KURUS:
        raise ValueError("Tolerance exceeds the Compact circuit maximum")
    if not SHIFT_CONTEXT_PATTERN.fullmatch(context_digest):
        raise ValueError("Invalid shift context digest")
    claim = classify(
        values["totalSales"], values["pos"], values["cash"],
        values["eft"], values["credit"], tolerance_kurus,
    )
    nonce_hex = secrets.token_hex(32)
    request = {
        **{name: str(value) for name, value in values.items()},
        "toleranceKurus": str(tolerance_kurus),
        "claim": claim,
        "contextDigest": context_digest,
        "nonceHex": nonce_hex,
    }

    npm = os.getenv("FUELOS_NPM_COMMAND") or ("npm.cmd" if os.name == "nt" else "npm")
    try:
        process = await asyncio.create_subprocess_exec(
            npm, "run", "--silent", "prove:cli",
            cwd=_midnight_dir(),
            stdin=asyncio.subprocess.PIPE,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )
        stdout, _stderr = await asyncio.wait_for(
            process.communicate(json.dumps(request).encode()), timeout=360
        )
    except (OSError, asyncio.TimeoutError) as exc:
        raise ZKProofGenerationError("process") from exc

    try:
        response = json.loads(stdout.decode())
    except (UnicodeDecodeError, json.JSONDecodeError) as exc:
        raise ZKProofGenerationError("response") from exc
    if process.returncode != 0 or response.get("status") != "proved":
        raise ZKProofGenerationError(str(response.get("stage", "unknown")))

    proof_base64 = response.get("proofBase64")
    proof_hash = response.get("proofHash")
    if not isinstance(proof_base64, str) or not isinstance(proof_hash, str):
        raise ZKProofGenerationError("response")
    if response.get("publicClass") != claim or response.get("toleranceKurus") != str(tolerance_kurus):
        raise ZKProofGenerationError("public_output")
    if response.get("publicContextDigest") != context_digest or response.get("proofServerChecked") is not True:
        raise ZKProofGenerationError("public_output")
    financial_commitment = response.get("publicFinancialCommitment")
    if not isinstance(financial_commitment, str) or not re.fullmatch(r"[0-9a-f]{64}", financial_commitment):
        raise ZKProofGenerationError("public_output")
    if not proof_integrity_matches(proof_base64, proof_hash):
        raise ZKProofGenerationError("proof_integrity")
    try:
        proof_bytes = int(response["proofBytes"])
        decoded_size = len(base64.b64decode(proof_base64, validate=True))
    except (KeyError, TypeError, ValueError) as exc:
        raise ZKProofGenerationError("response") from exc
    if proof_bytes <= 0 or decoded_size != proof_bytes:
        raise ZKProofGenerationError("proof_integrity")

    return {
        "status": "proved",
        "class": claim,
        "context_digest": context_digest,
        "financial_commitment": financial_commitment,
        "financial_nonce": nonce_hex,
        "tolerance_tl": tolerance_tl,
        "proof": proof_base64,
        "proof_hash": proof_hash,
        "proof_bytes": proof_bytes,
        "proof_server_checked": bool(response.get("proofServerChecked")),
        "ledger_verified": False,
    }
