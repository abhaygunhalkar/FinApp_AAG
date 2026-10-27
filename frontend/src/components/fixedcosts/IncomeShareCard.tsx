import { Link } from 'react-router-dom';
import { categoryFill } from './constants';

/** Costs above these shares of take-home income turn the card amber, then red. */
const COSTS_SHARE_OK = 50;
const COSTS_SHARE_HIGH = 75;

/** Less than this left over each month gets a warning. */
const LEFT_OVER_WARN = 500;

const COSTS_COLOR = '#BA7517';
const POPOVER_ID = 'income-share-breakdown';
const LEFT_OVER_COLOR = '#cbd5e1';
const SAVINGS_FILL = categoryFill('Savings & investing');

function tone(pct: number | null): { bgClass: string; valueClass: string } {
  if (pct === null)
    return {
      bgClass:
        'bg-slate-100 border-2 border-dashed border-slate-300 dark:bg-slate-800 dark:border-slate-600',
      valueClass: 'text-slate-500 dark:text-slate-400',
    };
  if (pct > COSTS_SHARE_HIGH)
    return {
      bgClass: 'bg-red-100 border-2 border-red-300 dark:bg-red-900/50 dark:border-red-600',
      valueClass: 'text-red-900 dark:text-red-100',
    };
  if (pct >= COSTS_SHARE_OK)
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

/** Whole percent, or "<1%" for a small positive share. */
function fmtPct(pct: number): string {
  return pct > 0 && pct < 1 ? '<1%' : `${Math.round(pct)}%`;
}

function WarningIcon() {
  return (
    <svg
      viewBox="0 0 16 16"
      fill="currentColor"
      className="h-3.5 w-3.5 shrink-0"
      aria-hidden="true"
    >
      <path
        fillRule="evenodd"
        d="M6.7 2.25a1.5 1.5 0 0 1 2.6 0l5.03 8.78A1.5 1.5 0 0 1 13.03 13.3H2.97a1.5 1.5 0 0 1-1.3-2.27zM8 5a.75.75 0 0 1 .75.75v2.5a.75.75 0 0 1-1.5 0v-2.5A.75.75 0 0 1 8 5m0 6.25a.9.9 0 1 0 0-1.8.9.9 0 0 0 0 1.8"
      />
    </svg>
  );
}

/**
 * "Share of income" tile: how take-home splits into fixed costs, savings and what's
 * left over. The headline and colour judge costs only; savings is money kept.
 */
export default function IncomeShareCard({
  monthly,
  savings,
  income,
  money,
}: {
  /** All fixed costs per month, savings included. */
  monthly: number;
  savings: number;
  /** Monthly take-home; 0 when no income is entered. */
  income: number;
  money: (v: number) => string;
}) {
  const label = (
    <span className="text-xs font-medium text-slate-600 dark:text-slate-300 uppercase tracking-widest">
      Share of income
    </span>
  );

  if (income <= 0) {
    const t = tone(null);
    return (
      <div className={`${t.bgClass} rounded-xl px-5 py-4 flex flex-col gap-1 shadow-sm`}>
        {label}
        <span className={`text-2xl font-bold tabular-nums ${t.valueClass}`}>—</span>
        <span className="text-xs text-slate-600 dark:text-slate-400">
          <Link to="/cash-flow" className="underline">
            Add your income
          </Link>{' '}
          to see this
        </span>
      </div>
    );
  }

  const costs = monthly - savings;
  const leftOver = income - monthly;
  const pct = (v: number) => (v / income) * 100;
  const costsPct = pct(costs);
  const t = tone(costsPct);

  const rows = [
    { key: 'costs', name: 'Costs', note: null, value: costs, fill: COSTS_COLOR },
    { key: 'savings', name: 'Savings', note: 'you keep this', value: savings, fill: SAVINGS_FILL },
    { key: 'left', name: 'Left over', note: null, value: leftOver, fill: LEFT_OVER_COLOR },
  ];
  // Left over always shows a sliver (unless overspent); empty costs/savings are left out.
  const segments = rows.filter((r) => (r.key === 'left' ? r.value >= 0 : r.value > 0));

  // Savings always shows; only the left-over half turns into a warning when it's thin.
  const leftPart =
    leftOver < 0 ? (
      <span className="inline-flex items-center gap-1 whitespace-nowrap font-medium text-red-700 dark:text-red-300">
        <WarningIcon />
        Over take-home by {money(-leftOver)}
      </span>
    ) : leftOver < LEFT_OVER_WARN ? (
      <span className="inline-flex items-center gap-1 whitespace-nowrap font-medium text-amber-800 dark:text-amber-300">
        <WarningIcon />
        Only {money(leftOver)}/mo left over
      </span>
    ) : (
      <span className="whitespace-nowrap">
        {fmtPct(pct(leftOver))} left over ({money(leftOver)})
      </span>
    );
  const sub = (
    <span className="text-slate-600 dark:text-slate-400">
      {/* Each part stays whole, so a narrow card breaks the line at the dot. */}
      <span className="whitespace-nowrap">
        {fmtPct(pct(savings))} savings ({money(savings)}) ·
      </span>{' '}
      {leftPart}
    </span>
  );

  return (
    // Focusable so the breakdown opens from the keyboard and on tap, not just on hover.
    <div
      tabIndex={0}
      aria-describedby={POPOVER_ID}
      className={`${t.bgClass} group relative rounded-xl px-5 py-4 flex flex-col gap-1 shadow-sm cursor-default outline-none focus-visible:ring-2 focus-visible:ring-slate-500 focus-visible:ring-offset-2`}
    >
      {label}
      <div className="flex items-baseline gap-2">
        <span className={`text-2xl font-bold tabular-nums ${t.valueClass}`}>
          {fmtPct(costsPct)}
        </span>
        <span className="text-xs text-slate-600 dark:text-slate-400">goes to costs</span>
      </div>

      <div
        className="my-1 flex h-1.5 gap-[2px] rounded-full overflow-hidden"
        role="img"
        aria-label={rows
          .filter((r) => r.value > 0)
          .map((r) => `${r.name} ${fmtPct(pct(r.value))}`)
          .join(', ')}
      >
        {segments.map((r) => (
          <div
            key={r.key}
            className={r.key === 'left' ? 'min-w-[3px]' : undefined}
            style={{ flex: `${Math.max(r.value, 0)} 1 0`, background: r.fill }}
          />
        ))}
      </div>

      <span className="text-xs">{sub}</span>

      <div
        id={POPOVER_ID}
        role="tooltip"
        className="invisible opacity-0 group-hover:visible group-hover:opacity-100 group-focus:visible group-focus:opacity-100 transition-opacity absolute left-0 top-full z-20 mt-2 w-max min-w-full max-w-[calc(100vw-2rem)] rounded-lg border border-slate-200 bg-white p-3 shadow-lg dark:border-slate-700 dark:bg-slate-800"
      >
        <ul className="space-y-1 text-[13px]">
          {rows.map((r) => (
            <li key={r.key} className="flex items-start gap-2">
              <span
                className="mt-[5px] h-2.5 w-2.5 rounded-sm shrink-0"
                style={{ background: r.fill }}
                aria-hidden="true"
              />
              <span className="flex-1 min-w-0 text-slate-700 dark:text-slate-300">
                {r.name}
                {r.note && ' '}
                {r.note && (
                  <span className="whitespace-nowrap text-slate-500 dark:text-slate-400">
                    · {r.note}
                  </span>
                )}
              </span>
              <span className="shrink-0 whitespace-nowrap tabular-nums text-slate-800 dark:text-slate-200">
                {money(r.value)} · {fmtPct(pct(r.value))}
              </span>
            </li>
          ))}
        </ul>
        <p className="mt-2 border-t border-slate-100 pt-2 text-xs text-slate-500 dark:border-slate-700 dark:text-slate-400">
          of {money(income)} take-home per month
        </p>
      </div>
    </div>
  );
}
