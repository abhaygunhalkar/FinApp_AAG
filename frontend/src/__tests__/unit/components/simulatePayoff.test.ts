import { describe, expect, it } from 'vitest';
import {
  MAX_MONTHS,
  NO_CHANGES,
  addMonths,
  amortizedPayment,
  comparePayoff,
  defaultInputs,
  derivedPayment,
  firstPaymentMonth,
  fmtDuration,
  groupByYear,
  insight,
  monthsBetween,
  simulatePayoff,
  toLoan,
  toScenario,
  type Loan,
  type Scenario,
} from '../../../components/mortgage';
import { fmtMoney } from '../../../components/networth/format';
import type { FinancialAccount } from '../../../types';

const FIRST = '2027-01';

function loan(overrides: Partial<Loan> = {}): Loan {
  const balance = overrides.balance ?? 300_000;
  const apr = overrides.apr ?? 6;
  return {
    balance,
    apr,
    monthlyPayment: amortizedPayment(balance, apr, 360),
    firstPaymentMonth: FIRST,
    ...overrides,
  };
}

const scenario = (overrides: Partial<Scenario>): Scenario => ({ ...NO_CHANGES, ...overrides });
const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);

describe('month helpers', () => {
  it('adds and counts months across years', () => {
    expect(addMonths('2026-11', 2)).toBe('2027-01');
    expect(addMonths('2027-01', -1)).toBe('2026-12');
    expect(monthsBetween('2026-12', '2054-06')).toBe(330);
    expect(fmtDuration(27)).toBe('2 yrs 3 mos');
    expect(fmtDuration(12)).toBe('1 yr');
    expect(fmtDuration(0)).toBe('0 mos');
  });
});

describe('amortizedPayment', () => {
  it('matches the standard formula', () => {
    expect(amortizedPayment(200_000, 6, 360)).toBeCloseTo(1199.1, 2);
    expect(amortizedPayment(12_000, 0, 12)).toBe(1000);
  });
});

describe('simulatePayoff', () => {
  it('with no extra pays off exactly on the standard amortization date', () => {
    const { schedule, summary } = simulatePayoff(loan(), NO_CHANGES);
    expect(summary.paidOff).toBe(true);
    expect(summary.months).toBe(360);
    expect(summary.payoffMonth).toBe(addMonths(FIRST, 359));
    expect(schedule[359].balance).toBe(0);
    expect(summary.totalPaid).toBeCloseTo(loan().monthlyPayment * 360, 4);
  });

  it('splits each payment into interest on the balance and principal', () => {
    const { schedule } = simulatePayoff(loan(), NO_CHANGES);
    expect(schedule[0].interest).toBeCloseTo(300_000 * 0.005, 9);
    expect(schedule[0].principal).toBeCloseTo(loan().monthlyPayment - 1500, 9);
    // Not rounded to cents during the calculation.
    expect((schedule[0].principal * 100) % 1).not.toBe(0);
  });

  it('makes the final payment only what is left', () => {
    const { schedule, summary } = simulatePayoff(loan({ monthlyPayment: 2500 }), NO_CHANGES);
    const last = schedule[schedule.length - 1];
    expect(last.payment).toBeLessThan(2500);
    expect(last.balance).toBe(0);
    expect(sum(schedule.map((r) => r.principal + r.extra))).toBeCloseTo(300_000, 6);
    expect(summary.totalPaid).toBeCloseTo(300_000 + summary.totalInterest, 6);
  });

  it('shortens the term and saves interest with extra monthly payments', () => {
    const c = comparePayoff(loan(), scenario({ extraMonthly: 300 }));
    expect(c.scenario.summary.months).toBeLessThan(360);
    expect(c.monthsSaved).toBe(360 - c.scenario.summary.months);
    expect(c.monthsSaved).toBeGreaterThan(0);
    expect(c.interestSaved).toBeGreaterThan(0);
    expect(c.scenario.schedule[0].extra).toBe(300);
  });

  it('pays off immediately when a lump sum is larger than the balance', () => {
    const { schedule, summary } = simulatePayoff(
      loan(),
      scenario({ lumpSum: 1_000_000, lumpSumMonth: FIRST }),
    );
    expect(summary.months).toBe(1);
    expect(summary.payoffMonth).toBe(FIRST);
    expect(schedule[0].balance).toBe(0);
    // Only what was owed after the regular payment, not the whole lump sum.
    expect(schedule[0].extra).toBeCloseTo(300_000 - schedule[0].principal, 6);
  });

  it('applies a lump sum in its month, or in the first month if that has passed', () => {
    const later = simulatePayoff(loan(), scenario({ lumpSum: 10_000, lumpSumMonth: '2028-06' }));
    const month = later.schedule.findIndex((r) => r.extra > 0);
    expect(later.schedule[month].month).toBe('2028-06');
    expect(later.schedule.filter((r) => r.extra > 0)).toHaveLength(1);

    const past = simulatePayoff(loan(), scenario({ lumpSum: 10_000, lumpSumMonth: '2020-01' }));
    expect(past.schedule[0].extra).toBe(10_000);
  });

  it('applies the annual extra only in its month, every year', () => {
    const { schedule } = simulatePayoff(
      loan(),
      scenario({ annualExtra: 5000, annualExtraMonth: 3 }),
    );
    const extras = schedule.filter((r) => r.extra > 0);
    expect(extras.every((r) => r.month.endsWith('-03'))).toBe(true);
    expect(extras[0].month).toBe('2027-03');
    expect(extras.length).toBeGreaterThan(10);
  });

  it('handles a 0% APR loan', () => {
    const zero = { balance: 12_000, apr: 0, monthlyPayment: 1000, firstPaymentMonth: FIRST };
    const plain = simulatePayoff(zero, NO_CHANGES);
    expect(plain.summary.months).toBe(12);
    expect(plain.summary.totalInterest).toBe(0);
    expect(plain.schedule.every((r) => r.interest === 0 && r.principal === 1000)).toBe(true);

    expect(simulatePayoff(zero, scenario({ extraMonthly: 1000 })).summary.months).toBe(6);
  });

  it('stops, unpaid, when the payment never covers the interest', () => {
    const { summary } = simulatePayoff(loan({ monthlyPayment: 1000 }), NO_CHANGES);
    expect(summary.paidOff).toBe(false);
    expect(summary.payoffMonth).toBeNull();
    expect(summary.months).toBe(MAX_MONTHS);
  });
});

describe('comparePayoff with a refinance', () => {
  it('finds the month interest savings first cover the closing costs', () => {
    const refinance = { apr: 4.5, termMonths: 360, closingCosts: 6000 };
    const c = comparePayoff(
      loan({ apr: 7, monthlyPayment: amortizedPayment(300_000, 7, 360) }),
      scenario({ refinance }),
    );
    expect(c.breakEvenMonth).not.toBeNull();
    const k = c.breakEvenMonth!;
    const saved = (n: number) =>
      sum(c.baseline.schedule.slice(0, n).map((r) => r.interest)) -
      sum(c.scenario.schedule.slice(0, n).map((r) => r.interest));
    expect(saved(k)).toBeGreaterThanOrEqual(6000);
    expect(saved(k - 1)).toBeLessThan(6000);
    expect(c.scenario.summary.monthlyPayment).toBeCloseTo(amortizedPayment(300_000, 4.5, 360), 9);
    expect(c.interestSaved).toBeCloseTo(
      c.baseline.summary.totalInterest - c.scenario.summary.totalInterest - 6000,
      6,
    );
  });

  it('never breaks even at a higher rate', () => {
    const c = comparePayoff(
      loan(),
      scenario({ refinance: { apr: 8, termMonths: 360, closingCosts: 3000 } }),
    );
    expect(c.breakEvenMonth).toBeNull();
    expect(c.interestSaved).toBeLessThan(0);
  });
});

describe('insight', () => {
  const money = (v: number) => fmtMoney(v);

  it('describes an extra payment', () => {
    const s = scenario({ extraMonthly: 300 });
    const text = insight(comparePayoff(loan(), s), s, money);
    expect(text).toMatch(
      /^Paying \$300\/mo extra saves \$[\d,]+ in interest and pays off your home in \w{3} \d{4} instead of Dec 2056\.$/,
    );
  });

  it('says when nothing has changed', () => {
    expect(insight(comparePayoff(loan(), NO_CHANGES), NO_CHANGES, money)).toBe(
      "You're on track to pay off your home in Dec 2056. Try an extra payment to see what it saves.",
    );
  });
});

describe('groupByYear', () => {
  it('sums each calendar year and keeps its closing balance', () => {
    const { schedule } = simulatePayoff(loan(), scenario({ extraMonthly: 100 }));
    const years = groupByYear(schedule);
    expect(years[0].year).toBe('2027');
    expect(years[0].rows).toHaveLength(12);
    expect(years[0].extra).toBe(1200);
    expect(years[0].interest).toBeCloseTo(sum(schedule.slice(0, 12).map((r) => r.interest)), 9);
    expect(years[0].balance).toBe(schedule[11].balance);
  });
});

describe('payoff inputs', () => {
  const mortgage: FinancialAccount = {
    id: 6,
    name: 'Home Mortgage',
    institution: 'Harbor Bank',
    account_type: 'mortgage',
    balance: 386_200,
    is_asset: false,
    is_linked: false,
    last_synced: null,
    notes: null,
    created_at: '',
    updated_at: '',
    apr: 6.125,
    original_amount: 420_000,
    payoff_date: '2054-06-01',
    due_date: null,
  };
  const now = new Date(2026, 10, 9);

  it('starts with next month, or the due date when it is still ahead', () => {
    expect(firstPaymentMonth(mortgage, now)).toBe('2026-12');
    expect(firstPaymentMonth({ ...mortgage, due_date: '2027-02-01' }, now)).toBe('2027-02');
    expect(firstPaymentMonth({ ...mortgage, due_date: '2026-10-01' }, now)).toBe('2026-12');
  });

  it('derives the payment that ends the loan on its payoff date', () => {
    const payment = derivedPayment(mortgage, now)!;
    expect(payment).toBeCloseTo(amortizedPayment(386_200, 6.125, 331), 9);
    const result = simulatePayoff(toLoan(defaultInputs(mortgage, now), '2026-12')!, NO_CHANGES);
    expect(result.summary.payoffMonth).toBe('2054-06');
  });

  it('keeps the exact derived payment until the field is edited', () => {
    const inputs = defaultInputs(mortgage, now);
    expect(toLoan(inputs, '2026-12')?.monthlyPayment).toBe(derivedPayment(mortgage, now));
    expect(toLoan({ ...inputs, payment: '2500' }, '2026-12')?.monthlyPayment).toBe(2500);
  });

  it('needs a typed payment when there is no payoff date', () => {
    const inputs = defaultInputs({ ...mortgage, payoff_date: null }, now);
    expect(inputs.payment).toBe('');
    expect(toLoan(inputs, '2026-12')).toBeNull();
    expect(toLoan({ ...inputs, payment: '$2,400' }, '2026-12')?.monthlyPayment).toBe(2400);
  });

  it('turns the form into a scenario', () => {
    const inputs = defaultInputs(mortgage, now);
    expect(toScenario(inputs)).toEqual({
      ...NO_CHANGES,
      lumpSumMonth: '2026-12',
      annualExtraMonth: 12,
    });
    const refi = toScenario({
      ...inputs,
      refinance: true,
      refiRate: '5.25',
      refiTermYears: 15,
      refiClosing: '$4,000',
    });
    expect(refi.refinance).toEqual({ apr: 5.25, termMonths: 180, closingCosts: 4000 });
  });
});
