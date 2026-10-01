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

// Görsel 1: İşçi bazlı satış modeli
export interface WorkerShiftStats {
  shift_id: string;
  user_id: string;
  user_name: string;
  avatar_url?: string | null;
  station_name: string;
  start_time: string;
  opening_cash: string | number;
  dispensed_liters: string | number;
  cash_sales: string | number;
  pos_sales: string | number;
  fast_sales: string | number;
  total_sales: string | number;
}

// Görsel 2: Ürün kırılım modeli
export interface ProductBreakdownItem {
  product_name: string;
  liters: string | number;
  cash_sales: string | number;
  pos_sales: string | number;
  fast_sales: string | number;
  total_sales: string | number;
  share_percent: number;
}

// Görsel 1 & 2: Dashboard ana mutabakat modeli
export interface DashboardResponse {
  active_station_name: string;
  active_station_id?: string | null;
  current_date_str: string;
  shift_time_range: string;
  opening_cash: string | number;
  total_cash_sales: string | number;
  total_pos_sales: string | number;
  total_fast_sales: string | number;
  total_dispensed_liters: string | number;
  total_sales_revenue: string | number;
  expected_cash: string | number;
  reconciliation_completed: boolean;
  active_workers: WorkerShiftStats[];
  product_breakdown: ProductBreakdownItem[];
  total_stations: number;
  total_users: number;
}
