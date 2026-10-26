import type { ExpenseFrequency } from './recurringExpense';

export type IncomeCategory =
  | 'Salary'
  | 'Bonus'
  | 'Rental income'
  | 'Side income'
  | 'Dividends & interest'
  | 'Benefits & pension'
  | 'Other';

export interface IncomeSource {
  id: number;
  name: string;
  category: IncomeCategory;
  /** Take-home amount per payment. */
  amount: number;
  frequency: ExpenseFrequency;
  monthly_amount: number;
  /** Linked Net Worth account, if any. */
  deposited_to_account_id: number | null;
  /** The linked account's current "Name (Bank)", else free text saved before linking. */
  deposited_to: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface IncomeSourceCreate {
  name: string;
  category: IncomeCategory;
  amount: number;
  frequency: ExpenseFrequency;
  deposited_to_account_id: number | null;
  /** Free text, only used when no account is linked. */
  deposited_to: string | null;
  notes: string | null;
}

export type IncomeSourceUpdate = Partial<IncomeSourceCreate>;

export interface CashFlowSummary {
  monthly_income: number;
  monthly_fixed_costs: number;
  monthly_surplus: number;
  /** Share of income left after fixed costs; null with no income. */
  kept_pct: number | null;
  liquid_cash: number;
  /** Months of fixed costs that liquid cash covers; null with no fixed costs. */
  emergency_months: number | null;
}
