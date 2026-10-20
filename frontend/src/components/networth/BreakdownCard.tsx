import { fmtMoney, fmtPct } from './format';
import type { BreakdownSegment } from './netWorthMath';

interface BreakdownCardProps {
  title: string;
  total: number;
  segments: BreakdownSegment[];
  hidden: boolean;
  emptyText: string;
}

export default function BreakdownCard({
  title,
  total,
  segments,
  hidden,
  emptyText,
}: BreakdownCardProps) {
  return (
    <section className="rounded-[20px] border border-[#E4E7EC] dark:border-slate-700 bg-white dark:bg-slate-800 p-5 sm:p-6">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">{title}</h2>
        <span className="text-base font-semibold text-slate-900 dark:text-slate-100">
          {fmtMoney(total, hidden)}
        </span>
      </div>

      {segments.length === 0 ? (
        <p className="mt-4 text-sm text-slate-500 dark:text-slate-400">{emptyText}</p>
      ) : (
        <>
          <div
            className="mt-4 flex h-3 w-full gap-0.5 overflow-hidden rounded-full"
            role="img"
            aria-label={segments.map((s) => `${s.label} ${fmtPct(s.pct)}`).join(', ')}
          >
            {segments.map((s) => (
              <div
                key={s.key}
                className="h-full transition-[width] duration-700 ease-out first:rounded-l-full last:rounded-r-full"
                style={{ width: `${Math.max(s.pct, 1.5)}%`, backgroundColor: s.color }}
              />
            ))}
          </div>
          <ul className="mt-4 space-y-2.5">
            {segments.map((s) => (
              <li key={s.key} className="flex items-center justify-between gap-3 text-sm">
                <span className="flex items-center gap-2.5 min-w-0">
                  <span
                    className="h-2.5 w-2.5 shrink-0 rounded-full"
                    style={{ backgroundColor: s.color }}
                    aria-hidden="true"
                  />
                  <span className="truncate text-slate-700 dark:text-slate-200">{s.label}</span>
                </span>
                <span className="flex items-baseline gap-3 shrink-0">
                  <span className="text-slate-500 dark:text-slate-400">
                    {fmtMoney(s.value, hidden)}
                  </span>
                  <span className="w-11 text-right font-semibold text-slate-900 dark:text-slate-100">
                    {fmtPct(s.pct)}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}

export function HomeEquityCard({ onAddProperty }: { onAddProperty: () => void }) {
  return (
    <section className="rounded-[20px] border-2 border-dashed border-[#D0D5DD] dark:border-slate-600 bg-white/60 dark:bg-slate-800/60 p-5 sm:p-6 flex flex-col">
      <div className="h-11 w-11 rounded-xl bg-blue-50 dark:bg-blue-900/30 text-[#1D4ED8] dark:text-blue-300 flex items-center justify-center">
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={1.8}
          className="h-5 w-5"
          aria-hidden="true"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="m3 10.5 9-7 9 7M5 9v10.5h5V14h4v5.5h5V9"
          />
        </svg>
      </div>
      <h2 className="mt-4 text-base font-semibold text-slate-900 dark:text-slate-100">
        See your home equity
      </h2>
      <p className="mt-1.5 text-sm text-slate-600 dark:text-slate-300 flex-1">
        Your mortgage is counted, but your home isn't. Add its estimated value to get an accurate
        net worth.
      </p>
      <button
        type="button"
        onClick={onAddProperty}
        className="mt-4 self-start h-11 px-4 rounded-full bg-[#0C1322] dark:bg-white text-white dark:text-[#0C1322] text-sm font-semibold hover:bg-[#1F2A3F] dark:hover:bg-slate-100 transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#1D4ED8]"
      >
        Add property value
      </button>
    </section>
  );
}
