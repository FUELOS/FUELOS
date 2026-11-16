/**
 * FuelOS — Dijital Veresiye ve Borç Takip tipleri.
 * Backend sözleşmesinin (backend/app/schemas/credit.py) birebir yansımasıdır.
 *
 * Mahremiyet: T.C. kimlik no yalnızca istek gövdelerinde tam bulunur; yanıtlar
 * her zaman maskeli (`tc_masked`, örn. "123******01") döner. `balance` alanı
 * yalnızca yönetici rollerinde (super_admin, station_manager) doludur.
 *
 * Para ve litre alanları backend'den Decimal → JSON string olarak gelir.
 */

export type Money = string | number;

export type CreditAccountType = "corporate" | "individual";
export type CollectionMethod = "cash" | "credit_card" | "eft" | "other";
export type CreditEntryKind = "payment" | "adjustment";
export type CreditDocumentKind = "receipt" | "id_photo";

// ─────────────────────────── Bakiye ───────────────────────────

export interface AccountBalance {
  total_sales: Money;
  total_payments: Money;
  /** > 0 → müşterinin istasyona borcu */
  balance: Money;
  sale_count: number;
  total_liters: Money;
  last_sale_at: string | null;
  last_payment_at: string | null;
  /** Yalnızca vade tanımlıysa dolu */
  overdue_amount: Money | null;
  /** Yalnızca limit tanımlıysa dolu (limit − bakiye) */
  credit_limit_remaining: Money | null;
}

// ─────────────────────────── Kurumsal: araç & sürücü ───────────────────────────

export interface VehicleCreate {
  plate: string;
  description?: string | null;
}

export interface VehicleUpdate {
  plate?: string;
  description?: string | null;
  is_active?: boolean;
}

export interface CreditVehicle {
  id: string;
  credit_company_id: string;
  /** Normalize plaka, örn. "06ABC123" */
  plate: string;
  description: string | null;
  is_active: boolean;
  created_at: string;
}

export interface DriverCreate {
  full_name: string;
  tc_no: string;
  phone?: string | null;
}

export interface DriverUpdate {
  full_name?: string;
  tc_no?: string;
  phone?: string | null;
  is_active?: boolean;
}

export interface CreditDriver {
  id: string;
  credit_company_id: string;
  full_name: string;
  tc_masked: string;
  phone: string | null;
  is_active: boolean;
  created_at: string;
}

// ─────────────────────────── Kurumsal: şirket ───────────────────────────

export interface CreditCompanyCreate {
  /** SuperAdmin için zorunlu; Müdür'de sunucu kendi istasyonunu kullanır */
  station_id?: string | null;
  name: string;
  tax_number?: string | null;
  tax_office?: string | null;
  address?: string | null;
  contact_name?: string | null;
  phone?: string | null;
  email?: string | null;
  /** Opsiyonel — zorunlu değil */
  credit_limit?: Money | null;
  /** Opsiyonel — zorunlu değil (1–365 gün) */
  payment_term_days?: number | null;
  notes?: string | null;
  vehicles?: VehicleCreate[];
  drivers?: DriverCreate[];
}

export type CreditCompanyUpdate = Partial<Omit<CreditCompanyCreate, "station_id" | "vehicles" | "drivers">>;

export interface CreditCompanyAuthorizationUpdate {
  authorized: boolean;
  reason?: string | null;
}

export interface CreditCompanySummary {
  id: string;
  station_id: string;
  name: string;
  tax_number: string | null;
  contact_name: string | null;
  phone: string | null;
  is_authorized: boolean;
  authorization_ended_at: string | null;
  credit_limit: Money | null;
  payment_term_days: number | null;
  vehicle_count: number;
  driver_count: number;
  balance: AccountBalance | null;
  created_at: string;
}

export interface CreditCompanyDetail extends CreditCompanySummary {
  tax_office: string | null;
  address: string | null;
  email: string | null;
  notes: string | null;
  authorization_end_reason: string | null;
  vehicles: CreditVehicle[];
  drivers: CreditDriver[];
  updated_at: string;
}

// ─────────────────────────── Kurumsal: plaka + sürücü doğrulama ───────────────────────────

export type VerifyReason =
  | "plate_not_registered"
  | "vehicle_inactive"
  | "company_not_authorized"
  | "driver_required"
  | "driver_not_found"
  | "driver_inactive"
  | "driver_tc_mismatch"
  | "credit_limit_exceeded";

export interface VerifyRequest {
  plate: string;
  driver_tc?: string | null;
  driver_id?: string | null;
  station_id?: string | null;
  amount?: Money | null;
}

export interface VerifyResponse {
  plate: string;
  /** Tüm kontroller geçti — satış yapılabilir */
  authorized: boolean;
  /** Sürücü T.C. no kayıtla eşleşti */
  identity_verified: boolean;
  reasons: VerifyReason[];
  company: { id: string; name: string; is_authorized: boolean } | null;
  vehicle: CreditVehicle | null;
  /** Şirketin aktif sürücüleri (seçim listesi için) */
  drivers: CreditDriver[];
  matched_driver: CreditDriver | null;
}

// ─────────────────────────── Bireysel müşteri ───────────────────────────

export interface CreditCustomerCreate {
  station_id?: string | null;
  full_name: string;
  tc_no: string;
  phone: string;
  plate?: string | null;
  credit_limit?: Money | null;
  notes?: string | null;
}

export interface CreditCustomerUpdate {
  full_name?: string;
  phone?: string;
  plate?: string | null;
  is_active?: boolean;
  credit_limit?: Money | null;
  notes?: string | null;
}

export interface CreditCustomerSummary {
  id: string;
  station_id: string;
  full_name: string;
  tc_masked: string;
  phone: string;
  plate: string | null;
  is_active: boolean;
  has_id_photo: boolean;
  id_photo_document_id: string | null;
  credit_limit: Money | null;
  balance: AccountBalance | null;
  created_at: string;
}

export interface CreditCustomerDetail extends CreditCustomerSummary {
  notes: string | null;
  updated_at: string;
}

// ─────────────────────────── Belgeler ───────────────────────────

export interface CreditDocument {
  id: string;
  kind: CreditDocumentKind;
  content_type: string;
  size_bytes: number;
  sha256: string;
  created_at: string;
}

// ─────────────────────────── Veresiye satış ───────────────────────────

/**
 * `POST /api/transactions` gövdesinde `payment_method === "veresiye"` iken
 * `credit` alanında ZORUNLUDUR.
 */
export interface CreditSaleInput {
  account_type: CreditAccountType;
  // Kurumsal:
  credit_company_id?: string | null;
  vehicle_id?: string | null;
  plate?: string | null;
  driver_id?: string | null;
  /** Kimlikten okunan T.C. — kayıtlı sürücüyle eşleşmek zorunda */
  driver_tc?: string | null;
  // Bireysel:
  credit_customer_id?: string | null;
  /** Verilirse kayıtla eşleşmek zorunda */
  customer_tc?: string | null;
}

/**
 * Bağlanmamış bir veresiye işlemini sonradan cari hesaba bağlar (yalnızca yönetici).
 * Kimlik doğrulaması yapılamaz; kayıt `identity_verified = false` olur.
 */
export interface CreditSaleLinkRequest {
  transaction_id: string;
  account_type: CreditAccountType;
  credit_company_id?: string | null;
  vehicle_id?: string | null;
  plate?: string | null;
  driver_id?: string | null;
  credit_customer_id?: string | null;
}

/** `Transaction.credit_sale` içinde dönen kısa özet */
export interface CreditSaleBrief {
  id: string;
  account_type: CreditAccountType;
  account_name: string | null;
  credit_company_id: string | null;
  credit_customer_id: string | null;
  plate: string | null;
  driver_name: string | null;
  identity_verified: boolean;
  has_receipt: boolean;
  receipt_document_id: string | null;
}

export interface CreditSale {
  id: string;
  transaction_id: string;
  station_id: string;
  shift_id: string;
  account_type: CreditAccountType;
  credit_company_id: string | null;
  credit_customer_id: string | null;
  account_name: string | null;
  vehicle_id: string | null;
  plate: string | null;
  driver_id: string | null;
  driver_name: string | null;
  identity_verified: boolean;
  amount: Money;
  liters: Money | null;
  fuel_type: string | null;
  sale_time: string;
  has_receipt: boolean;
  receipt_document_id: string | null;
  receipt_uploaded_at: string | null;
  commitment: string;
  created_at: string;
}

// ─────────────────────────── Tahsilat ───────────────────────────

export interface CreditPaymentCreate {
  account_type: CreditAccountType;
  credit_company_id?: string | null;
  credit_customer_id?: string | null;
  /** payment: tutar > 0 · adjustment: tutar ≠ 0 ve not zorunlu */
  kind?: CreditEntryKind;
  amount: Money;
  method?: CollectionMethod;
  payment_date?: string | null;
  reference?: string | null;
  note?: string | null;
}

export interface CreditPayment {
  id: string;
  station_id: string;
  account_type: CreditAccountType;
  credit_company_id: string | null;
  credit_customer_id: string | null;
  account_name: string | null;
  kind: CreditEntryKind;
  amount: Money;
  method: CollectionMethod;
  payment_date: string;
  reference: string | null;
  note: string | null;
  recorded_by: string | null;
  voided_at: string | null;
  void_reason: string | null;
  created_at: string;
}

// ─────────────────────────── Ekstre (dijital veresiye defteri) ───────────────────────────

export interface StatementEntry {
  entry_type: "sale" | "payment" | "adjustment";
  id: string;
  date: string;
  description: string;
  /** Borç (satış) */
  debit: Money;
  /** Alacak (tahsilat / düzeltme) */
  credit: Money;
  balance_after: Money;
  plate: string | null;
  driver_name: string | null;
  fuel_type: string | null;
  liters: Money | null;
  identity_verified: boolean | null;
  has_receipt: boolean | null;
  receipt_document_id: string | null;
  method: CollectionMethod | null;
  reference: string | null;
}

export interface VehicleBreakdown {
  vehicle_id: string | null;
  plate: string;
  sale_count: number;
  liters: Money;
  amount: Money;
  last_sale_at: string | null;
}

export interface PeriodSpending {
  /** Günlük "YYYY-MM-DD" veya aylık "YYYY-MM" */
  period: string;
  sale_count: number;
  liters: Money;
  amount: Money;
}

export interface AccountStatement {
  account_type: CreditAccountType;
  account_id: string;
  account_name: string;
  date_from: string | null;
  date_to: string | null;
  opening_balance: Money;
  period_sales: Money;
  period_payments: Money;
  closing_balance: Money;
  balance: AccountBalance;
  entries: StatementEntry[];
  vehicle_breakdown: VehicleBreakdown[];
  daily_spending: PeriodSpending[];
  monthly_spending: PeriodSpending[];
}

// ─────────────────────────── Günlük mutabakat ───────────────────────────

export type SalesChannel =
  | "cash"
  | "credit_card"
  | "eft"
  | "corporate_veresiye"
  | "individual_veresiye"
  | "unlinked_veresiye";

export type ReconciliationIssueCode =
  | "unlinked_veresiye"
  | "amount_mismatch"
  | "orphan_ledger_entry"
  | "missing_receipt"
  | "identity_unverified"
  | "declared_credit_mismatch"
  | "missing_id_photo";

export interface ChannelTotal {
  channel: SalesChannel;
  amount: Money;
  count: number;
  liters: Money;
}

export interface ReconciliationIssue {
  code: ReconciliationIssueCode;
  severity: "error" | "warning";
  message: string;
  transaction_id: string | null;
  credit_sale_id: string | null;
  shift_id: string | null;
  account_name: string | null;
  amount: Money | null;
  occurred_at: string | null;
}

/** `Shift.credit_breakdown` */
export interface ShiftCreditBreakdown {
  corporate: Money;
  individual: Money;
  unlinked: Money;
  sale_count: number;
  missing_receipt_count: number;
}

export interface ShiftCreditCheck {
  shift_id: string;
  worker_name: string | null;
  shift_status: "open" | "closed";
  start_time: string;
  end_time: string | null;
  recorded_credit: Money;
  ledger_credit: Money;
  corporate_credit: Money;
  individual_credit: Money;
  unlinked_credit: Money;
  declared_credit: Money | null;
  declared_difference: Money | null;
  sale_count: number;
  missing_receipt_count: number;
}

export interface CollectionTotal {
  method: CollectionMethod;
  amount: Money;
  count: number;
}

export interface DailyReconciliation {
  date: string;
  station_id: string | null;
  station_name: string;
  channels: ChannelTotal[];
  total_sales: Money;
  total_liters: Money;
  transaction_count: number;
  automation_veresiye_total: Money;
  ledger_veresiye_total: Money;
  veresiye_difference: Money;
  corporate_veresiye_total: Money;
  individual_veresiye_total: Money;
  unlinked_veresiye_total: Money;
  missing_receipt_count: number;
  collections: CollectionTotal[];
  collections_total: Money;
  shifts: ShiftCreditCheck[];
  issues: ReconciliationIssue[];
  status: "matched" | "attention" | "mismatch";
}

// ─────────────────────────── Mahremiyet / kanıt ───────────────────────────

export interface ShiftLedgerProof {
  shift_id: string;
  leaf_count: number;
  merkle_root: string;
  statement_digest: string;
  ledger_matches_recorded_credit: boolean;
  zk_proof_status: string;
  zk_financial_commitment: string | null;
  notice: string;
}

export interface SaleDisclosure {
  sale_id: string;
  transaction_id: string;
  shift_id: string;
  station_id: string;
  account_type: CreditAccountType;
  account_id: string;
  plate: string | null;
  driver_id: string | null;
  fuel_type: string | null;
  liters_ml: number | null;
  amount_kurus: number;
  sale_time: string;
  nonce: string;
}

export interface SaleInclusionProof {
  credit_sale_id: string;
  shift_id: string;
  leaf_index: number;
  leaf_count: number;
  commitment: string;
  merkle_path: string[];
  merkle_root: string;
  statement_digest: string;
  disclosure: SaleDisclosure | null;
}
