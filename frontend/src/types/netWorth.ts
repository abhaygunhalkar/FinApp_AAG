export type AccountType =
  | 'checking'
  | 'savings'
  | 'credit_card'
  | 'loan'
  | 'mortgage'
  | 'investment'
  | 'real_estate'
  | 'vehicle'
  | 'other_asset'
  | 'other_liability';

export interface FinancialAccount {
  id: number;
  name: string;
  institution: string | null;
  account_type: AccountType;
  balance: number;
  is_asset: boolean;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface FinancialAccountCreate {
  name: string;
  institution?: string | null;
  account_type: AccountType;
  balance: number;
  notes?: string | null;
}

export interface FinancialAccountUpdate {
  name?: string;
  institution?: string | null;
  balance?: number;
  notes?: string | null;
}

export interface NetWorthSummary {
  total_assets: number;
  total_liabilities: number;
  net_worth: number;
}

export interface NetWorthSnapshot {
  id: number;
  date: string;
  total_assets: number;
  total_liabilities: number;
  net_worth: number;
  created_at: string;
}
