"""
FuelOS — Veresiye Günlük Mutabakat ve Kriptografik Defter Kanıtları API Router'ı.

Yönetici rolleri (SuperAdmin, StationManager) için tam kanal mutabakatı,
vardiya Merkle defter kökü ve satış dahil edilme / seçici açıklama kanıtları sunar.
"""

from __future__ import annotations

import uuid
from datetime import date
from decimal import Decimal

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.dependencies import require_role
from app.database import get_db
from app.models.base import PaymentMethod
from app.models.credit import CreditSale
from app.models.shift import Shift
from app.models.transaction import Transaction
from app.models.user import User
from app.schemas.credit import (
    DailyReconciliation,
    SaleDisclosure,
    SaleInclusionProof,
    ShiftLedgerProof,
)
from app.services import credit_access, credit_commitment, credit_reconciliation

router = APIRouter(prefix="/api/veresiye", tags=["Veresiye Mutabakat"])

ZERO = Decimal("0.00")
KURUS = Decimal("0.01")


@router.get("/reconciliation/daily", response_model=DailyReconciliation)
async def get_daily_reconciliation(
    date_param: date | None = Query(None, alias="date"),
    station_id: uuid.UUID | None = Query(None),
    current_user: User = Depends(require_role(*credit_access.MANAGER_ROLES)),
    db: AsyncSession = Depends(get_db),
):
    """
    Seçili Türkiye günü (Europe/Istanbul) için nakit, POS, EFT, kurumsal ve bireysel
    veresiye kanallarını birleştiren günlük mutabakat raporunu döndürür.
    """
    return await credit_reconciliation.build_daily_reconciliation(
        db,
        user=current_user,
        target_date=date_param,
        station_id=station_id,
    )


@router.get("/proofs/shifts/{shift_id}", response_model=ShiftLedgerProof)
async def get_shift_ledger_proof(
    shift_id: uuid.UUID,
    current_user: User = Depends(require_role(*credit_access.MANAGER_ROLES)),
    db: AsyncSession = Depends(get_db),
):
    """
    Bir vardiyadaki tüm `CreditSale` taahhütlerinden RFC 6962 Merkle kökü üretir.

    Not: Açık vardiyalarda yeni veresiye satış eklendikçe Merkle kökü güncellenir;
    kapalı vardiyalarda vardiya kapanış anındaki veresiye defteri bütünlüğünü özetler.
    """
    shift = await db.scalar(
        select(Shift).where(
            Shift.id == shift_id,
            Shift.station_id.in_(credit_access.accessible_station_ids(current_user)),
        )
    )
    if shift is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Vardiya bulunamadı veya erişim yetkiniz yok",
        )

    sale_rows = (
        await db.execute(
            select(CreditSale.id, CreditSale.commitment, CreditSale.amount).where(
                CreditSale.shift_id == shift.id
            )
        )
    ).all()

    ledger = credit_commitment.build_shift_ledger(
        str(shift.id),
        [(str(r.id), r.commitment) for r in sale_rows],
    )
    ledger_total = sum((Decimal(str(r.amount)) for r in sale_rows), ZERO).quantize(KURUS)
    recorded_raw = await db.scalar(
        select(func.coalesce(func.sum(Transaction.amount), 0)).where(
            Transaction.shift_id == shift.id,
            Transaction.payment_method == PaymentMethod.VERESIYE,
        )
    )
    recorded_total = Decimal(str(recorded_raw or 0)).quantize(KURUS)

    zk_status = getattr(shift, "zk_proof_status", "none") or "none"
    if zk_status == "verified":
        zk_status = "proved"

    return ShiftLedgerProof(
        shift_id=shift.id,
        leaf_count=ledger.leaf_count,
        merkle_root=ledger.merkle_root,
        statement_digest=ledger.statement_digest,
        ledger_matches_recorded_credit=(ledger_total == recorded_total),
        zk_proof_status=zk_status,
        zk_financial_commitment=getattr(shift, "zk_financial_commitment", None),
    )


@router.get("/proofs/sales/{sale_id}", response_model=SaleInclusionProof)
async def get_sale_inclusion_proof(
    sale_id: uuid.UUID,
    disclose: bool = Query(False),
    current_user: User = Depends(require_role(*credit_access.MANAGER_ROLES)),
    db: AsyncSession = Depends(get_db),
):
    """
    Tek bir veresiye satış kaydının ait olduğu vardiya Merkle ağacına dahil
    edildiğini gösteren kanıt yolunu döndürür. Varsayılan olarak `disclosure=None`
    ile T.C./tutar/nonce açıklanmaz; `disclose=true` seçici açıklama üretir.
    """
    sale = await credit_access.get_credit_sale(db, current_user, sale_id)
    sale_rows = (
        await db.execute(
            select(CreditSale.id, CreditSale.commitment).where(
                CreditSale.shift_id == sale.shift_id
            )
        )
    ).all()

    ledger = credit_commitment.build_shift_ledger(
        str(sale.shift_id),
        [(str(r.id), r.commitment) for r in sale_rows],
    )
    leaf_index = ledger.ordered_sale_ids.index(str(sale.id))
    merkle_path = credit_commitment.merkle_inclusion_path(
        ledger.ordered_commitments, leaf_index
    )

    if not credit_commitment.verify_merkle_inclusion(
        sale.commitment,
        leaf_index,
        ledger.leaf_count,
        merkle_path,
        ledger.merkle_root,
    ):
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Merkle dahil edilme kanıtı doğrulanamadı",
        )

    disclosure_obj: SaleDisclosure | None = None
    if disclose:
        leaf = credit_commitment.leaf_from_record(sale)
        if not credit_commitment.verify_sale_commitment(
            leaf, sale.commitment_nonce, sale.commitment
        ):
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Kayıt taahhüdüyle uyuşmuyor (kayıt sonradan değişmiş olabilir)",
            )
        disclosure_obj = SaleDisclosure(
            sale_id=sale.id,
            transaction_id=sale.transaction_id,
            shift_id=sale.shift_id,
            station_id=sale.station_id,
            account_type=sale.account_type,
            account_id=uuid.UUID(leaf.account_id),
            plate=leaf.plate,
            driver_id=sale.driver_id,
            fuel_type=leaf.fuel_type,
            liters_ml=leaf.liters_ml,
            amount_kurus=leaf.amount_kurus,
            sale_time=leaf.sale_time,
            nonce=sale.commitment_nonce,
        )

    return SaleInclusionProof(
        credit_sale_id=sale.id,
        shift_id=sale.shift_id,
        leaf_index=leaf_index,
        leaf_count=ledger.leaf_count,
        commitment=sale.commitment,
        merkle_path=merkle_path,
        merkle_root=ledger.merkle_root,
        statement_digest=ledger.statement_digest,
        disclosure=disclosure_obj,
    )
