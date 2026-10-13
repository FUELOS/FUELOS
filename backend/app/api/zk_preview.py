"""Manager-controlled Preview handoff. Private witness never enters an HTTP response."""

import uuid
from datetime import datetime, timedelta, timezone
from decimal import Decimal

from fastapi import APIRouter, Depends, HTTPException, Response
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.dependencies import oauth2_scheme, require_role
from app.auth.security import create_access_token, decode_access_token
from app.database import get_db
from app.models.base import ShiftStatus, UserRole
from app.models.shift import Shift
from app.models.transaction import Transaction
from app.models.user import User
from app.models.zk_preview_handoff import ZKPreviewHandoff
from app.services.reconciliation import DEFAULT_TOLERANCE
from app.services.zk_attestation import public_statement, verify_dual_attestation
from app.services.zk_preview import (
    PreviewHandoffError, inspect_preview_transaction, prepare_preview_transaction,
    trusted_preview_deployment,
)
from app.services.zk_service import compute_shift_context_digest, proof_integrity_matches, to_kurus_int
from app.services.zk_snapshot import reconciliation_snapshot

router = APIRouter(prefix="/api/shifts", tags=["Midnight Preview"])


class PrepareRequest(BaseModel):
    shielded_coin_public_key: str = Field(min_length=64, max_length=160)
    shielded_encryption_public_key: str = Field(min_length=64, max_length=160)


class ReceiptRequest(BaseModel):
    handoff_id: uuid.UUID
    tx_id: str = Field(pattern=r"^[0-9a-f]{66}$")


class IntentRequest(ReceiptRequest):
    pass


class AttestationSubmission(BaseModel):
    source_signature: str = Field(min_length=88, max_length=88)
    manager_signature: str = Field(min_length=88, max_length=88)


async def _preview_user(
    shift_id: uuid.UUID, token: str = Depends(oauth2_scheme), db: AsyncSession = Depends(get_db),
) -> User:
    payload = decode_access_token(token)
    if (not payload or payload.get("scope") != "zk-preview"
        or payload.get("shift_id") != str(shift_id)):
        raise HTTPException(status_code=401, detail="Preview yetkisi geçersiz")
    try:
        user_id = uuid.UUID(payload["sub"])
    except (KeyError, TypeError, ValueError):
        raise HTTPException(status_code=401, detail="Preview yetkisi geçersiz") from None
    user = await db.scalar(select(User).where(User.id == user_id))
    if user is None or not user.is_active or user.role not in (UserRole.SUPER_ADMIN, UserRole.STATION_MANAGER):
        raise HTTPException(status_code=403, detail="Preview yetkisi yok")
    return user


def _authorized_shift_query(shift_id: uuid.UUID, user: User):
    query = select(Shift).where(Shift.id == shift_id)
    if user.role == UserRole.STATION_MANAGER:
        query = query.where(Shift.station_id == user.station_id)
    else:
        from app.models.station import Station
        query = query.join(Station).where(Station.company_id == user.company_id)
    return query


async def _snapshot(db: AsyncSession, shift: Shift):
    tolerance = Decimal(str(shift.reconciliation_tolerance)) if shift.reconciliation_tolerance is not None else DEFAULT_TOLERANCE
    rows = await db.execute(
        select(Transaction.id, Transaction.payment_method, Transaction.amount)
        .where(Transaction.shift_id == shift.id).order_by(Transaction.id)
    )
    inputs, digest = reconciliation_snapshot(shift, rows.all(), tolerance)
    context = compute_shift_context_digest(
        shift.id, shift.station_id, shift.user_id, shift.start_time, shift.end_time, to_kurus_int(tolerance),
    )
    return inputs, digest, context, tolerance


async def _matching_preview_receipt(shift: Shift, handoff: ZKPreviewHandoff, tx_id: str) -> dict:
    observed = await inspect_preview_transaction(tx_id, shift.zk_commitment or "")
    registry = trusted_preview_deployment()
    if (observed.get("contractAddress") != handoff.contract_address
        or observed.get("verifierKeySha256") != handoff.verifier_key_sha256
        or observed.get("publicClass") != (shift.zk_reconciliation_class or "").upper()
        or observed.get("toleranceKurus") != str(to_kurus_int(shift.zk_tolerance))
        or observed.get("contextDigest") != (shift.zk_commitment or "").split(":")[-1]
        or observed.get("financialCommitment") != shift.zk_financial_commitment
        or observed.get("contractAddress") != registry["contractAddress"]
        or observed.get("confirmations", 0) < 6):
        raise PreviewHandoffError("Preview public statement mismatch")
    return observed


def _valid_proof(shift: Shift, source_hash: str, context: str, tolerance: Decimal) -> bool:
    return (shift.status == ShiftStatus.CLOSED
        and shift.zk_proof_status in ("proved", "verified")
        and shift.zk_statement_version == "reconcile-v4-financial-commitment"
        and shift.zk_source_snapshot_hash == source_hash
        and shift.zk_commitment == context
        and shift.zk_tolerance == tolerance
        and shift.zk_financial_nonce is not None
        and shift.zk_financial_commitment is not None
        and shift.zk_reconciliation_class in ("matched", "shortage", "surplus")
        and shift.zk_proof is not None and shift.zk_proof_hash is not None
        and proof_integrity_matches(shift.zk_proof, shift.zk_proof_hash))


async def _attestable_statement(db: AsyncSession, shift: Shift, handoff: ZKPreviewHandoff) -> dict:
    if not handoff.submitted_tx_id:
        raise HTTPException(status_code=409, detail="Preview işlemi henüz kesinleşmedi")
    try:
        _, source_hash, context, tolerance = await _snapshot(db, shift)
    except ValueError:
        raise HTTPException(status_code=409, detail="Vardiya kaynağı geçersiz") from None
    if (handoff.proof_hash != shift.zk_proof_hash or handoff.source_snapshot_hash != source_hash
        or not _valid_proof(shift, source_hash, context, tolerance)):
        raise HTTPException(status_code=409, detail="Güncel vardiya proof'u gerekli")
    try:
        observed = await _matching_preview_receipt(shift, handoff, handoff.submitted_tx_id)
    except PreviewHandoffError:
        raise HTTPException(status_code=409, detail="Preview işlemi doğrulanamadı") from None
    if (observed.get("txHash") != handoff.tx_hash or observed.get("blockHash") != handoff.block_hash
        or observed.get("blockHeight") != handoff.block_height):
        raise HTTPException(status_code=409, detail="Preview işlem bloğu değişti")
    return public_statement(shift, handoff)


@router.post("/{shift_id}/zk-preview/session")
async def issue_preview_session(
    shift_id: uuid.UUID,
    response: Response,
    current_user: User = Depends(require_role(UserRole.SUPER_ADMIN, UserRole.STATION_MANAGER)),
    db: AsyncSession = Depends(get_db),
):
    response.headers["Cache-Control"] = "no-store"
    shift = await db.scalar(_authorized_shift_query(shift_id, current_user))
    if shift is None:
        raise HTTPException(status_code=404, detail="Vardiya bulunamadı")
    token = create_access_token(
        {"sub": str(current_user.id), "scope": "zk-preview", "shift_id": str(shift_id)},
        expires_delta=timedelta(minutes=60),
    )
    return {"token": token, "expiresInSeconds": 3600}


@router.post("/{shift_id}/zk-preview/prepare")
async def prepare_shift_preview(
    shift_id: uuid.UUID, data: PrepareRequest, response: Response,
    current_user: User = Depends(_preview_user),
    db: AsyncSession = Depends(get_db),
):
    response.headers["Cache-Control"] = "no-store"
    shift = await db.scalar(_authorized_shift_query(shift_id, current_user))
    if shift is None:
        raise HTTPException(status_code=404, detail="Vardiya bulunamadı")
    existing = await db.scalar(select(ZKPreviewHandoff).where(ZKPreviewHandoff.shift_id == shift_id))
    if existing and (existing.pending_tx_id or existing.submitted_tx_id):
        raise HTTPException(status_code=409, detail="Vardiya işlemi zaten zincire gönderiliyor veya bağlandı")
    try:
        inputs, source_hash, context, tolerance = await _snapshot(db, shift)
    except ValueError:
        raise HTTPException(status_code=409, detail="Vardiya kaynağı geçersiz") from None
    if not _valid_proof(shift, source_hash, context, tolerance):
        raise HTTPException(status_code=409, detail="Güncel vardiya proof'u gerekli")
    if existing and (existing.proof_hash != shift.zk_proof_hash or existing.source_snapshot_hash != source_hash):
        raise HTTPException(status_code=409, detail="Önceki handoff farklı bir proof'a bağlı")
    registry = trusted_preview_deployment()
    proof_hash = shift.zk_proof_hash
    request = {
        "totalSales": str(to_kurus_int(inputs["total_sales"])),
        "pos": str(to_kurus_int(inputs["pos"])),
        "cash": str(to_kurus_int(inputs["cash"])),
        "eft": str(to_kurus_int(inputs["eft"])),
        "credit": str(to_kurus_int(inputs["credit"])),
        "nonceHex": shift.zk_financial_nonce,
        "publicClass": shift.zk_reconciliation_class.upper(),
        "toleranceKurus": str(to_kurus_int(tolerance)),
        "contextDigest": context,
        "financialCommitment": shift.zk_financial_commitment,
        "contractAddress": registry["contractAddress"],
        "verifierKeySha256": registry["verifierKeySha256"],
        "shieldedCoinPublicKey": data.shielded_coin_public_key,
        "shieldedEncryptionPublicKey": data.shielded_encryption_public_key,
    }
    try:
        prepared = await prepare_preview_transaction(request)
    except PreviewHandoffError:
        raise HTTPException(status_code=503, detail="Preview işlemi hazırlanamadı") from None

    # Serialize against any late transaction, close, re-prove, or other handoff.
    locked = await db.scalar(
        _authorized_shift_query(shift_id, current_user)
        .with_for_update().execution_options(populate_existing=True)
    )
    if locked is None:
        raise HTTPException(status_code=409, detail="Vardiya handoff sırasında değişti")
    existing = await db.scalar(select(ZKPreviewHandoff).where(ZKPreviewHandoff.shift_id == shift_id)
        .with_for_update().execution_options(populate_existing=True))
    if existing and (existing.pending_tx_id or existing.submitted_tx_id or existing.proof_hash != proof_hash
        or existing.source_snapshot_hash != source_hash):
        raise HTTPException(status_code=409, detail="Vardiya handoff sırasında değişti")
    try:
        _, current_hash, current_context, current_tolerance = await _snapshot(db, locked)
    except ValueError:
        raise HTTPException(status_code=409, detail="Vardiya handoff sırasında değişti") from None
    if (locked.zk_proof_hash != proof_hash or current_hash != source_hash or current_context != context
        or current_tolerance != tolerance or not _valid_proof(locked, current_hash, current_context, current_tolerance)):
        raise HTTPException(status_code=409, detail="Vardiya handoff sırasında değişti")
    now = datetime.now(timezone.utc)
    if existing:
        handoff = existing
        if (handoff.contract_address != registry["contractAddress"]
            or handoff.verifier_key_sha256 != registry["verifierKeySha256"]):
            raise HTTPException(status_code=409, detail="Preview sözleşme kaydı değişti")
        handoff.expires_at = now + timedelta(minutes=15)
    else:
        handoff = ZKPreviewHandoff(
            id=uuid.uuid4(), shift_id=shift_id, proof_hash=proof_hash,
            source_snapshot_hash=source_hash, contract_address=registry["contractAddress"],
            verifier_key_sha256=registry["verifierKeySha256"], created_at=now,
            expires_at=now + timedelta(minutes=15),
        )
        db.add(handoff)
    await db.flush()
    return {"handoffId": str(handoff.id), "expiresAt": handoff.expires_at.isoformat(),
        "txHex": prepared["tx_hex"], "network": "preview", "contractAddress": handoff.contract_address,
        "publicClass": request["publicClass"], "toleranceKurus": request["toleranceKurus"],
        "contextDigest": context, "financialCommitment": request["financialCommitment"]}


@router.post("/{shift_id}/zk-preview/intent")
async def register_shift_preview_intent(
    shift_id: uuid.UUID, data: IntentRequest, response: Response,
    current_user: User = Depends(_preview_user),
    db: AsyncSession = Depends(get_db),
):
    response.headers["Cache-Control"] = "no-store"
    shift = await db.scalar(_authorized_shift_query(shift_id, current_user)
                            .with_for_update().execution_options(populate_existing=True))
    handoff = await db.scalar(select(ZKPreviewHandoff).where(
        ZKPreviewHandoff.id == data.handoff_id, ZKPreviewHandoff.shift_id == shift_id,
    ).with_for_update().execution_options(populate_existing=True))
    if shift is None or handoff is None:
        raise HTTPException(status_code=404, detail="Preview handoff bulunamadı")
    if handoff.submitted_tx_id or (handoff.pending_tx_id and handoff.pending_tx_id != data.tx_id):
        raise HTTPException(status_code=409, detail="Farklı işlem zaten gönderiliyor veya bağlandı")
    if handoff.pending_tx_id == data.tx_id:
        return {"pendingTxId": data.tx_id, "handoffId": str(handoff.id)}
    if handoff.expires_at < datetime.now(timezone.utc):
        raise HTTPException(status_code=409, detail="Preview hazırlığı süresi doldu")
    try:
        _, source_hash, context, tolerance = await _snapshot(db, shift)
    except ValueError:
        raise HTTPException(status_code=409, detail="Vardiya kaynağı geçersiz") from None
    if (handoff.proof_hash != shift.zk_proof_hash or handoff.source_snapshot_hash != source_hash
        or not _valid_proof(shift, source_hash, context, tolerance)):
        raise HTTPException(status_code=409, detail="Güncel vardiya proof'u gerekli")
    handoff.pending_tx_id = data.tx_id
    handoff.pending_at = datetime.now(timezone.utc)
    await db.flush()
    return {"pendingTxId": data.tx_id, "handoffId": str(handoff.id)}


@router.post("/{shift_id}/zk-preview/receipt")
async def confirm_shift_preview(
    shift_id: uuid.UUID, data: ReceiptRequest, response: Response,
    current_user: User = Depends(_preview_user),
    db: AsyncSession = Depends(get_db),
):
    response.headers["Cache-Control"] = "no-store"
    shift = await db.scalar(_authorized_shift_query(shift_id, current_user))
    handoff = await db.scalar(select(ZKPreviewHandoff).where(
        ZKPreviewHandoff.id == data.handoff_id, ZKPreviewHandoff.shift_id == shift_id,
    ))
    if shift is None or handoff is None:
        raise HTTPException(status_code=404, detail="Preview handoff bulunamadı")
    if handoff.pending_tx_id != data.tx_id or (handoff.submitted_tx_id and handoff.submitted_tx_id != data.tx_id):
        raise HTTPException(status_code=409, detail="Farklı işlem zaten bağlandı")
    try:
        _, initial_hash, initial_context, initial_tolerance = await _snapshot(db, shift)
    except ValueError:
        raise HTTPException(status_code=409, detail="Vardiya kaynağı geçersiz") from None
    if (handoff.proof_hash != shift.zk_proof_hash or handoff.source_snapshot_hash != initial_hash
        or not _valid_proof(shift, initial_hash, initial_context, initial_tolerance)):
        raise HTTPException(status_code=409, detail="Güncel vardiya proof'u gerekli")
    try:
        observed = await _matching_preview_receipt(shift, handoff, data.tx_id)
    except PreviewHandoffError:
        raise HTTPException(status_code=409, detail="Preview işlemi henüz doğrulanamadı") from None
    locked = await db.scalar(
        _authorized_shift_query(shift_id, current_user)
        .with_for_update().execution_options(populate_existing=True)
    )
    handoff = await db.scalar(select(ZKPreviewHandoff).where(
        ZKPreviewHandoff.id == data.handoff_id, ZKPreviewHandoff.shift_id == shift_id,
    ).with_for_update().execution_options(populate_existing=True))
    if locked is None or handoff is None or handoff.pending_tx_id != data.tx_id or (handoff.submitted_tx_id and handoff.submitted_tx_id != data.tx_id):
        raise HTTPException(status_code=409, detail="Preview handoff değişti")
    try:
        _, source_hash, context, tolerance = await _snapshot(db, locked)
    except ValueError:
        raise HTTPException(status_code=409, detail="Vardiya kaynağı değişti") from None
    if (handoff.proof_hash != locked.zk_proof_hash or handoff.source_snapshot_hash != source_hash
        or not _valid_proof(locked, source_hash, context, tolerance)):
        raise HTTPException(status_code=409, detail="Vardiya proof kaynağı değişti")
    if (observed.get("publicClass") != locked.zk_reconciliation_class.upper()
        or observed.get("financialCommitment") != locked.zk_financial_commitment
        or observed.get("contextDigest") != context.split(":")[-1]
        or observed.get("toleranceKurus") != str(to_kurus_int(tolerance))):
        raise HTTPException(status_code=409, detail="Vardiya public ifadesi değişti")
    handoff.submitted_tx_id = data.tx_id
    handoff.tx_hash = observed["txHash"]
    handoff.block_hash = observed["blockHash"]
    handoff.block_height = observed["blockHeight"]
    handoff.confirmed_at = datetime.now(timezone.utc)
    await db.flush()
    return {"ledgerConfirmed": True, "sourceAuthenticated": False,
        "txId": data.tx_id, "blockHeight": handoff.block_height}


@router.get("/{shift_id}/zk-preview/attestation-request")
async def preview_attestation_request(
    shift_id: uuid.UUID, response: Response,
    current_user: User = Depends(require_role(UserRole.SUPER_ADMIN, UserRole.STATION_MANAGER)),
    db: AsyncSession = Depends(get_db),
):
    response.headers["Cache-Control"] = "no-store"
    shift = await db.scalar(_authorized_shift_query(shift_id, current_user))
    handoff = await db.scalar(select(ZKPreviewHandoff).where(ZKPreviewHandoff.shift_id == shift_id))
    if shift is None or handoff is None:
        raise HTTPException(status_code=404, detail="Preview handoff bulunamadı")
    return {"txId": handoff.submitted_tx_id, "attestation": await _attestable_statement(db, shift, handoff)}


@router.post("/{shift_id}/zk-preview/attest")
async def submit_preview_attestation(
    shift_id: uuid.UUID, data: AttestationSubmission, response: Response,
    current_user: User = Depends(require_role(UserRole.SUPER_ADMIN, UserRole.STATION_MANAGER)),
    db: AsyncSession = Depends(get_db),
):
    response.headers["Cache-Control"] = "no-store"
    # Indexer I/O can take tens of seconds; do not hold database row locks while waiting.
    shift = await db.scalar(_authorized_shift_query(shift_id, current_user))
    handoff = await db.scalar(select(ZKPreviewHandoff).where(ZKPreviewHandoff.shift_id == shift_id))
    if shift is None or handoff is None:
        raise HTTPException(status_code=404, detail="Preview handoff bulunamadı")
    statement = await _attestable_statement(db, shift, handoff)
    tx_id, tx_hash, block_hash, block_height = (
        handoff.submitted_tx_id, handoff.tx_hash, handoff.block_hash, handoff.block_height,
    )
    fingerprints = verify_dual_attestation(
        statement, data.source_signature, data.manager_signature, str(shift.station_id),
    )
    if fingerprints is None:
        raise HTTPException(status_code=409, detail="Bağımsız kaynak ve müdür imzaları doğrulanamadı")
    shift = await db.scalar(_authorized_shift_query(shift_id, current_user)
                            .with_for_update().execution_options(populate_existing=True))
    handoff = await db.scalar(select(ZKPreviewHandoff).where(ZKPreviewHandoff.shift_id == shift_id)
                              .with_for_update().execution_options(populate_existing=True))
    if shift is None or handoff is None:
        raise HTTPException(status_code=409, detail="Preview handoff değişti")
    try:
        _, source_hash, context, tolerance = await _snapshot(db, shift)
    except ValueError:
        raise HTTPException(status_code=409, detail="Vardiya kaynağı değişti") from None
    if (handoff.submitted_tx_id != tx_id or handoff.tx_hash != tx_hash
        or handoff.block_hash != block_hash or handoff.block_height != block_height
        or handoff.proof_hash != shift.zk_proof_hash
        or handoff.source_snapshot_hash != source_hash
        or not _valid_proof(shift, source_hash, context, tolerance)
        or public_statement(shift, handoff) != statement):
        raise HTTPException(status_code=409, detail="Vardiya veya Preview kanıtı değişti")
    if handoff.attested_at is not None:
        if (handoff.source_signature != data.source_signature
            or handoff.manager_signature != data.manager_signature
            or handoff.source_key_fingerprint != fingerprints[0]
            or handoff.manager_key_fingerprint != fingerprints[1]):
            raise HTTPException(status_code=409, detail="Vardiya için farklı kaynak imzaları zaten kaydedildi")
    else:
        handoff.source_signature = data.source_signature
        handoff.manager_signature = data.manager_signature
        handoff.source_key_fingerprint, handoff.manager_key_fingerprint = fingerprints
        handoff.attested_at = datetime.now(timezone.utc)
    # The dynamic status endpoint rechecks the chain and signatures. A persisted
    # verified flag would become stale after a reorg or a trusted-key rotation.
    await db.flush()
    return {"ledgerConfirmed": True, "sourceAuthenticated": True,
        "txId": handoff.submitted_tx_id, "verifiedAt": handoff.attested_at.isoformat()}


@router.get("/{shift_id}/zk-preview/evidence")
async def preview_public_evidence(
    shift_id: uuid.UUID, response: Response,
    current_user: User = Depends(require_role(UserRole.SUPER_ADMIN, UserRole.STATION_MANAGER)),
    db: AsyncSession = Depends(get_db),
):
    response.headers["Cache-Control"] = "no-store"
    shift = await db.scalar(_authorized_shift_query(shift_id, current_user))
    handoff = await db.scalar(select(ZKPreviewHandoff).where(ZKPreviewHandoff.shift_id == shift_id))
    if shift is None or handoff is None:
        raise HTTPException(status_code=404, detail="Preview handoff bulunamadı")
    statement = await _attestable_statement(db, shift, handoff)
    fingerprints = verify_dual_attestation(
        statement, handoff.source_signature or "", handoff.manager_signature or "",
        str(shift.station_id),
    )
    if (fingerprints is None or handoff.attested_at is None
        or fingerprints != (handoff.source_key_fingerprint, handoff.manager_key_fingerprint)):
        raise HTTPException(status_code=409, detail="Bağımsız kaynak imzaları bekleniyor")
    return {"txId": handoff.submitted_tx_id, "attestation": statement,
        "signatures": {"source": handoff.source_signature, "manager": handoff.manager_signature}}


@router.get("/{shift_id}/zk-preview/status")
async def shift_preview_status(
    shift_id: uuid.UUID,
    response: Response,
    current_user: User = Depends(_preview_user),
    db: AsyncSession = Depends(get_db),
):
    response.headers["Cache-Control"] = "no-store"
    shift = await db.scalar(_authorized_shift_query(shift_id, current_user))
    if shift is None:
        raise HTTPException(status_code=404, detail="Vardiya bulunamadı")
    handoff = await db.scalar(select(ZKPreviewHandoff).where(ZKPreviewHandoff.shift_id == shift_id))
    if handoff is None or handoff.submitted_tx_id is None:
        return {"ledgerConfirmed": False, "sourceAuthenticated": False, "txId": None,
            "pendingTxId": handoff.pending_tx_id if handoff else None,
            "handoffId": str(handoff.id) if handoff else None}
    try:
        _, source_hash, context, tolerance = await _snapshot(db, shift)
        current = (handoff.proof_hash == shift.zk_proof_hash
            and handoff.source_snapshot_hash == source_hash
            and _valid_proof(shift, source_hash, context, tolerance))
        if current:
            observed = await _matching_preview_receipt(shift, handoff, handoff.submitted_tx_id)
            current = (observed.get("txHash") == handoff.tx_hash
                and observed.get("blockHash") == handoff.block_hash
                and observed.get("blockHeight") == handoff.block_height)
    except (ValueError, PreviewHandoffError):
        current = False
    authenticated = False
    if current and handoff.attested_at is not None:
        fingerprints = verify_dual_attestation(
            public_statement(shift, handoff),
            handoff.source_signature or "", handoff.manager_signature or "",
            str(shift.station_id),
        )
        authenticated = (fingerprints is not None
            and fingerprints == (handoff.source_key_fingerprint, handoff.manager_key_fingerprint))
    return {"ledgerConfirmed": current,
        "sourceAuthenticated": authenticated, "txId": handoff.submitted_tx_id,
        "blockHeight": handoff.block_height,
        "pendingTxId": None if current else handoff.submitted_tx_id,
        "handoffId": None if current else str(handoff.id)}
