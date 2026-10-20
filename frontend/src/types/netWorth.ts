export type AccountType =
  | 'checking'
  | 'savings'
  | 'credit_card'
  | 'loan'
  | 'mortgage'
  | 'investment'
  | 'real_estate'
  | 'vehicle'
  | 'crypto'
  | 'other_asset'
  | 'other_liability';

export interface LiabilityDetails {
  credit_limit?: number | null;
  original_amount?: number | null;
  /** Annual percentage rate, e.g. 24.99 */
  apr?: number | null;
  /** ISO date (YYYY-MM-DD) */
  due_date?: string | null;
  /** ISO date (YYYY-MM-DD) */
  payoff_date?: string | null;
}

export interface FinancialAccount extends LiabilityDetails {
  id: number;
  name: string;
  institution: string | null;
  account_type: AccountType;
  balance: number;
  is_asset: boolean;
  notes: string | null;
  /** True when the balance comes from a Plaid connection. */
  is_linked: boolean;
  /** Last Plaid sync for linked accounts, last edit for manual ones. */
  last_synced: string | null;
  created_at: string;
  updated_at: string;
}

export interface FinancialAccountCreate extends LiabilityDetails {
  name: string;
  institution?: string | null;
  account_type: AccountType;
  balance: number;
  notes?: string | null;
}

export interface FinancialAccountUpdate extends LiabilityDetails {
  name?: string;
  institution?: string | null;
  balance?: number;
  notes?: string | null;
}

export interface NetWorthSummary {
  total_assets: number;
  total_liabilities: number;
  net_worth: number;
  portfolio_value: number;
}

export interface NetWorthSnapshot {
  id: number;
  date: string;
  total_assets: number;
  total_liabilities: number;
  net_worth: number;
  created_at: string;
}

export interface PlaidItemInfo {
  id: number;
  item_id: string;
  institution_name: string | null;
  last_synced: string | null;
  account_count: number;
}
