import type { ReactNode } from 'react';
import { fmtMoney } from '../networth/format';
import {
  addMonths,
  fmtDuration,
  fmtYearMonth,
  insight,
  type Comparison,
  type Scenario,
} from './simulatePayoff';

interface PayoffSummaryProps {
  comparison: Comparison;
  scenario: Scenario;
  changed: boolean;
  hidden: boolean;
}

function Tile({
  label,
  value,
  sub,
  tone = 'plain',
}: {
  label: string;
  value: ReactNode;
  sub: ReactNode;
  tone?: 'plain' | 'good' | 'bad';
}) {
  const color =
    tone === 'good'
      ? 'text-accent-700 dark:text-blue-300'
      : tone === 'bad'
        ? 'text-[#C2410C] dark:text-orange-300'
        : 'text-slate-900 dark:text-white';
  return (
    <div className="rounded-[20px] border border-ink-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-4 py-3.5 sm:px-5">
      <p className="text-[13px] text-slate-500 dark:text-slate-400">{label}</p>
      <p className={`mt-1 text-xl sm:text-2xl font-bold tracking-[-0.01em] tabular-nums ${color}`}>
        {value}
      </p>
      <p className="mt-0.5 text-[13px] text-slate-500 dark:text-slate-400">{sub}</p>
    </div>
  );
}

/** Payoff date, time and interest saved, and (for a refinance) the break-even month. */
export default function PayoffSummary({
  comparison,
  scenario,
  changed,
  hidden,
}: PayoffSummaryProps) {
  const money = (v: number) => fmtMoney(v, hidden);
  const base = comparison.baseline.summary;
  const next = comparison.scenario.summary;
  const saved = comparison.monthsSaved;
  const refi = scenario.refinance;
  const first = comparison.baseline.schedule[0]?.month;

  const timeSaved =
    saved === null
      ? '—'
      : saved > 0
        ? fmtDuration(saved)
        : saved < 0
          ? `+${fmtDuration(-saved)}`
          : '0 mos';

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
        <Tile
          label="Payoff date"
          value={next.payoffMonth ? fmtYearMonth(next.payoffMonth) : 'Never'}
          sub={
            changed && base.payoffMonth && next.payoffMonth !== base.payoffMonth
              ? `was ${fmtYearMonth(base.payoffMonth)}`
              : 'current plan'
          }
          tone={changed && saved !== null && saved > 0 ? 'good' : 'plain'}
        />
        <Tile
          label="Time saved"
          value={timeSaved}
          sub={saved !== null && saved < 0 ? 'longer than now' : 'sooner than now'}
          tone={saved === null || saved === 0 ? 'plain' : saved > 0 ? 'good' : 'bad'}
        />
        <Tile
          label="Interest saved"
          value={money(Math.abs(comparison.interestSaved))}
          sub={
            comparison.interestSaved < -0.5
              ? `more${comparison.closingCosts ? ', with closing costs' : ''}`
              : comparison.closingCosts
                ? 'after closing costs'
                : 'vs. current plan'
          }
          tone={
            comparison.interestSaved > 0.5
              ? 'good'
              : comparison.interestSaved < -0.5
                ? 'bad'
                : 'plain'
          }
        />
        <Tile
          label="Total interest"
          value={money(next.totalInterest)}
          sub={changed ? `vs. ${money(base.totalInterest)} now` : 'over the rest of the loan'}
        />
      </div>

      {refi && (
        <div className="grid grid-cols-2 gap-3 sm:gap-4">
          <Tile
            label="New monthly payment"
            value={money(next.monthlyPayment)}
            sub={`vs. ${money(base.monthlyPayment)} now · principal & interest`}
          />
          <Tile
            label="Break-even"
            value={
              comparison.breakEvenMonth === null ? 'Never' : fmtDuration(comparison.breakEvenMonth)
            }
            sub={
              comparison.breakEvenMonth !== null && first
                ? `interest savings cover ${money(comparison.closingCosts)} by ${fmtYearMonth(
                    addMonths(first, comparison.breakEvenMonth - 1),
                  )}`
                : `savings never cover ${money(comparison.closingCosts)} closing costs`
            }
            tone={comparison.breakEvenMonth === null ? 'bad' : 'good'}
          />
        </div>
      )}

      <p
        className="rounded-[20px] border-l-4 border-accent-500 bg-white dark:bg-slate-800 px-4 py-3 sm:px-5 text-sm font-medium text-slate-800 dark:text-slate-100"
        aria-live="polite"
      >
        {insight(comparison, scenario, money)}
      </p>
    </div>
  );
}
