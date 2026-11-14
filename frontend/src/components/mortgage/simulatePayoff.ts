import { fmtMonthYear } from '../../utils/date';

/**
 * Mortgage payoff maths. Pure functions, no React: amounts are never rounded
 * here, only when displayed.
 */

/** A calendar month as "YYYY-MM". */
export type YearMonth = string;

export function addMonths(ym: YearMonth, n: number): YearMonth {
  const [y, m] = ym.split('-').map(Number);
  const index = y * 12 + (m - 1) + n;
  return `${Math.floor(index / 12)}-${String((index % 12) + 1).padStart(2, '0')}`;
}

/** Months from `from` to `to` (0 when they're the same month). */
export function monthsBetween(from: YearMonth, to: YearMonth): number {
  const [fy, fm] = from.split('-').map(Number);
  const [ty, tm] = to.split('-').map(Number);
  return (ty - fy) * 12 + (tm - fm);
}

export function thisMonth(now = new Date()): YearMonth {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

/** "Jun 2054" */
export function fmtYearMonth(ym: YearMonth): string {
  const [y, m] = ym.split('-').map(Number);
  return fmtMonthYear(new Date(y, m - 1, 1));
}

/** "2 yrs 3 mos", "11 mos", "0 mos" */
export function fmtDuration(months: number): string {
  const years = Math.floor(months / 12);
  const rest = months % 12;
  const parts = [
    years ? `${years} yr${years === 1 ? '' : 's'}` : '',
    rest || !years ? `${rest} mo${rest === 1 ? '' : 's'}` : '',
  ];
  return parts.filter(Boolean).join(' ');
}

/** The fixed monthly payment (principal + interest) that pays off `balance` in `months`. */
export function amortizedPayment(balance: number, aprPct: number, months: number): number {
  if (months <= 0) return balance;
  const r = aprPct / 100 / 12;
  if (r === 0) return balance / months;
  return (balance * r) / (1 - (1 + r) ** -months);
}

export interface Loan {
  balance: number;
  /** Annual rate in percent, e.g. 6.125 */
  apr: number;
  /** Principal + interest, without escrow. */
  monthlyPayment: number;
  firstPaymentMonth: YearMonth;
}

export interface Refinance {
  apr: number;
  termMonths: number;
  /** Paid in cash at closing, not added to the loan. */
  closingCosts: number;
}

export interface Scenario {
  extraMonthly: number;
  lumpSum: number;
  /** Applied in this month; a month before the first payment means the first payment. */
  lumpSumMonth: YearMonth;
  annualExtra: number;
  /** 1–12 */
  annualExtraMonth: number;
  /** Replaces the loan's rate and payment from the first month. */
  refinance: Refinance | null;
}

export const NO_CHANGES: Scenario = {
  extraMonthly: 0,
  lumpSum: 0,
  lumpSumMonth: '0000-01',
  annualExtra: 0,
  annualExtraMonth: 1,
  refinance: null,
};

export interface ScheduleRow {
  month: YearMonth;
  /** The regular payment actually made; the last one is only what's left. */
  payment: number;
  principal: number;
  interest: number;
  /** Extra payments this month, all to principal. */
  extra: number;
  balance: number;
}

export interface PayoffSummary {
  paidOff: boolean;
  months: number;
  payoffMonth: YearMonth | null;
  monthlyPayment: number;
  totalInterest: number;
  totalPaid: number;
}

export interface Simulation {
  schedule: ScheduleRow[];
  summary: PayoffSummary;
}

/** Guards against a payment that never covers the interest. */
export const MAX_MONTHS = 1200;
/** Below this the loan counts as paid (floating-point dust, far under a cent). */
const EPSILON = 1e-6;

/** Month-by-month amortization of `loan` under `scenario`. */
export function simulatePayoff(loan: Loan, scenario: Scenario): Simulation {
  const refi = scenario.refinance;
  const r = (refi ? refi.apr : loan.apr) / 100 / 12;
  const payment = refi
    ? amortizedPayment(loan.balance, refi.apr, refi.termMonths)
    : loan.monthlyPayment;

  const schedule: ScheduleRow[] = [];
  let balance = loan.balance;
  let totalInterest = 0;
  let totalPaid = 0;

  for (let i = 0; i < MAX_MONTHS && balance > EPSILON; i++) {
    const month = addMonths(loan.firstPaymentMonth, i);
    const interest = balance * r;
    const regular = Math.min(payment, balance + interest);
    balance = balance + interest - regular;

    const lumpDue = i === 0 ? scenario.lumpSumMonth <= month : scenario.lumpSumMonth === month;
    const annualDue = Number(month.slice(5)) === scenario.annualExtraMonth;
    const wanted =
      Math.max(scenario.extraMonthly, 0) +
      (lumpDue ? Math.max(scenario.lumpSum, 0) : 0) +
      (annualDue ? Math.max(scenario.annualExtra, 0) : 0);
    const extra = Math.min(wanted, Math.max(balance, 0));
    balance -= extra;
    if (balance < EPSILON) balance = 0;

    totalInterest += interest;
    totalPaid += regular + extra;
    schedule.push({
      month,
      payment: regular,
      principal: regular - interest,
      interest,
      extra,
      balance,
    });
  }

  const paidOff = balance === 0;
  return {
    schedule,
    summary: {
      paidOff,
      months: schedule.length,
      payoffMonth: paidOff && schedule.length ? schedule[schedule.length - 1].month : null,
      monthlyPayment: payment,
      totalInterest,
      totalPaid,
    },
  };
}

export interface Comparison {
  baseline: Simulation;
  scenario: Simulation;
  /** Positive when the scenario pays off sooner; null if either never does. */
  monthsSaved: number | null;
  /** Baseline interest minus scenario interest and any closing costs. */
  interestSaved: number;
  closingCosts: number;
  /** 1-based month when cumulative interest savings first cover the closing costs. */
  breakEvenMonth: number | null;
}

/** The loan as it is, against the loan under `scenario`. */
export function comparePayoff(loan: Loan, scenario: Scenario): Comparison {
  const baseline = simulatePayoff(loan, NO_CHANGES);
  const result = simulatePayoff(loan, scenario);
  const closingCosts = scenario.refinance ? Math.max(scenario.refinance.closingCosts, 0) : 0;

  let breakEvenMonth: number | null = null;
  if (scenario.refinance) {
    const length = Math.max(baseline.schedule.length, result.schedule.length);
    let saved = 0;
    for (let i = 0; i < length; i++) {
      saved += (baseline.schedule[i]?.interest ?? 0) - (result.schedule[i]?.interest ?? 0);
      if (saved >= closingCosts) {
        breakEvenMonth = i + 1;
        break;
      }
    }
  }

  return {
    baseline,
    scenario: result,
    monthsSaved:
      baseline.summary.paidOff && result.summary.paidOff
        ? baseline.summary.months - result.summary.months
        : null,
    interestSaved: baseline.summary.totalInterest - result.summary.totalInterest - closingCosts,
    closingCosts,
    breakEvenMonth,
  };
}

/** True when the scenario changes anything. */
export function hasChanges(s: Scenario): boolean {
  return s.extraMonthly > 0 || s.lumpSum > 0 || s.annualExtra > 0 || s.refinance !== null;
}

const MONTH_NAMES = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

export function monthName(month: number): string {
  return MONTH_NAMES[month - 1] ?? '';
}

/**
 * One sentence on what the scenario does, e.g. "Paying $300/mo extra saves
 * $61,420 in interest and pays off your home in Mar 2049 instead of Jun 2054."
 */
export function insight(c: Comparison, s: Scenario, money: (v: number) => string): string {
  const base = c.baseline.summary;
  const next = c.scenario.summary;
  if (!hasChanges(s)) {
    return base.payoffMonth
      ? `You're on track to pay off your home in ${fmtYearMonth(base.payoffMonth)}. Try an extra payment to see what it saves.`
      : `At this payment the loan never gets paid off. Raise the payment to see a payoff date.`;
  }

  const levers = [
    s.extraMonthly > 0 ? `paying ${money(s.extraMonthly)}/mo extra` : '',
    s.lumpSum > 0 ? `a ${money(s.lumpSum)} lump sum` : '',
    s.annualExtra > 0 ? `${money(s.annualExtra)} every ${monthName(s.annualExtraMonth)}` : '',
    s.refinance
      ? `refinancing to ${s.refinance.apr}% over ${Math.round(s.refinance.termMonths / 12)} years`
      : '',
  ].filter(Boolean);
  const subject =
    levers.length > 1
      ? `${levers.slice(0, -1).join(', ')} and ${levers[levers.length - 1]}`
      : levers[0];
  const lead = subject.charAt(0).toUpperCase() + subject.slice(1);

  const effect =
    c.interestSaved >= 0
      ? `saves ${money(c.interestSaved)}${c.closingCosts ? ' after closing costs' : ' in interest'}`
      : `costs ${money(-c.interestSaved)} more${c.closingCosts ? ' including closing costs' : ' in interest'}`;

  if (!next.payoffMonth || !base.payoffMonth) return `${lead} ${effect}.`;
  const when =
    next.payoffMonth === base.payoffMonth
      ? `still pays off your home in ${fmtYearMonth(next.payoffMonth)}`
      : `pays off your home in ${fmtYearMonth(next.payoffMonth)} instead of ${fmtYearMonth(base.payoffMonth)}`;
  return `${lead} ${effect} and ${when}.`;
}

export interface YearTotals {
  year: string;
  rows: ScheduleRow[];
  payment: number;
  principal: number;
  interest: number;
  extra: number;
  /** Balance after the year's last payment. */
  balance: number;
}

/** The schedule summed by calendar year, for the amortization table. */
export function groupByYear(schedule: ScheduleRow[]): YearTotals[] {
  const years: YearTotals[] = [];
  for (const row of schedule) {
    const year = row.month.slice(0, 4);
    let group = years[years.length - 1];
    if (!group || group.year !== year) {
      group = { year, rows: [], payment: 0, principal: 0, interest: 0, extra: 0, balance: 0 };
      years.push(group);
    }
    group.rows.push(row);
    group.payment += row.payment;
    group.principal += row.principal;
    group.interest += row.interest;
    group.extra += row.extra;
    group.balance = row.balance;
  }
  return years;
}
