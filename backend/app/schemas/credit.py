"""
FuelOS — Dijital Veresiye ve Borç Takip API şemaları.

Bu dosya `/api/veresiye/*` uç noktalarının sözleşmesidir; frontend tipleri
(`frontend/src/types/veresiye.ts`) birebir bunu yansıtır.

Mahremiyet kuralları:
- T.C. kimlik no yalnızca İSTEK gövdelerinde (`tc_no`, `driver_tc`, `customer_tc`)
  tam olarak bulunur. YANIT şemalarında yalnızca maskeli hâli (`tc_masked`) vardır.
- Bakiye/ekstre alanları yalnızca yönetici rollerine doldurulur; kasiyerde None.
- `commitment_nonce` hiçbir genel yanıta girmez (yalnızca `SaleDisclosure`).
"""

import uuid
from datetime import date, datetime
from decimal import Decimal
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

from app.models.base import CollectionMethod, CreditAccountType, CreditEntryKind
from app.services.pii import PIIError, normalize_plate, normalize_tc

Money = Decimal

# ─────────────────────────── ORTAK DOĞRULAYICILAR ───────────────────────────


def _clean_required(value: str, label: str) -> str:
    cleaned = (value or "").strip()
    if not cleaned:
        raise ValueError(f"{label} boş olamaz")
    return cleaned


def _clean_optional(value: str | None) -> str | None:
    if value is None:
        return None
    cleaned = value.strip()
    return cleaned or None


def _validate_tc(value: str) -> str:
    try:
        return normalize_tc(value)
    except PIIError as exc:
        raise ValueError(str(exc)) from None


def _validate_plate(value: str) -> str:
    try:
        return normalize_plate(value)
    except PIIError as exc:
        raise ValueError(str(exc)) from None


class _ORM(BaseModel):
    model_config = ConfigDict(from_attributes=True)


# ─────────────────────────── BAKİYE ───────────────────────────


class CreditOverview(BaseModel):
    corporate_receivable: Money
    individual_receivable: Money
    company_count: int
    customer_count: int


class AccountBalance(BaseModel):
    """Cari hesap özeti. `balance` > 0 → müşterinin istasyona borcu."""
    total_sales: Money = Decimal("0.00")
    total_payments: Money = Decimal("0.00")
    total_adjustments: Money = Decimal("0.00")
    balance: Money = Decimal("0.00")
    sale_count: int = 0
    total_liters: Decimal = Decimal("0.000")
    last_sale_at: datetime | None = None
    last_payment_at: datetime | None = None
    # Yalnızca vade tanımlıysa hesaplanır (FIFO ile vadesi geçmiş açık tutar).
    overdue_amount: Money | None = None
    # Yalnızca limit tanımlıysa: limit − bakiye (negatif olabilir).
    credit_limit_remaining: Money | None = None


# ─────────────────────────── KURUMSAL: ARAÇ & SÜRÜCÜ ───────────────────────────


class VehicleCreate(BaseModel):
    plate: str
    description: str | None = Field(default=None, max_length=255)

    _plate = field_validator("plate")(_validate_plate)
    _description = field_validator("description")(_clean_optional)


class VehicleUpdate(BaseModel):
    plate: str | None = None
    description: str | None = Field(default=None, max_length=255)
    is_active: bool | None = None

    @field_validator("plate")
    @classmethod
    def _plate(cls, v):
        return None if v is None else _validate_plate(v)


class VehicleResponse(_ORM):
    id: uuid.UUID
    credit_company_id: uuid.UUID
    plate: str
    description: str | None = None
    is_active: bool
    created_at: datetime


class DriverCreate(BaseModel):
    full_name: str = Field(max_length=255)
    tc_no: str
    phone: str | None = Field(default=None, max_length=20)

    _tc = field_validator("tc_no")(_validate_tc)
    _phone = field_validator("phone")(_clean_optional)

    @field_validator("full_name")
    @classmethod
    def _name(cls, v):
        return _clean_required(v, "Sürücü adı")


class DriverUpdate(BaseModel):
    full_name: str | None = Field(default=None, max_length=255)
    tc_no: str | None = None
    phone: str | None = Field(default=None, max_length=20)
    is_active: bool | None = None

    @field_validator("tc_no")
    @classmethod
    def _tc(cls, v):
        return None if v is None else _validate_tc(v)

    @field_validator("full_name")
    @classmethod
    def _name(cls, v):
        return None if v is None else _clean_required(v, "Sürücü adı")


class DriverResponse(BaseModel):
    """Sürücü — T.C. kimlik no yalnızca maskeli döner."""
    id: uuid.UUID
    credit_company_id: uuid.UUID
    full_name: str
    tc_masked: str
    phone: str | None = None
    is_active: bool
    created_at: datetime


# ─────────────────────────── KURUMSAL: ŞİRKET ───────────────────────────


class CreditCompanyCreate(BaseModel):
    """Aşama 1 — Şirket kaydı. Limit ve vade opsiyoneldir."""
    station_id: uuid.UUID | None = None  # SuperAdmin için zorunlu; Müdür'de yok sayılır
    name: str = Field(max_length=255)
    tax_number: str | None = Field(default=None, max_length=20)
    tax_office: str | None = Field(default=None, max_length=100)
    address: str | None = Field(default=None, max_length=500)
    contact_name: str | None = Field(default=None, max_length=255)
    phone: str | None = Field(default=None, max_length=20)
    email: str | None = Field(default=None, max_length=255)
    credit_limit: Money | None = Field(default=None, ge=0, max_digits=14, decimal_places=2)
    payment_term_days: int | None = Field(default=None, ge=1, le=365)
    notes: str | None = None
    vehicles: list[VehicleCreate] = Field(default_factory=list)
    drivers: list[DriverCreate] = Field(default_factory=list)

    _optional = field_validator(
        "tax_number", "tax_office", "address", "contact_name", "phone", "email", "notes",
    )(_clean_optional)

    @field_validator("name")
    @classmethod
    def _name(cls, v):
        return _clean_required(v, "Şirket adı")


class CreditCompanyUpdate(BaseModel):
    name: str | None = Field(default=None, max_length=255)
    tax_number: str | None = Field(default=None, max_length=20)
    tax_office: str | None = Field(default=None, max_length=100)
    address: str | None = Field(default=None, max_length=500)
    contact_name: str | None = Field(default=None, max_length=255)
    phone: str | None = Field(default=None, max_length=20)
    email: str | None = Field(default=None, max_length=255)
    # None göndermek limiti/vadeyi kaldırır (exclude_unset ile ayırt edilir).
    credit_limit: Money | None = Field(default=None, ge=0, max_digits=14, decimal_places=2)
    payment_term_days: int | None = Field(default=None, ge=1, le=365)
    notes: str | None = None

    @field_validator("name")
    @classmethod
    def _name(cls, v):
        return None if v is None else _clean_required(v, "Şirket adı")


class CreditCompanyAuthorizationUpdate(BaseModel):
    """Yakıt alım yetkisini sonlandırma / yeniden açma."""
    authorized: bool
    reason: str | None = Field(default=None, max_length=500)

    _reason = field_validator("reason")(_clean_optional)


class CreditCompanySummary(BaseModel):
    """Liste öğesi. `balance` yalnızca yönetici rollerinde doludur."""
    id: uuid.UUID
    station_id: uuid.UUID
    name: str
    tax_number: str | None = None
    contact_name: str | None = None
    phone: str | None = None
    is_authorized: bool
    authorization_ended_at: datetime | None = None
    credit_limit: Money | None = None
    payment_term_days: int | None = None
    vehicle_count: int = 0
    driver_count: int = 0
    balance: AccountBalance | None = None
    created_at: datetime


class CreditCompanyDetail(CreditCompanySummary):
    tax_office: str | None = None
    address: str | None = None
    email: str | None = None
    notes: str | None = None
    authorization_end_reason: str | None = None
    vehicles: list[VehicleResponse] = Field(default_factory=list)
    drivers: list[DriverResponse] = Field(default_factory=list)
    updated_at: datetime


# ─────────────────────────── KURUMSAL: ARAÇ/SÜRÜCÜ DOĞRULAMA ───────────────────────────

VerifyReason = Literal[
    "plate_not_registered",    # plaka bu istasyonda hiçbir şirkete kayıtlı değil
    "vehicle_inactive",        # araç pasife alınmış
    "company_not_authorized",  # şirketin yakıt alım yetkisi sonlandırılmış
    "driver_required",         # sürücü seçilmedi / T.C. girilmedi
    "driver_not_found",        # sürücü bu şirkette kayıtlı değil
    "driver_inactive",         # sürücü pasife alınmış
    "driver_tc_mismatch",      # girilen T.C. kayıtlı sürücüyle eşleşmiyor
    "credit_limit_exceeded",   # tanımlı kredi limiti aşılıyor
]


class VerifyRequest(BaseModel):
    """
    Aşama 2 — Yakıt alımı öncesi kontrol. Plaka zorunlu; sürücü `driver_tc`
    (kimlikten okunan T.C. no) ve/veya `driver_id` ile belirtilir.
    """
    plate: str
    driver_tc: str | None = None
    driver_id: uuid.UUID | None = None
    station_id: uuid.UUID | None = None  # yalnızca SuperAdmin için
    amount: Money | None = Field(default=None, gt=0)  # verilirse limit kontrolü yapılır

    _plate = field_validator("plate")(_validate_plate)

    @field_validator("driver_tc")
    @classmethod
    def _tc(cls, v):
        return None if v in (None, "") else _validate_tc(v)


class VerifyCompany(BaseModel):
    id: uuid.UUID
    name: str
    is_authorized: bool


class VerifyResponse(BaseModel):
    plate: str
    authorized: bool                     # satış yapılabilir mi (tüm kontroller geçti)
    identity_verified: bool              # sürücü T.C. no kayıtla eşleşti mi
    reasons: list[VerifyReason] = Field(default_factory=list)
    company: VerifyCompany | None = None
    vehicle: VehicleResponse | None = None
    drivers: list[DriverResponse] = Field(default_factory=list)  # şirketin aktif sürücüleri
    matched_driver: DriverResponse | None = None


# ─────────────────────────── BİREYSEL MÜŞTERİ ───────────────────────────


class CreditCustomerCreate(BaseModel):
    """Aşama 1 — Bireysel müşteri kaydı. Kimlik fotoğrafı ayrı uç noktadan yüklenir."""
    station_id: uuid.UUID | None = None  # SuperAdmin için zorunlu
    full_name: str = Field(max_length=255)
    tc_no: str
    phone: str = Field(max_length=20)
    plate: str | None = None
    credit_limit: Money | None = Field(default=None, ge=0, max_digits=14, decimal_places=2)
    notes: str | None = None

    _tc = field_validator("tc_no")(_validate_tc)
    _notes = field_validator("notes")(_clean_optional)

    @field_validator("full_name")
    @classmethod
    def _name(cls, v):
        return _clean_required(v, "Ad soyad")

    @field_validator("phone")
    @classmethod
    def _phone(cls, v):
        return _clean_required(v, "Cep telefonu")

    @field_validator("plate")
    @classmethod
    def _plate(cls, v):
        return None if v in (None, "") else _validate_plate(v)


class CreditCustomerUpdate(BaseModel):
    full_name: str | None = Field(default=None, max_length=255)
    phone: str | None = Field(default=None, max_length=20)
    plate: str | None = None
    is_active: bool | None = None
    credit_limit: Money | None = Field(default=None, ge=0, max_digits=14, decimal_places=2)
    notes: str | None = None

    @field_validator("full_name")
    @classmethod
    def _name(cls, v):
        return None if v is None else _clean_required(v, "Ad soyad")

    @field_validator("phone")
    @classmethod
    def _phone(cls, v):
        return None if v is None else _clean_required(v, "Cep telefonu")

    @field_validator("plate")
    @classmethod
    def _plate(cls, v):
        return None if v in (None, "") else _validate_plate(v)


class CreditCustomerSummary(BaseModel):
    id: uuid.UUID
    station_id: uuid.UUID
    full_name: str
    tc_masked: str
    phone: str
    plate: str | None = None
    is_active: bool
    has_id_photo: bool = False
    id_photo_document_id: uuid.UUID | None = None
    credit_limit: Money | None = None
    balance: AccountBalance | None = None
    created_at: datetime


class CreditCustomerDetail(CreditCustomerSummary):
    notes: str | None = None
    updated_at: datetime


# ─────────────────────────── BELGELER ───────────────────────────


class CreditDocumentResponse(_ORM):
    id: uuid.UUID
    kind: Literal["receipt", "id_photo"]
    content_type: str
    size_bytes: int
    sha256: str
    created_at: datetime


# ─────────────────────────── VERESİYE SATIŞ ───────────────────────────


class CreditSaleInput(BaseModel):
    """
    Veresiye satışın cari hesap bilgisi. `POST /api/transactions` gövdesinde
    `payment_method = "veresiye"` iken `credit` alanında ZORUNLUDUR.

    Kurumsal: `credit_company_id` + araç (`vehicle_id` veya `plate`) + sürücü
              (`driver_id`) + `driver_tc` (kimlikten okunan T.C. — eşleşmeli).
    Bireysel: `credit_customer_id`; `customer_tc` verilirse kayıtla eşleşmelidir.
    """
    account_type: CreditAccountType
    credit_company_id: uuid.UUID | None = None
    vehicle_id: uuid.UUID | None = None
    plate: str | None = None
    driver_id: uuid.UUID | None = None
    driver_tc: str | None = None
    credit_customer_id: uuid.UUID | None = None
    customer_tc: str | None = None

    @field_validator("plate")
    @classmethod
    def _plate(cls, v):
        return None if v in (None, "") else _validate_plate(v)

    @field_validator("driver_tc", "customer_tc")
    @classmethod
    def _tc(cls, v):
        return None if v in (None, "") else _validate_tc(v)

    @model_validator(mode="after")
    def _account_fields(self):
        if self.account_type == CreditAccountType.CORPORATE:
            if self.credit_company_id is None:
                raise ValueError("Kurumsal veresiye için şirket seçimi zorunludur")
            if self.credit_customer_id is not None:
                raise ValueError("Kurumsal veresiye satışında bireysel müşteri belirtilemez")
            if self.vehicle_id is None and self.plate is None:
                raise ValueError("Kurumsal veresiye için araç plakası zorunludur")
            if self.driver_id is None:
                raise ValueError("Kurumsal veresiye için yetkili sürücü seçimi zorunludur")
            if self.driver_tc is None:
                raise ValueError("Sürücünün T.C. kimlik numarası doğrulama için zorunludur")
        else:
            if self.credit_customer_id is None:
                raise ValueError("Bireysel veresiye için müşteri seçimi zorunludur")
            if self.credit_company_id is not None or self.vehicle_id is not None or self.driver_id is not None:
                raise ValueError("Bireysel veresiye satışında şirket/araç/sürücü belirtilemez")
        return self


class CreditSaleLinkRequest(BaseModel):
    """
    Cari hesaba bağlanmamış mevcut bir veresiye işlemini sonradan hesaba bağlar
    (yalnızca yönetici). Sürücü/müşteri o an istasyonda olmadığından kimlik
    doğrulaması yapılamaz: kayıt `identity_verified = false` olarak işlenir ve
    günlük mutabakatta uyarı olarak görünür.
    """
    transaction_id: uuid.UUID
    account_type: CreditAccountType
    credit_company_id: uuid.UUID | None = None
    vehicle_id: uuid.UUID | None = None
    plate: str | None = None
    driver_id: uuid.UUID | None = None
    credit_customer_id: uuid.UUID | None = None

    @field_validator("plate")
    @classmethod
    def _plate(cls, v):
        return None if v in (None, "") else _validate_plate(v)

    @model_validator(mode="after")
    def _account_fields(self):
        if self.account_type == CreditAccountType.CORPORATE:
            if self.credit_company_id is None or self.credit_customer_id is not None:
                raise ValueError("Kurumsal veresiye için yalnızca şirket belirtilmelidir")
        else:
            if self.credit_customer_id is None:
                raise ValueError("Bireysel veresiye için müşteri seçimi zorunludur")
            if self.credit_company_id is not None or self.vehicle_id is not None or self.driver_id is not None:
                raise ValueError("Bireysel veresiye kaydında şirket/araç/sürücü belirtilemez")
        return self


class CreditSaleBrief(_ORM):
    """`TransactionResponse.credit_sale` içinde dönen kısa özet."""
    id: uuid.UUID
    account_type: CreditAccountType
    account_name: str | None = None
    credit_company_id: uuid.UUID | None = None
    credit_customer_id: uuid.UUID | None = None
    plate: str | None = None
    driver_name: str | None = None
    identity_verified: bool = False
    has_receipt: bool = False
    receipt_document_id: uuid.UUID | None = None


class CreditSaleResponse(_ORM):
    """Aşama 3 — İşlem kaydı: şirket/müşteri, plaka, sürücü, yakıt türü, litre, tutar, tarih."""
    id: uuid.UUID
    transaction_id: uuid.UUID
    station_id: uuid.UUID
    shift_id: uuid.UUID
    account_type: CreditAccountType
    credit_company_id: uuid.UUID | None = None
    credit_customer_id: uuid.UUID | None = None
    account_name: str | None = None
    vehicle_id: uuid.UUID | None = None
    plate: str | None = None
    driver_id: uuid.UUID | None = None
    driver_name: str | None = None
    identity_verified: bool
    amount: Money
    liters: Decimal | None = None
    fuel_type: str | None = None
    sale_time: datetime
    has_receipt: bool
    receipt_document_id: uuid.UUID | None = None
    receipt_uploaded_at: datetime | None = None
    commitment: str
    created_at: datetime


# ─────────────────────────── TAHSİLAT ───────────────────────────


class CreditPaymentCreate(BaseModel):
    """Tahsilat (kind=payment, tutar > 0) veya düzeltme (kind=adjustment, tutar ≠ 0, not zorunlu)."""
    account_type: CreditAccountType
    credit_company_id: uuid.UUID | None = None
    credit_customer_id: uuid.UUID | None = None
    kind: CreditEntryKind = CreditEntryKind.PAYMENT
    amount: Money = Field(max_digits=12, decimal_places=2)
    method: CollectionMethod = CollectionMethod.CASH
    payment_date: datetime | None = None  # None ise sunucu zamanı
    reference: str | None = Field(default=None, max_length=100)
    note: str | None = Field(default=None, max_length=500)

    _optional = field_validator("reference", "note")(_clean_optional)

    @model_validator(mode="after")
    def _rules(self):
        if self.account_type == CreditAccountType.CORPORATE:
            if self.credit_company_id is None or self.credit_customer_id is not None:
                raise ValueError("Kurumsal tahsilat için yalnızca şirket belirtilmelidir")
        elif self.credit_customer_id is None or self.credit_company_id is not None:
            raise ValueError("Bireysel tahsilat için yalnızca müşteri belirtilmelidir")
        if self.kind == CreditEntryKind.PAYMENT:
            if self.amount <= 0:
                raise ValueError("Tahsilat tutarı sıfırdan büyük olmalıdır")
        else:
            if self.amount == 0:
                raise ValueError("Düzeltme tutarı sıfır olamaz")
            if not self.note:
                raise ValueError("Düzeltme kaydı için açıklama zorunludur")
        return self


class CreditPaymentVoid(BaseModel):
    reason: str = Field(max_length=500)

    @field_validator("reason")
    @classmethod
    def _reason(cls, v):
        return _clean_required(v, "İptal gerekçesi")


class CreditPaymentResponse(_ORM):
    id: uuid.UUID
    station_id: uuid.UUID
    account_type: CreditAccountType
    credit_company_id: uuid.UUID | None = None
    credit_customer_id: uuid.UUID | None = None
    account_name: str | None = None
    kind: CreditEntryKind
    amount: Money
    method: CollectionMethod
    payment_date: datetime
    reference: str | None = None
    note: str | None = None
    recorded_by: uuid.UUID | None = None
    voided_at: datetime | None = None
    void_reason: str | None = None
    created_at: datetime


# ─────────────────────────── EKSTRE (DİJİTAL VERESİYE DEFTERİ) ───────────────────────────


class StatementEntry(BaseModel):
    """Defter satırı. `debit` borç (satış), `credit` alacak (tahsilat/düzeltme)."""
    entry_type: Literal["sale", "payment", "adjustment"]
    id: uuid.UUID
    date: datetime
    description: str
    debit: Money = Decimal("0.00")
    credit: Money = Decimal("0.00")
    balance_after: Money
    # Yalnızca satış satırlarında:
    plate: str | None = None
    driver_name: str | None = None
    fuel_type: str | None = None
    liters: Decimal | None = None
    identity_verified: bool | None = None
    has_receipt: bool | None = None
    receipt_document_id: uuid.UUID | None = None
    # Yalnızca tahsilat/düzeltme satırlarında:
    method: CollectionMethod | None = None
    reference: str | None = None


class VehicleBreakdown(BaseModel):
    """Hangi araç ne kadar yakıt aldı."""
    vehicle_id: uuid.UUID | None = None
    plate: str
    sale_count: int
    liters: Decimal
    amount: Money
    last_sale_at: datetime | None = None


class PeriodSpending(BaseModel):
    """Günlük ('YYYY-MM-DD') veya aylık ('YYYY-MM') harcama — Türkiye saatiyle gruplanır."""
    period: str
    sale_count: int
    liters: Decimal
    amount: Money


class AccountStatement(BaseModel):
    """Aşama 4 — Borç takibi: toplam alım, araç kırılımı, günlük/aylık harcama, bakiye."""
    account_type: CreditAccountType
    account_id: uuid.UUID
    account_name: str
    date_from: date | None = None
    date_to: date | None = None
    opening_balance: Money          # date_from öncesi devreden bakiye
    period_sales: Money             # dönem içi toplam alım
    period_payments: Money          # realized collections in the period
    period_adjustments: Money = Decimal("0.00")
    closing_balance: Money          # dönem sonu bakiye
    balance: AccountBalance         # hesabın güncel (tüm zamanlar) özeti
    entries: list[StatementEntry] = Field(default_factory=list)
    vehicle_breakdown: list[VehicleBreakdown] = Field(default_factory=list)
    daily_spending: list[PeriodSpending] = Field(default_factory=list)
    monthly_spending: list[PeriodSpending] = Field(default_factory=list)


# ─────────────────────────── GÜNLÜK MUTABAKAT ───────────────────────────

SalesChannel = Literal[
    "cash", "credit_card", "eft",
    "corporate_veresiye", "individual_veresiye", "unlinked_veresiye",
]

IssueCode = Literal[
    "unlinked_veresiye",         # veresiye satışı hiçbir cari hesaba bağlı değil (error)
    "amount_mismatch",           # defter tutarı satış/otomasyon kaydıyla uyuşmuyor (error)
    "orphan_ledger_entry",       # defter kaydının satış kaydı veresiye değil / uyumsuz (error)
    "missing_receipt",           # imzalı fiş fotoğrafı yüklenmemiş (warning)
    "identity_unverified",       # sürücü/müşteri kimliği satışta doğrulanmamış (warning)
    "declared_credit_mismatch",  # kapanışta ilan edilen veresiye, kayıtla uyuşmuyor (warning)
    "missing_id_photo",          # bireysel müşterinin kimlik fotoğrafı yok (warning)
]


class ChannelTotal(BaseModel):
    channel: SalesChannel
    amount: Money = Decimal("0.00")
    count: int = 0
    liters: Decimal = Decimal("0.000")


class ReconciliationIssue(BaseModel):
    code: IssueCode
    severity: Literal["error", "warning"]
    message: str
    transaction_id: uuid.UUID | None = None
    credit_sale_id: uuid.UUID | None = None
    shift_id: uuid.UUID | None = None
    account_name: str | None = None
    amount: Money | None = None
    occurred_at: datetime | None = None


class ShiftCreditBreakdown(BaseModel):
    """Bir vardiyanın veresiye kanalı dökümü (`ShiftResponse.credit_breakdown`)."""
    corporate: Money = Decimal("0.00")
    individual: Money = Decimal("0.00")
    unlinked: Money = Decimal("0.00")
    sale_count: int = 0
    missing_receipt_count: int = 0


class ShiftCreditCheck(BaseModel):
    shift_id: uuid.UUID
    worker_name: str | None = None
    shift_status: Literal["open", "closed"]
    start_time: datetime
    end_time: datetime | None = None
    recorded_credit: Money      # satış/otomasyon kayıtlarındaki veresiye toplamı
    ledger_credit: Money        # cari deftere işlenen veresiye toplamı
    corporate_credit: Money
    individual_credit: Money
    unlinked_credit: Money
    declared_credit: Money | None = None       # kapanışta ilan edilen (DEC-002)
    declared_difference: Money | None = None   # kayıtlı − ilan
    sale_count: int = 0
    missing_receipt_count: int = 0


class CollectionTotal(BaseModel):
    method: CollectionMethod
    amount: Money = Decimal("0.00")
    count: int = 0


class DailyReconciliation(BaseModel):
    """
    Günlük mutabakat: nakit, kredi kartı, FAST/EFT, kurumsal ve bireysel veresiye
    satışları birlikte değerlendirilir; satış/otomasyon kayıtları cari defterle
    karşılaştırılır ve eksik/eşleşmeyen işlemler listelenir.
    """
    date: date
    station_id: uuid.UUID | None = None
    station_name: str
    channels: list[ChannelTotal]
    total_sales: Money
    total_liters: Decimal
    transaction_count: int
    automation_veresiye_total: Money   # satış kayıtlarındaki tüm veresiye
    ledger_veresiye_total: Money       # cari deftere işlenen veresiye
    veresiye_difference: Money         # automation − ledger (0 olmalı)
    corporate_veresiye_total: Money
    individual_veresiye_total: Money
    unlinked_veresiye_total: Money
    missing_receipt_count: int
    collections: list[CollectionTotal] = Field(default_factory=list)  # günün tahsilatları (bilgi)
    collections_total: Money = Decimal("0.00")
    shifts: list[ShiftCreditCheck] = Field(default_factory=list)
    issues: list[ReconciliationIssue] = Field(default_factory=list)
    # matched: sorun yok · attention: yalnızca uyarılar · mismatch: en az bir hata
    status: Literal["matched", "attention", "mismatch"]


# ─────────────────────────── MAHREMİYET / KANIT ───────────────────────────


class ShiftLedgerProof(BaseModel):
    """Vardiyanın veresiye defteri taahhüdü. Kimlik, plaka veya tutar içermez."""
    shift_id: uuid.UUID
    leaf_count: int
    merkle_root: str
    statement_digest: str
    # Defter toplamı, ZK mutabakat tanığına giren kayıtlı veresiye toplamıyla aynı mı.
    ledger_matches_recorded_credit: bool
    zk_proof_status: str = "none"
    zk_financial_commitment: str | None = None
    notice: str = (
        "Merkle kökü yalnızca kayıtların varlığını ve değişmezliğini bağlar; tek başına "
        "sıfır bilgi kanıtı değildir. Veresiye toplamı Midnight mutabakat devresine "
        "özel 'credit' girdisi olarak girer."
    )


class SaleDisclosure(BaseModel):
    """Tek bir kaydın taahhüdünü açan özel alanlar (yalnızca yönetici, bilinçli paylaşım için)."""
    sale_id: uuid.UUID
    transaction_id: uuid.UUID
    shift_id: uuid.UUID
    station_id: uuid.UUID
    account_type: CreditAccountType
    account_id: uuid.UUID
    plate: str | None = None
    driver_id: uuid.UUID | None = None
    fuel_type: str | None = None
    liters_ml: int | None = None
    amount_kurus: int
    sale_time: str
    nonce: str


class SaleInclusionProof(BaseModel):
    """Bir satışın vardiya defterine dahil olduğunu gösteren Merkle yolu."""
    credit_sale_id: uuid.UUID
    shift_id: uuid.UUID
    leaf_index: int
    leaf_count: int
    commitment: str
    merkle_path: list[str]
    merkle_root: str
    statement_digest: str
    disclosure: SaleDisclosure | None = None  # yalnızca `disclose=true` ve yönetici ise
