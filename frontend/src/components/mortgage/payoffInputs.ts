import type { FinancialAccount } from '../../types';
import {
  addMonths,
  amortizedPayment,
  monthsBetween,
  thisMonth,
  type Loan,
  type Scenario,
  type YearMonth,
} from './simulatePayoff';

/** What the simulator's form holds. Typed amounts stay strings while being edited. */
export interface PayoffInputs {
  /** Loan details, prefilled from the account and editable here only. */
  balance: string;
  apr: string;
  payment: string;
  /** The exact payment worked out from the payoff date; the field shows it in cents. */
  exactPayment: number | null;
  extraMonthly: number;
  lumpSum: string;
  lumpSumMonth: YearMonth;
  annualExtra: string;
  annualExtraMonth: number;
  refinance: boolean;
  refiRate: string;
  refiTermYears: number;
  refiClosing: string;
}

export const EXTRA_MAX = 5000;
export const EXTRA_STEP = 50;
export const REFI_TERMS = [10, 15, 20, 25, 30];

/** Parses "$1,240.18" or "1240.18"; null when empty or not a number. */
export function parseAmount(text: string): number | null {
  const cleaned = text.replace(/[$,\s%]/g, '');
  if (cleaned === '') return null;
  const value = Number(cleaned);
  return Number.isFinite(value) ? value : null;
}

/** The next payment's month: the account's due date if it's still ahead, else next month. */
export function firstPaymentMonth(account: FinancialAccount, now = new Date()): YearMonth {
  const current = thisMonth(now);
  const due = account.due_date?.slice(0, 7);
  return due && due >= current ? due : addMonths(current, 1);
}

/** Principal + interest that pays the balance off by the account's payoff date. */
export function derivedPayment(account: FinancialAccount, now = new Date()): number | null {
  if (account.apr == null || !account.payoff_date || account.balance <= 0) return null;
  const months =
    monthsBetween(firstPaymentMonth(account, now), account.payoff_date.slice(0, 7)) + 1;
  return months > 0 ? amortizedPayment(account.balance, account.apr, months) : null;
}

const trim = (v: number, digits: number) => String(Number(v.toFixed(digits)));

export function defaultInputs(account: FinancialAccount, now = new Date()): PayoffInputs {
  const first = firstPaymentMonth(account, now);
  const payment = derivedPayment(account, now);
  const apr = account.apr ?? null;
  return {
    balance: trim(account.balance, 2),
    apr: apr === null ? '' : trim(apr, 3),
    payment: payment === null ? '' : payment.toFixed(2),
    exactPayment: payment,
    extraMonthly: 0,
    lumpSum: '',
    lumpSumMonth: first,
    annualExtra: '',
    annualExtraMonth: Number(first.slice(5)),
    refinance: false,
    // Starting guesses for a refinance: a point lower, closing costs around 2%.
    refiRate: apr === null ? '' : trim(Math.max(apr - 1, 0), 3),
    refiTermYears: 30,
    refiClosing: String(Math.round((account.balance * 0.02) / 100) * 100),
  };
}

/** The loan the form describes, or null while a required detail is missing. */
export function toLoan(inputs: PayoffInputs, first: YearMonth): Loan | null {
  const balance = parseAmount(inputs.balance);
  const apr = parseAmount(inputs.apr);
  // Use the unrounded payment until the field is edited, so the payoff date
  // isn't moved by a fraction of a cent.
  const exact = inputs.exactPayment;
  const payment =
    exact !== null && inputs.payment === exact.toFixed(2) ? exact : parseAmount(inputs.payment);
  if (
    balance === null ||
    balance <= 0 ||
    apr === null ||
    apr < 0 ||
    payment === null ||
    payment <= 0
  ) {
    return null;
  }
  return { balance, apr, monthlyPayment: payment, firstPaymentMonth: first };
}

export function toScenario(inputs: PayoffInputs): Scenario {
  const refiRate = parseAmount(inputs.refiRate);
  return {
    extraMonthly: inputs.extraMonthly,
    lumpSum: parseAmount(inputs.lumpSum) ?? 0,
    lumpSumMonth: inputs.lumpSumMonth,
    annualExtra: parseAmount(inputs.annualExtra) ?? 0,
    annualExtraMonth: inputs.annualExtraMonth,
    refinance:
      inputs.refinance && refiRate !== null && refiRate >= 0
        ? {
            apr: refiRate,
            termMonths: inputs.refiTermYears * 12,
            closingCosts: parseAmount(inputs.refiClosing) ?? 0,
          }
        : null,
  };
}
