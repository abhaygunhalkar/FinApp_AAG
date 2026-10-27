import type { ExpenseFrequency } from './recurringExpense';

export type IncomeCategory =
  | 'Salary'
  | 'Bonus'
  | 'Rental income'
  | 'Side income'
  | 'Dividends & interest'
  | 'Benefits & pension'
  | 'Other';

/** When a payday lands on a weekend: the Friday before, the Monday after, or that day. */
export type WeekendRule = 'before' | 'after' | 'none';

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
  /** Any one pay date (YYYY-MM-DD); used for every frequency except twice a month. */
  pay_date: string | null;
  /** Twice a month: the two days of the month (31 = last day). */
  pay_day_1: number | null;
  pay_day_2: number | null;
  weekend_rule: WeekendRule;
  /** Next day the money arrives, weekend rule applied; null without a schedule. */
  next_pay_date: string | null;
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
  pay_date: string | null;
  pay_day_1: number | null;
  pay_day_2: number | null;
  weekend_rule: WeekendRule;
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
