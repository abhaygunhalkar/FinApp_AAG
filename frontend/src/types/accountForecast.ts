/** One bill or payday in an account's timeline. */
export interface ForecastEvent {
  date: string;
  kind: 'bill' | 'income';
  name: string;
  /** Negative for bills, positive for income. */
  amount: number;
  balance_after: number;
  /** A manual bill past its due date, counted as due today. */
  overdue: boolean;
}

/** How a bank account's balance moves through the window. */
export interface AccountForecast {
  account_id: number;
  label: string;
  name: string;
  institution: string | null;
  account_type: string;
  /** Some income with a pay schedule is deposited here (in any window). */
  has_paydays: boolean;
  balance: number;
  bills_total: number;
  income_total: number;
  ending_balance: number;
  lowest_balance: number;
  lowest_date: string;
  /** First day the balance goes below zero, and the bill that takes it there. */
  short_date: string | null;
  short_bill: string | null;
  events: ForecastEvent[];
}

/** Bills charged to a credit card in the window. */
export interface CardCharges {
  account_id: number;
  label: string;
  name: string;
  institution: string | null;
  total: number;
  count: number;
}

export interface AccountForecastResponse {
  start: string;
  end: string;
  accounts: AccountForecast[];
  cards: CardCharges[];
  unlinked_total: number;
  unlinked_count: number;
  undated_count: number;
}
