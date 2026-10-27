import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  useCashFlowSummary,
  useDeleteIncomeSource,
  useIncomeSources,
  useRecurringExpenses,
} from '../hooks';
import { HideNumbersToggle, LoadingSpinner } from '../components/shared';
import IncomeForm from '../components/cashflow/IncomeForm';
import {
  EMERGENCY_TARGET_MAX,
  EMERGENCY_TARGET_MIN,
  INCOME_CATEGORIES,
  incomeColor,
} from '../components/cashflow/constants';
import { CATEGORIES, fmtUSD, frequencyLabel } from '../components/fixedcosts/constants';
import { MASK } from '../components/networth/format';
import { useUIStore } from '../store/uiStore';
import { parseLocalDateString } from '../utils/date';
import type { IncomeSource } from '../types';

/** Colour classes for the emergency-fund reading against the 3–6 month guidance. */
function emergencyTone(months: number) {
  if (months >= EMERGENCY_TARGET_MAX)
    return {
      label: 'Fully covered',
      text: 'text-emerald-800 dark:text-emerald-200',
      card: 'bg-emerald-100 border-emerald-300 dark:bg-emerald-900/50 dark:border-emerald-600',
      bar: 'bg-emerald-600',
    };
  if (months >= EMERGENCY_TARGET_MIN)
    return {
      label: 'Within the 3–6 month range',
      text: 'text-amber-900 dark:text-amber-100',
      card: 'bg-amber-100 border-amber-300 dark:bg-amber-900/50 dark:border-amber-600',
      bar: 'bg-amber-500',
    };
  return {
    label: 'Below 3 months',
    text: 'text-red-800 dark:text-red-200',
    card: 'bg-red-100 border-red-300 dark:bg-red-900/50 dark:border-red-600',
    bar: 'bg-red-600',
  };
}

function StatCard({
  label,
  value,
  sub,
  bgClass,
  valueClass,
}: {
  label: string;
  value: string;
  sub: React.ReactNode;
  bgClass: string;
  valueClass: string;
}) {
  return (
    <div className={`${bgClass} border-2 rounded-xl px-5 py-4 flex flex-col gap-1 shadow-sm`}>
      <span className="text-xs font-medium text-slate-600 dark:text-slate-300 uppercase tracking-widest">
        {label}
      </span>
      <span className={`text-2xl font-bold tabular-nums ${valueClass}`}>{value}</span>
      <span className="text-xs text-slate-600 dark:text-slate-400">{sub}</span>
    </div>
  );
}

export default function CashFlow() {
  const { data: summary, isLoading: summaryLoading, isError } = useCashFlowSummary();
  const { data: incomeData, isLoading: incomeLoading } = useIncomeSources();
  const { data: expenseData } = useRecurringExpenses();
  const deleteMutation = useDeleteIncomeSource();
  const hidden = useUIStore((s) => s.hideBalances);
  const money = (v: number) => (hidden ? MASK : fmtUSD(v));

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<IncomeSource | null>(null);
  const [confirmId, setConfirmId] = useState<number | null>(null);

  const incomes = useMemo(() => incomeData ?? [], [incomeData]);
  const expenses = useMemo(() => expenseData ?? [], [expenseData]);

  // Income split into fixed-cost categories plus what's left; scaled to income,
  // or to fixed costs when they exceed income.
  const flow = useMemo(() => {
    const income = summary?.monthly_income ?? 0;
    const fixed = summary?.monthly_fixed_costs ?? 0;
    const scale = Math.max(income, fixed);
    const parts = CATEGORIES.map((c): { name: string; color: string; monthly: number } => ({
      name: c.name,
      color: c.color,
      monthly: expenses
        .filter((e) => e.category === c.name)
        .reduce((s, e) => s + e.monthly_amount, 0),
    }))
      .filter((p) => p.monthly > 0)
      .sort((a, b) => b.monthly - a.monthly);
    const left = income - fixed;
    if (left > 0) parts.push({ name: 'Left after fixed costs', color: '#16a34a', monthly: left });
    return {
      income,
      parts: parts.map((p) => ({
        ...p,
        width: scale > 0 ? (p.monthly / scale) * 100 : 0,
        pctOfIncome: income > 0 ? (p.monthly / income) * 100 : null,
      })),
    };
  }, [summary, expenses]);

  const openAdd = () => {
    setEditing(null);
    setFormOpen(true);
  };
  const openEdit = (income: IncomeSource) => {
    setConfirmId(null);
    setEditing(income);
    setFormOpen(true);
  };

  if (summaryLoading || incomeLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <LoadingSpinner size="lg" />
      </div>
    );
  }

  if (isError || !summary) {
    return (
      <div className="flex items-center gap-2 px-4 py-3 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-sm text-red-700 dark:text-red-400">
        Failed to load cash flow. Please try again.
      </div>
    );
  }

  const surplus = summary.monthly_surplus;
  const months = summary.emergency_months;
  const tone = months === null ? null : emergencyTone(months);
  const sortedIncomes = INCOME_CATEGORIES.flatMap((c) =>
    incomes.filter((i) => i.category === c.name),
  );

  return (
    <div className="space-y-5">
      {/* ── page header ── */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Cash Flow</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
            What comes in each month, what your fixed costs take, and what's left.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <HideNumbersToggle />
          <button
            onClick={openAdd}
            className="inline-flex items-center gap-2 px-4 py-2.5 bg-slate-900 dark:bg-white text-white dark:text-slate-900 text-sm font-semibold rounded-lg shadow-sm hover:bg-slate-700 dark:hover:bg-slate-100 transition-colors"
          >
            <svg viewBox="0 0 16 16" fill="currentColor" className="w-4 h-4" aria-hidden="true">
              <path d="M8.75 3.75a.75.75 0 0 0-1.5 0v3.5h-3.5a.75.75 0 0 0 0 1.5h3.5v3.5a.75.75 0 0 0 1.5 0v-3.5h3.5a.75.75 0 0 0 0-1.5h-3.5v-3.5Z" />
            </svg>
            Add income
          </button>
        </div>
      </div>

      {/* ── stat cards ── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard
          label="Monthly income"
          value={money(summary.monthly_income)}
          sub={`${incomes.length} ${incomes.length === 1 ? 'source' : 'sources'}, take-home`}
          valueClass="text-emerald-900 dark:text-emerald-100"
          bgClass="bg-emerald-50 border-emerald-300 dark:bg-emerald-900/40 dark:border-emerald-600"
        />
        <StatCard
          label="Fixed costs"
          value={money(summary.monthly_fixed_costs)}
          sub={
            <Link to="/fixed-costs" className="underline underline-offset-2 hover:text-slate-900">
              {expenses.length} bills on Fixed Costs
            </Link>
          }
          valueClass="text-slate-900 dark:text-white"
          bgClass="bg-slate-100 border-slate-300 dark:bg-slate-800 dark:border-slate-600"
        />
        <StatCard
          label="Left after fixed costs"
          value={hidden ? MASK : `${surplus < 0 ? '−' : ''}${fmtUSD(Math.abs(surplus))}`}
          sub={
            summary.kept_pct === null
              ? 'Add income to see this'
              : `${summary.kept_pct.toFixed(0)}% of income, before variable spending`
          }
          valueClass={
            surplus < 0 ? 'text-red-700 dark:text-red-300' : 'text-blue-900 dark:text-blue-100'
          }
          bgClass={
            surplus < 0
              ? 'bg-red-50 border-red-300 dark:bg-red-900/40 dark:border-red-600'
              : 'bg-blue-50 border-blue-300 dark:bg-blue-900/40 dark:border-blue-600'
          }
        />
        <StatCard
          label="Emergency fund"
          value={months === null ? '—' : `${months.toFixed(1)} months`}
          sub={
            months === null
              ? 'Add fixed costs to see this'
              : `${money(summary.liquid_cash)} in checking and savings`
          }
          valueClass={tone?.text ?? 'text-slate-900 dark:text-white'}
          bgClass={
            tone?.card ?? 'bg-slate-100 border-slate-300 dark:bg-slate-800 dark:border-slate-600'
          }
        />
      </div>

      {/* ── where income goes + emergency fund ── */}
      <div className="grid grid-cols-1 lg:grid-cols-[3fr_2fr] gap-4">
        <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-5 space-y-4">
          <div className="flex items-baseline justify-between gap-3">
            <h2 className="text-sm font-semibold text-slate-900 dark:text-white">
              Where your income goes
            </h2>
            <span className="text-xs text-slate-500 dark:text-slate-400">Per month</span>
          </div>
          {flow.parts.length === 0 ? (
            <p className="text-sm text-slate-500 dark:text-slate-400">
              Add income and fixed costs to see how they compare.
            </p>
          ) : (
            <>
              <div
                className="flex h-3.5 rounded-full overflow-hidden bg-slate-100 dark:bg-slate-700"
                role="img"
                aria-label={flow.parts
                  .map((p) =>
                    p.pctOfIncome === null ? p.name : `${p.name} ${p.pctOfIncome.toFixed(0)}%`,
                  )
                  .join(', ')}
              >
                {flow.parts.map((p) => (
                  <div key={p.name} style={{ width: `${p.width}%`, background: p.color }} />
                ))}
              </div>
              <ul className="space-y-2">
                {flow.parts.map((p) => (
                  <li key={p.name} className="flex items-center gap-2.5 text-sm">
                    <span
                      className="h-2.5 w-2.5 rounded-sm shrink-0"
                      style={{ background: p.color }}
                      aria-hidden="true"
                    />
                    <span
                      className={`flex-1 ${
                        p.name === 'Left after fixed costs'
                          ? 'font-semibold text-slate-900 dark:text-white'
                          : 'text-slate-700 dark:text-slate-300'
                      }`}
                    >
                      {p.name}
                    </span>
                    <span className="tabular-nums text-slate-700 dark:text-slate-300">
                      {money(p.monthly)}
                    </span>
                    <span className="w-12 text-right font-semibold tabular-nums text-slate-900 dark:text-white">
                      {p.pctOfIncome === null
                        ? '—'
                        : `${p.pctOfIncome.toFixed(p.pctOfIncome < 10 ? 1 : 0)}%`}
                    </span>
                  </li>
                ))}
              </ul>
              {surplus < 0 && (
                <p
                  role="alert"
                  className="text-sm text-red-700 dark:text-red-300 bg-red-50 dark:bg-red-900/30 rounded-lg px-3 py-2"
                >
                  Fixed costs are {money(-surplus)} a month more than your income.
                </p>
              )}
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Percentages are shares of take-home income. Groceries, dining and other variable
                spending aren't tracked, so "left" is before those.
              </p>
            </>
          )}
        </div>

        <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-5 space-y-3">
          <h2 className="text-sm font-semibold text-slate-900 dark:text-white">Emergency fund</h2>
          {months === null || tone === null ? (
            <p className="text-sm text-slate-500 dark:text-slate-400">
              Add bills on{' '}
              <Link to="/fixed-costs" className="underline">
                Fixed Costs
              </Link>{' '}
              to see how many months your cash covers.
            </p>
          ) : (
            <>
              <p className="text-sm text-slate-700 dark:text-slate-300">
                Your checking and savings would cover{' '}
                <span className="font-bold text-slate-900 dark:text-white">
                  {months.toFixed(1)} months
                </span>{' '}
                of fixed costs. {tone.label}.
              </p>
              {/* Scale runs to 12 months; ticks mark the common 3–6 month guidance. */}
              <div className="pt-5">
                <div className="relative h-3 rounded-full bg-slate-100 dark:bg-slate-700">
                  <div
                    className={`h-3 rounded-full ${tone.bar}`}
                    style={{ width: `${Math.min(months / 12, 1) * 100}%` }}
                  />
                  {[EMERGENCY_TARGET_MIN, EMERGENCY_TARGET_MAX].map((m) => (
                    <div
                      key={m}
                      className="absolute -top-5 bottom-0 flex flex-col items-center"
                      style={{ left: `${(m / 12) * 100}%`, transform: 'translateX(-50%)' }}
                      aria-hidden="true"
                    >
                      <span className="text-[11px] text-slate-500">{m} mo</span>
                      <span className="flex-1 w-px bg-slate-400 dark:bg-slate-500" />
                    </div>
                  ))}
                </div>
                <div className="flex justify-between text-[11px] text-slate-500 mt-1">
                  <span>0</span>
                  <span>12+ months</span>
                </div>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Liquid cash is the total of your checking and savings accounts on{' '}
                <Link to="/net-worth" className="underline">
                  Net Worth
                </Link>
                . A common guideline is 3–6 months of essential costs.
              </p>
            </>
          )}
        </div>
      </div>

      {/* ── income table ── */}
      <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 overflow-hidden">
        <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-slate-200 dark:border-slate-700">
          <h2 className="text-sm font-semibold text-slate-900 dark:text-white">Income</h2>
          <span className="text-xs text-slate-500 dark:text-slate-400">Take-home amounts</span>
        </div>
        {incomes.length === 0 ? (
          <div className="px-6 py-12 flex flex-col items-center gap-3 text-center">
            <p className="text-base font-semibold text-slate-900 dark:text-white">No income yet</p>
            <p className="text-sm text-slate-500 dark:text-slate-400 max-w-md">
              Add your paycheck and any other regular income to see what's left after fixed costs.
            </p>
            <button
              onClick={openAdd}
              className="mt-2 px-4 py-2.5 bg-slate-900 dark:bg-white text-white dark:text-slate-900 text-sm font-semibold rounded-lg"
            >
              Add your first income
            </button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[820px] text-sm">
              <thead>
                <tr className="bg-[#1e3a5f] text-slate-100 text-xs uppercase tracking-wider">
                  <th className="text-left font-semibold px-4 py-3">Source</th>
                  <th className="text-left font-semibold px-3 py-3">How often</th>
                  <th className="text-left font-semibold px-3 py-3">Deposited to</th>
                  <th className="text-right font-semibold px-3 py-3">Amount</th>
                  <th className="text-right font-semibold px-3 py-3">Per month</th>
                  <th className="px-4 py-3">
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {sortedIncomes.map((i) => {
                  const confirming = confirmId === i.id;
                  return (
                    <tr
                      key={i.id}
                      className="border-b border-slate-100 dark:border-slate-700/60 hover:bg-slate-50 dark:hover:bg-slate-700/40"
                    >
                      <td className="px-4 py-2.5">
                        <div className="flex items-center gap-3">
                          <span
                            className="h-2.5 w-2.5 rounded-sm shrink-0"
                            style={{ background: incomeColor(i.category) }}
                            aria-hidden="true"
                          />
                          <div className="min-w-0">
                            <p className="font-semibold text-slate-900 dark:text-white">{i.name}</p>
                            <p className="text-[13px] text-slate-500 dark:text-slate-400">
                              {i.category}
                              {i.notes ? ` · ${i.notes}` : ''}
                            </p>
                          </div>
                        </div>
                      </td>
                      <td className="px-3 py-2.5 text-slate-700 dark:text-slate-300">
                        {frequencyLabel(i.frequency)}
                        <p className="text-[13px] text-slate-500 dark:text-slate-400">
                          {i.next_pay_date
                            ? `Next ${parseLocalDateString(i.next_pay_date).toLocaleDateString(
                                'en-US',
                                { weekday: 'short', month: 'short', day: 'numeric' },
                              )}`
                            : 'No pay date set'}
                        </p>
                      </td>
                      <td className="px-3 py-2.5 text-slate-700 dark:text-slate-300">
                        {i.deposited_to ?? '—'}
                      </td>
                      <td className="px-3 py-2.5 text-right font-semibold tabular-nums text-slate-900 dark:text-white">
                        {money(i.amount)}
                      </td>
                      <td className="px-3 py-2.5 text-right tabular-nums text-slate-700 dark:text-slate-300">
                        {money(i.monthly_amount)}
                      </td>
                      <td className="px-3 py-1.5">
                        <div className="flex justify-end gap-1">
                          {confirming ? (
                            <>
                              <button
                                type="button"
                                onClick={() => setConfirmId(null)}
                                className="h-9 px-3 rounded-lg border border-slate-300 dark:border-slate-600 text-xs font-medium text-slate-700 dark:text-slate-200"
                              >
                                Keep
                              </button>
                              <button
                                type="button"
                                onClick={() =>
                                  deleteMutation.mutate(i.id, {
                                    onSuccess: () => setConfirmId(null),
                                  })
                                }
                                disabled={deleteMutation.isPending}
                                className="h-9 px-3 rounded-lg bg-red-700 text-white text-xs font-semibold disabled:opacity-50"
                              >
                                Delete
                              </button>
                            </>
                          ) : (
                            <>
                              <button
                                type="button"
                                onClick={() => openEdit(i)}
                                aria-label={`Edit ${i.name}`}
                                title="Edit"
                                className="h-10 w-10 inline-flex items-center justify-center rounded-lg text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700"
                              >
                                <svg
                                  viewBox="0 0 24 24"
                                  fill="none"
                                  stroke="currentColor"
                                  strokeWidth={1.9}
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                  className="h-4 w-4"
                                  aria-hidden="true"
                                >
                                  <path d="M4 20h4L19 9a2.8 2.8 0 0 0-4-4L4 16v4Z" />
                                  <path d="m13.5 6.5 4 4" />
                                </svg>
                              </button>
                              <button
                                type="button"
                                onClick={() => setConfirmId(i.id)}
                                aria-label={`Delete ${i.name}`}
                                title="Delete"
                                className="h-10 w-10 inline-flex items-center justify-center rounded-lg text-red-700 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/30"
                              >
                                <svg
                                  viewBox="0 0 24 24"
                                  fill="none"
                                  stroke="currentColor"
                                  strokeWidth={1.9}
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                  className="h-4 w-4"
                                  aria-hidden="true"
                                >
                                  <path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3" />
                                </svg>
                              </button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="bg-slate-50 dark:bg-slate-900/40 border-t-2 border-slate-200 dark:border-slate-700 font-bold text-slate-900 dark:text-white">
                  <td colSpan={4} className="px-4 py-3">
                    Total
                  </td>
                  <td className="px-3 py-3 text-right tabular-nums">
                    {money(summary.monthly_income)}
                  </td>
                  <td />
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>

      {formOpen && (
        <IncomeForm
          income={editing}
          onClose={() => {
            setFormOpen(false);
            setEditing(null);
          }}
        />
      )}
    </div>
  );
}
