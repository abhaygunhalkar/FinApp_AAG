export type ExpenseCategory =
  | 'Housing'
  | 'Utilities'
  | 'Groceries'
  | 'Transportation'
  | 'Auto loans'
  | 'Insurance'
  | 'Health & fitness'
  | 'Subscriptions'
  | 'Debt payments'
  | 'Childcare & education'
  | 'Kids activities'
  | 'Savings & investing'
  | 'Charity & social service'
  | 'Other';

export type ExpenseFrequency =
  | 'weekly'
  | 'biweekly'
  | 'semimonthly'
  | 'monthly'
  | 'quarterly'
  | 'semiannual'
  | 'annual';

export interface RecurringExpense {
  id: number;
  name: string;
  category: ExpenseCategory;
  amount: number;
  frequency: ExpenseFrequency;
  /** `amount` converted to a per-month figure by the backend. */
  monthly_amount: number;
  next_due_date: string | null;
  /** Linked Net Worth account, if any. */
  paid_from_account_id: number | null;
  /** The linked account's current "Name (Bank)", else free text saved before linking. */
  paid_from: string | null;
  autopay: boolean;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface RecurringExpenseCreate {
  name: string;
  category: ExpenseCategory;
  amount: number;
  frequency: ExpenseFrequency;
  next_due_date: string | null;
  paid_from_account_id: number | null;
  /** Free text, only used when no account is linked. */
  paid_from: string | null;
  autopay: boolean;
  notes: string | null;
}

export type RecurringExpenseUpdate = Partial<RecurringExpenseCreate>;
