import { useMemo, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import {
  useCashFlowSummary,
  useDeleteRecurringExpense,
  useMarkRecurringExpensePaid,
  useRecurringExpenses,
} from '../hooks';
import { HideNumbersToggle, LoadingSpinner } from '../components/shared';
import ExpenseForm from '../components/fixedcosts/ExpenseForm';
import CategoryBadge from '../components/fixedcosts/CategoryBadge';
import AccountsPanel from '../components/fixedcosts/AccountsPanel';
import {
  CATEGORIES,
  DUE_SOON_DAYS,
  daysUntil,
  fmtUSD,
  frequencyLabel,
} from '../components/fixedcosts/constants';
import { MASK } from '../components/networth/format';
import { useUIStore, type ComingUpDays } from '../store/uiStore';
import { parseLocalDateString } from '../utils/date';
import type { ExpenseCategory, RecurringExpense } from '../types';

type Filter = 'All' | ExpenseCategory;

function StatCard({
  label,
  value,
  sub,
  bgClass,
  valueClass,
}: {
  label: string;
  value: string;
  sub: ReactNode;
  bgClass: string;
  valueClass: string;
}) {
  return (
    <div className={`${bgClass} rounded-xl px-5 py-4 flex flex-col gap-1 shadow-sm`}>
      <span className="text-xs font-medium text-slate-600 dark:text-slate-300 uppercase tracking-widest">
        {label}
      </span>
      <span className={`text-2xl font-bold tabular-nums ${valueClass}`}>{value}</span>
      <span className="text-xs text-slate-600 dark:text-slate-400">{sub}</span>
    </div>
  );
}

function dueHint(days: number | null): { text: string; className: string } {
  if (days === null) return { text: 'No date set', className: 'text-slate-500' };
  if (days < 0)
    return {
      text: `Overdue by ${-days} ${days === -1 ? 'day' : 'days'}`,
      className: 'text-red-600 dark:text-red-400',
    };
  if (days === 0) return { text: 'Due today', className: 'text-amber-700 dark:text-amber-400' };
  const text = `In ${days} ${days === 1 ? 'day' : 'days'}`;
  return {
    text,
    className: days <= DUE_SOON_DAYS ? 'text-amber-700 dark:text-amber-400' : 'text-slate-500',
  };
}

/** Fixed costs above these shares of take-home income turn the tile amber, then red. */
const INCOME_SHARE_OK = 50;
const INCOME_SHARE_HIGH = 65;

function incomeShareTone(pct: number | null): { bgClass: string; valueClass: string } {
  if (pct === null)
    return {
      bgClass:
        'bg-slate-100 border-2 border-dashed border-slate-300 dark:bg-slate-800 dark:border-slate-600',
      valueClass: 'text-slate-500 dark:text-slate-400',
    };
  if (pct > INCOME_SHARE_HIGH)
    return {
      bgClass: 'bg-red-100 border-2 border-red-300 dark:bg-red-900/50 dark:border-red-600',
      valueClass: 'text-red-900 dark:text-red-100',
    };
  if (pct >= INCOME_SHARE_OK)
    return {
      bgClass: 'bg-amber-100 border-2 border-amber-300 dark:bg-amber-900/50 dark:border-amber-600',
      valueClass: 'text-amber-900 dark:text-amber-100',
    };
  return {
    bgClass:
      'bg-emerald-100 border-2 border-emerald-300 dark:bg-emerald-900/50 dark:border-emerald-600',
    valueClass: 'text-emerald-900 dark:text-emerald-100',
  };
}

const COMING_UP_WINDOWS: ComingUpDays[] = [7, 14, 30];

/** Bills shown in "Coming up" before "View all". */
const COMING_UP_PREVIEW = 5;

const fmtDate = (iso: string, opts: Intl.DateTimeFormatOptions) =>
  parseLocalDateString(iso).toLocaleDateString('en-US', opts);

export default function FixedCosts() {
  const { data, isLoading, isError } = useRecurringExpenses();
  const deleteMutation = useDeleteRecurringExpense();
  const markPaidMutation = useMarkRecurringExpensePaid();
  const { data: cashFlow } = useCashFlowSummary();
  const hidden = useUIStore((s) => s.hideBalances);
  const money = (v: number) => (hidden ? MASK : fmtUSD(v));
  const comingUpDays = useUIStore((s) => s.comingUpDays);
  const setComingUpDays = useUIStore((s) => s.setComingUpDays);

  const [filter, setFilter] = useState<Filter>('All');
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<RecurringExpense | null>(null);
  const [confirmId, setConfirmId] = useState<number | null>(null);
  const [showAllSoon, setShowAllSoon] = useState(false);

  const expenses = useMemo(() => data ?? [], [data]);

  const stats = useMemo(() => {
    const monthly = expenses.reduce((s, e) => s + e.monthly_amount, 0);
    const autopay = expenses.filter((e) => e.autopay).length;
    const soon = expenses
      .map((e) => ({ expense: e, days: daysUntil(e.next_due_date) }))
      .filter(
        (x): x is { expense: RecurringExpense; days: number } =>
          x.days !== null && x.days <= comingUpDays,
      )
      .sort((a, b) => a.days - b.days);
    const segments = CATEGORIES.map((c) => ({
      ...c,
      monthly: expenses
        .filter((e) => e.category === c.name)
        .reduce((s, e) => s + e.monthly_amount, 0),
    }))
      .filter((c) => c.monthly > 0)
      .sort((a, b) => b.monthly - a.monthly)
      .map((c) => ({ ...c, pct: monthly > 0 ? (c.monthly / monthly) * 100 : 0 }));
    return {
      monthly,
      autopay,
      soon,
      soonTotal: soon.reduce((s, x) => s + x.expense.amount, 0),
      overdue: soon.filter((x) => x.days < 0).length,
      // Overdue bills are always listed, even when there are more than the preview fits.
      preview: soon.slice(0, Math.max(COMING_UP_PREVIEW, soon.filter((x) => x.days < 0).length)),
      segments,
    };
  }, [expenses, comingUpDays]);

  const monthlyIncome = cashFlow?.monthly_income ?? 0;
  const incomeSharePct = monthlyIncome > 0 ? (stats.monthly / monthlyIncome) * 100 : null;

  const presentCategories = CATEGORIES.filter((c) => expenses.some((e) => e.category === c.name));
  // Fall back to "All" when the filtered category's last bill was deleted.
  const activeFilter: Filter = presentCategories.some((c) => c.name === filter) ? filter : 'All';

  const groups = useMemo(
    () =>
      CATEGORIES.filter((c) => activeFilter === 'All' || activeFilter === c.name)
        .map((c) => {
          const items = expenses.filter((e) => e.category === c.name);
          return { ...c, items, monthly: items.reduce((s, e) => s + e.monthly_amount, 0) };
        })
        .filter((g) => g.items.length > 0),
    [expenses, activeFilter],
  );
  const shownMonthly = groups.reduce((s, g) => s + g.monthly, 0);

  const openAdd = () => {
    setEditing(null);
    setFormOpen(true);
  };
  const openEdit = (expense: RecurringExpense) => {
    setConfirmId(null);
    setEditing(expense);
    setFormOpen(true);
  };
  const closeForm = () => {
    setFormOpen(false);
    setEditing(null);
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <LoadingSpinner size="lg" />
      </div>
    );
  }

  if (isError) {
    return (
      <div className="flex items-center gap-2 px-4 py-3 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-sm text-red-700 dark:text-red-400">
        Failed to load fixed costs. Please try again.
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* ── page header ── */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Fixed Costs</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
            Bills you pay on a schedule. Totals convert every bill to a monthly amount.
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
            Add expense
          </button>
        </div>
      </div>

      {expenses.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 px-6 py-14 flex flex-col items-center gap-3 text-center">
          <p className="text-base font-semibold text-slate-900 dark:text-white">
            No fixed costs yet
          </p>
          <p className="text-sm text-slate-500 dark:text-slate-400 max-w-md">
            Add your rent or mortgage, utilities, insurance and subscriptions to see what you spend
            every month before anything else.
          </p>
          <button
            onClick={openAdd}
            className="mt-2 px-4 py-2.5 bg-slate-900 dark:bg-white text-white dark:text-slate-900 text-sm font-semibold rounded-lg"
          >
            Add your first expense
          </button>
        </div>
      ) : (
        <>
          {/* ── stat cards ── */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <StatCard
              label="Per month"
              value={money(stats.monthly)}
              sub={`${money(stats.monthly * 12)} per year`}
              valueClass="text-blue-900 dark:text-blue-100"
              bgClass="bg-blue-100 border-2 border-blue-300 dark:bg-blue-900/50 dark:border-blue-600"
            />
            <StatCard
              label="Share of income"
              value={incomeSharePct === null ? '—' : `${incomeSharePct.toFixed(0)}%`}
              sub={
                incomeSharePct === null ? (
                  <>
                    <Link to="/cash-flow" className="underline">
                      Add your income
                    </Link>{' '}
                    to see this
                  </>
                ) : (
                  `of ${money(monthlyIncome)} take-home per month`
                )
              }
              {...incomeShareTone(incomeSharePct)}
            />
            <StatCard
              label="Bills"
              value={String(expenses.length)}
              sub={`${stats.autopay} on autopay · ${expenses.length - stats.autopay} paid manually`}
              valueClass="text-slate-900 dark:text-white"
              bgClass="bg-slate-200 border-2 border-slate-400 dark:bg-slate-700 dark:border-slate-500"
            />
            <StatCard
              label={`Due in next ${comingUpDays} days`}
              value={money(stats.soonTotal)}
              sub={`${stats.soon.length} ${stats.soon.length === 1 ? 'bill' : 'bills'}${
                stats.overdue ? ` · ${stats.overdue} overdue` : ''
              }`}
              valueClass="text-amber-900 dark:text-amber-100"
              bgClass="bg-amber-100 border-2 border-amber-300 dark:bg-amber-900/50 dark:border-amber-600"
            />
          </div>

          {/* ── breakdown + upcoming ── */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-5 space-y-4">
              <div className="flex items-baseline justify-between gap-3">
                <h2 className="text-sm font-semibold text-slate-900 dark:text-white">
                  Where it goes
                </h2>
                <span className="text-xs text-slate-500 dark:text-slate-400">
                  Share of monthly total
                </span>
              </div>
              <div
                className="flex h-3.5 rounded-full overflow-hidden bg-slate-100 dark:bg-slate-700"
                role="img"
                aria-label={stats.segments.map((s) => `${s.name} ${s.pct.toFixed(0)}%`).join(', ')}
              >
                {stats.segments.map((s) => (
                  <div key={s.name} style={{ width: `${s.pct}%`, background: s.color }} />
                ))}
              </div>
              <ul className="space-y-2">
                {stats.segments.map((s) => (
                  <li key={s.name} className="flex items-center gap-2.5 text-sm">
                    <span
                      className="h-2.5 w-2.5 rounded-sm shrink-0"
                      style={{ background: s.color }}
                      aria-hidden="true"
                    />
                    <span className="flex-1 text-slate-700 dark:text-slate-300">{s.name}</span>
                    <span className="tabular-nums text-slate-700 dark:text-slate-300">
                      {money(s.monthly)} / mo
                    </span>
                    <span className="w-12 text-right font-semibold tabular-nums text-slate-900 dark:text-white">
                      {s.pct.toFixed(s.pct < 10 ? 1 : 0)}%
                    </span>
                  </li>
                ))}
              </ul>
            </div>

            <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-5">
              <div className="flex items-center justify-between gap-3 mb-2">
                <div className="min-w-0">
                  <h2 className="text-sm font-semibold text-slate-900 dark:text-white">
                    Coming up
                  </h2>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Next {comingUpDays} days
                  </p>
                </div>
                <div
                  role="group"
                  aria-label="Coming up window"
                  className="inline-flex shrink-0 rounded-lg bg-slate-100 dark:bg-slate-700 p-0.5"
                >
                  {COMING_UP_WINDOWS.map((d) => {
                    const active = comingUpDays === d;
                    return (
                      <button
                        key={d}
                        type="button"
                        onClick={() => {
                          setComingUpDays(d);
                          setShowAllSoon(false);
                        }}
                        aria-pressed={active}
                        aria-label={`Next ${d} days`}
                        className={`h-7 min-w-9 px-2 rounded-md text-xs font-semibold tabular-nums transition-colors ${
                          active
                            ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-sm'
                            : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                        }`}
                      >
                        {d}d
                      </button>
                    );
                  })}
                </div>
              </div>
              {stats.soon.length === 0 ? (
                <p className="text-sm text-slate-500 dark:text-slate-400 py-2">
                  Nothing due in the next {comingUpDays} days.
                </p>
              ) : (
                <ul>
                  {(showAllSoon ? stats.soon : stats.preview).map(({ expense, days }) => (
                    <li
                      key={expense.id}
                      className={`flex items-center gap-3 py-2.5 ${
                        days < 0
                          ? '-mx-2 px-2 my-1 first:mt-0 rounded-lg bg-red-50 dark:bg-red-900/20 ring-1 ring-red-200 dark:ring-red-800'
                          : 'border-t border-slate-100 dark:border-slate-700 first:border-t-0'
                      }`}
                    >
                      <div
                        className={`w-11 shrink-0 rounded-lg py-1 flex flex-col items-center ${
                          days < 0
                            ? 'bg-red-100 dark:bg-red-900/40'
                            : 'bg-slate-100 dark:bg-slate-700'
                        }`}
                      >
                        <span
                          className={`text-[11px] font-semibold uppercase tracking-wide ${
                            days < 0
                              ? 'text-red-700 dark:text-red-300'
                              : 'text-slate-500 dark:text-slate-400'
                          }`}
                        >
                          {fmtDate(expense.next_due_date!, { month: 'short' })}
                        </span>
                        <span className="text-base font-bold leading-tight text-slate-900 dark:text-white">
                          {fmtDate(expense.next_due_date!, { day: 'numeric' })}
                        </span>
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-slate-900 dark:text-white truncate">
                          {expense.name}
                        </p>
                        <p className="text-xs text-slate-500 dark:text-slate-400">
                          {expense.autopay ? 'Autopay' : 'Pay manually'} ·{' '}
                          {days < 0 ? (
                            <span className="font-semibold text-red-600 dark:text-red-400">
                              overdue by {-days} {days === -1 ? 'day' : 'days'}
                            </span>
                          ) : days === 0 ? (
                            'today'
                          ) : (
                            `in ${days} ${days === 1 ? 'day' : 'days'}`
                          )}
                        </p>
                      </div>
                      <div className="flex shrink-0 flex-col-reverse items-end gap-1 sm:flex-row sm:items-center sm:gap-3">
                        {!expense.autopay && (
                          <button
                            type="button"
                            onClick={() => markPaidMutation.mutate(expense.id)}
                            disabled={markPaidMutation.isPending}
                            aria-label={`Mark ${expense.name} paid`}
                            title="Moves the due date to the next period"
                            className={`h-8 px-3 rounded-lg text-xs font-semibold whitespace-nowrap transition-colors disabled:opacity-50 ${
                              days < 0
                                ? 'bg-emerald-600 text-white hover:bg-emerald-700'
                                : 'border border-emerald-300 dark:border-emerald-700 text-emerald-700 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-900/30'
                            }`}
                          >
                            Mark paid
                          </button>
                        )}
                        <span className="text-sm font-semibold tabular-nums text-slate-900 dark:text-white">
                          {money(expense.amount)}
                        </span>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
              {stats.soon.length > stats.preview.length && (
                <button
                  type="button"
                  onClick={() => setShowAllSoon((v) => !v)}
                  aria-expanded={showAllSoon}
                  className="mt-2 text-sm font-medium text-blue-700 dark:text-blue-400 hover:underline"
                >
                  {showAllSoon ? 'Show fewer' : `View all ${stats.soon.length}`}
                </button>
              )}
            </div>
          </div>

          <AccountsPanel days={comingUpDays} />

          {/* ── table ── */}
          <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 overflow-hidden">
            <div className="flex flex-wrap gap-2 px-4 py-3 border-b border-slate-200 dark:border-slate-700">
              {(['All', ...presentCategories.map((c) => c.name)] as Filter[]).map((name) => {
                const count =
                  name === 'All'
                    ? expenses.length
                    : expenses.filter((e) => e.category === name).length;
                const active = activeFilter === name;
                return (
                  <button
                    key={name}
                    type="button"
                    onClick={() => {
                      setFilter(name);
                      setConfirmId(null);
                    }}
                    aria-pressed={active}
                    className={`h-9 px-3.5 rounded-full text-sm transition-colors ${
                      active
                        ? 'bg-slate-900 text-white font-semibold dark:bg-white dark:text-slate-900'
                        : 'border border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700'
                    }`}
                  >
                    {name} ({count})
                  </button>
                );
              })}
            </div>

            <div className="overflow-x-auto">
              <table className="w-full min-w-[900px] text-sm">
                <thead>
                  <tr className="bg-[#1e3a5f] text-slate-100 text-xs uppercase tracking-wider">
                    <th className="text-left font-semibold px-4 py-3">Expense</th>
                    <th className="text-left font-semibold px-3 py-3">How often</th>
                    <th className="text-left font-semibold px-3 py-3">Next due</th>
                    <th className="text-left font-semibold px-3 py-3">Paid from</th>
                    <th className="text-left font-semibold px-3 py-3">Autopay</th>
                    <th className="text-right font-semibold px-3 py-3">Amount</th>
                    <th className="text-right font-semibold px-3 py-3">Per month</th>
                    <th className="px-4 py-3">
                      <span className="sr-only">Actions</span>
                    </th>
                  </tr>
                </thead>
                {groups.map((g) => (
                  <tbody key={g.name}>
                    <tr className="bg-slate-50 dark:bg-slate-900/40 border-y border-slate-200 dark:border-slate-700">
                      <th colSpan={6} scope="rowgroup" className="text-left px-4 py-2.5">
                        <span className="inline-flex items-center gap-2 font-bold text-slate-900 dark:text-white">
                          <span
                            className="h-2.5 w-2.5 rounded-sm"
                            style={{ background: g.color }}
                            aria-hidden="true"
                          />
                          {g.name}
                          <span className="font-normal text-slate-500 dark:text-slate-400">
                            · {g.items.length} {g.items.length === 1 ? 'bill' : 'bills'}
                          </span>
                        </span>
                      </th>
                      <td className="text-right px-3 py-2.5 font-semibold tabular-nums text-slate-800 dark:text-slate-200">
                        {money(g.monthly)}
                      </td>
                      <td />
                    </tr>
                    {g.items.map((e) => {
                      const hint = dueHint(daysUntil(e.next_due_date));
                      const confirming = confirmId === e.id;
                      return (
                        <tr
                          key={e.id}
                          className="border-b border-slate-100 dark:border-slate-700/60 hover:bg-slate-50 dark:hover:bg-slate-700/40"
                        >
                          <td className="px-4 py-2.5">
                            <div className="flex items-center gap-3">
                              <CategoryBadge category={e.category} />
                              <div className="min-w-0">
                                <p className="font-semibold text-slate-900 dark:text-white">
                                  {e.name}
                                </p>
                                {e.notes && (
                                  <p className="text-[13px] text-slate-500 dark:text-slate-400">
                                    {e.notes}
                                  </p>
                                )}
                              </div>
                            </div>
                          </td>
                          <td className="px-3 py-2.5 text-slate-700 dark:text-slate-300">
                            {frequencyLabel(e.frequency)}
                          </td>
                          <td className="px-3 py-2.5">
                            <p className="tabular-nums text-slate-900 dark:text-white">
                              {e.next_due_date
                                ? fmtDate(e.next_due_date, {
                                    month: 'short',
                                    day: 'numeric',
                                    year: 'numeric',
                                  })
                                : '—'}
                            </p>
                            <p className={`text-xs ${hint.className}`}>{hint.text}</p>
                          </td>
                          <td className="px-3 py-2.5 text-slate-700 dark:text-slate-300">
                            {e.paid_from ?? '—'}
                          </td>
                          <td className="px-3 py-2.5">
                            <span
                              className={`inline-block px-2 py-0.5 rounded-full text-xs font-semibold ${
                                e.autopay
                                  ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300'
                                  : 'bg-[#FEF3C7] text-[#92400E] dark:bg-amber-900/40 dark:text-amber-300'
                              }`}
                            >
                              {e.autopay ? 'On' : 'Manual'}
                            </span>
                          </td>
                          <td className="px-3 py-2.5 text-right font-semibold tabular-nums text-slate-900 dark:text-white">
                            {money(e.amount)}
                          </td>
                          <td className="px-3 py-2.5 text-right tabular-nums text-slate-700 dark:text-slate-300">
                            {money(e.monthly_amount)}
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
                                      deleteMutation.mutate(e.id, {
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
                                  {/* Autopay bills advance on their own; manual ones are marked paid here. */}
                                  {!e.autopay && e.next_due_date && (
                                    <button
                                      type="button"
                                      onClick={() => markPaidMutation.mutate(e.id)}
                                      disabled={markPaidMutation.isPending}
                                      aria-label={`Mark ${e.name} paid`}
                                      title="Mark as paid (moves the due date to the next period)"
                                      className="h-8 px-2.5 mr-1 inline-flex items-center gap-1 whitespace-nowrap rounded-lg border border-emerald-300 dark:border-emerald-700 text-xs font-semibold text-emerald-700 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-900/30 disabled:opacity-50"
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
                                        <circle cx="12" cy="12" r="9" />
                                        <path d="m8 12.5 2.5 2.5L16 9.5" />
                                      </svg>
                                      Mark paid
                                    </button>
                                  )}
                                  <button
                                    type="button"
                                    onClick={() => openEdit(e)}
                                    aria-label={`Edit ${e.name}`}
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
                                    onClick={() => setConfirmId(e.id)}
                                    aria-label={`Delete ${e.name}`}
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
                ))}
                <tfoot>
                  <tr className="bg-slate-50 dark:bg-slate-900/40 border-t-2 border-slate-200 dark:border-slate-700 font-bold text-slate-900 dark:text-white">
                    <td colSpan={6} className="px-4 py-3">
                      {activeFilter === 'All' ? 'Total' : `${activeFilter} total`}
                    </td>
                    <td className="px-3 py-3 text-right tabular-nums">{money(shownMonthly)}</td>
                    <td />
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        </>
      )}

      {formOpen && (
        <ExpenseForm
          expense={editing}
          defaultCategory={activeFilter === 'All' ? undefined : activeFilter}
          onClose={closeForm}
        />
      )}
    </div>
  );
}
