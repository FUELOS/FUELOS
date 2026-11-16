"""
FuelOS — Veresiye Belge (İmzalı Fiş ve Kimlik Fotoğrafı) API Router'ı.

Bireysel müşteri kimlik fotoğrafı yükleme, veresiye satışa imzalı fiş ekleme
ve şifreli belgeleri yetki kontrollü olarak çözüp sunma uç noktaları.
"""

from __future__ import annotations

import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, File, HTTPException, Response, UploadFile, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.dependencies import get_current_user
from app.database import get_db
from app.models.base import CreditAccountType, CreditDocumentKind, UserRole
from app.models.credit import CreditCustomer, CreditDocument, CreditSale
from app.models.user import User
from app.schemas.credit import CreditCustomerDetail, CreditSaleResponse
from app.services import credit_access, credit_documents, credit_ledger, pii

router = APIRouter(prefix="/api/veresiye", tags=["Veresiye Belgeler"])


@router.post("/customers/{customer_id}/id-photo", response_model=CreditCustomerDetail)
async def upload_customer_id_photo(
    customer_id: uuid.UUID,
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Bireysel müşteri için kimlik fotoğrafı yükler.
    Kasiyer yalnızca kimlik fotoğrafı henüz yoksa yükleyebilir; mevcut fotoğrafı
    değiştirme yetkisi yalnızca yöneticilerdedir.
    """
    customer = await credit_access.get_credit_customer(db, current_user, customer_id, lock=True)
    if not credit_access.is_manager(current_user) and customer.id_photo_document_id is not None:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Mevcut kimlik fotoğrafını yalnızca yönetici değiştirebilir",
        )

    doc = await credit_documents.store_document(
        db,
        station_id=customer.station_id,
        kind=CreditDocumentKind.ID_PHOTO.value,
        upload=file,
        uploaded_by=current_user.id,
    )
    customer.id_photo_document_id = doc.id
    await db.flush()
    await db.refresh(customer)

    balance = None
    if credit_access.is_manager(current_user):
        totals_map = await credit_ledger.account_totals(
            db, CreditAccountType.INDIVIDUAL, [customer.id]
        )
        totals = totals_map.get(customer.id, credit_ledger.AccountTotals())
        balance = credit_ledger.to_balance_schema(totals, credit_limit=customer.credit_limit)

    return CreditCustomerDetail(
        id=customer.id,
        station_id=customer.station_id,
        full_name=customer.full_name,
        tc_masked=pii.masked_tc_from_token(customer.tc_encrypted),
        phone=customer.phone,
        plate=customer.plate,
        is_active=customer.is_active,
        has_id_photo=customer.has_id_photo,
        id_photo_document_id=customer.id_photo_document_id,
        credit_limit=customer.credit_limit if balance is not None else None,
        notes=customer.notes,
        balance=balance,
        created_at=customer.created_at,
        updated_at=customer.updated_at,
    )


@router.post("/sales/{sale_id}/receipt", response_model=CreditSaleResponse)
async def upload_sale_receipt(
    sale_id: uuid.UUID,
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Veresiye satış kaydına T.C. no yazılı ve imzalı fiş fotoğrafı/PDF'i yükler.
    Kasiyer yalnızca kendi oluşturduğu satışa ve daha önce fiş yüklenmemişse yükleyebilir.
    """
    sale = await credit_access.get_credit_sale(db, current_user, sale_id, lock=True)
    if not credit_access.is_manager(current_user) and sale.receipt_document_id is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Bu satış için imzalı fiş zaten yüklenmiş; değiştirmek için yönetici yetkisi gerekir",
        )

    doc = await credit_documents.store_document(
        db,
        station_id=sale.station_id,
        kind=CreditDocumentKind.RECEIPT.value,
        upload=file,
        uploaded_by=current_user.id,
    )
    sale.receipt_document_id = doc.id
    sale.receipt_uploaded_at = datetime.now(timezone.utc)
    await db.flush()
    await db.refresh(sale)
    return CreditSaleResponse.model_validate(sale)


@router.get("/documents/{document_id}")
async def download_document(
    document_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Yüklenmiş şifreli belgeyi yetki kontrolünden geçirerek ham baytlarıyla döndürür.
    Kimlik fotoğraflarını yalnızca yöneticiler, fişleri ise yöneticiler veya
    fişin ait olduğu satışı oluşturan kasiyer görüntüleyebilir.
    """
    doc = await db.scalar(
        select(CreditDocument).where(
            CreditDocument.id == document_id,
            CreditDocument.station_id.in_(credit_access.accessible_station_ids(current_user)),
        )
    )
    if doc is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Belge bulunamadı veya erişim yetkiniz yok",
        )

    if current_user.role == UserRole.CASHIER:
        if doc.kind == CreditDocumentKind.ID_PHOTO.value:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Kimlik fotoğraflarını yalnızca yöneticiler görüntüleyebilir",
            )
        owned_sale_id = await db.scalar(
            select(CreditSale.id).where(
                CreditSale.receipt_document_id == doc.id,
                CreditSale.created_by == current_user.id,
            )
        )
        if owned_sale_id is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Belge bulunamadı veya erişim yetkiniz yok",
            )

    content = await credit_documents.read_document(doc)
    return Response(
        content=content,
        media_type=doc.content_type,
        headers={
            "Cache-Control": "no-store",
            "X-Content-Type-Options": "nosniff",
            # PDF içindeki gömülü betikler API kökeninde çalışmasın.
            "Content-Security-Policy": "sandbox; default-src 'none'; img-src 'self' data:",
            "Content-Disposition": "attachment" if doc.content_type == "application/pdf" else "inline",
        },
    )
