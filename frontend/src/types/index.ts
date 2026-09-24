export type UserRole = 'super_admin' | 'station_manager' | 'cashier';

export type ShiftStatus = 'open' | 'closed';

export type TransactionType = 'fuel' | 'market' | 'other';

export type PaymentMethod = 'cash' | 'credit_card' | 'eft' | 'veresiye';

export interface User {
  id: string;
  company_id: string;
  station_id: string | null;
  email: string;
  full_name: string;
  role: UserRole;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface AuthResponse {
  access_token: string;
  token_type: string;
  user_id: string;
  email: string;
  full_name: string;
  role: UserRole;
  company_id: string;
  station_id: string | null;
}

export interface Station {
  id: string;
  company_id: string;
  name: string;
  code: string;
  city: string;
  district: string | null;
  address: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface Shift {
  id: string;
  station_id: string;
  user_id: string;
  start_time: string;
  end_time: string | null;
  status: ShiftStatus;
  opening_cash: string | number;
  closing_cash: string | number | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
  // Akıllı Kasa Mutabakat Alanları
  total_sales?: string | number;
  cash_sales?: string | number;
  expected_cash?: string | number | null;
  cash_difference?: string | number | null;
  reconciliation_status?: 'matched' | 'shortage' | 'surplus' | 'open' | null;
}

export interface Transaction {
  id: string;
  shift_id: string;
  station_id: string;
  type: TransactionType;
  payment_method: PaymentMethod;
  amount: string | number;
  liters: string | number | null;
  fuel_type: string | null;
  description: string | null;
  transaction_time: string;
  created_at: string;
}

export interface ActiveShiftInfo {
  shift_id: string;
  station_name: string;
  user_name: string;
  start_time: string;
  opening_cash: string | number;
}

export interface DashboardResponse {
  today_total_sales: string | number;
  today_total_liters: string | number;
  today_transaction_count: number;
  today_cash: string | number;
  today_credit_card: string | number;
  today_eft: string | number;
  today_veresiye: string | number;
  active_shift_count: number;
  active_shifts: ActiveShiftInfo[];
  total_stations: number;
  total_users: number;
}
