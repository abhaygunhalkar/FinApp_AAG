export type ExpenseCategory =
  | 'Housing'
  | 'Utilities'
  | 'Transportation'
  | 'Auto loans'
  | 'Insurance'
  | 'Subscriptions'
  | 'Debt payments'
  | 'Childcare & education'
  | 'Kids activities'
  | 'Savings & investing'
  | 'Other';

export type ExpenseFrequency =
  | 'weekly'
  | 'biweekly'
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
  paid_from: string | null;
  autopay: boolean;
  notes: string | null;
}

export type RecurringExpenseUpdate = Partial<RecurringExpenseCreate>;
