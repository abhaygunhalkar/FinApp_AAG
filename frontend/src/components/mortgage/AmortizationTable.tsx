import { Fragment, useMemo, useState } from 'react';
import { fmtMoney } from '../networth/format';
import { fmtYearMonth, groupByYear, type ScheduleRow } from './simulatePayoff';

interface AmortizationTableProps {
  schedule: ScheduleRow[];
  hidden: boolean;
  /** What the schedule describes, e.g. "with your changes". */
  label: string;
}

const CELL = 'px-3 py-2 text-right tabular-nums whitespace-nowrap';

/** The payment schedule by year; each year opens to its months. Collapsed by default. */
export default function AmortizationTable({ schedule, hidden, label }: AmortizationTableProps) {
  const [open, setOpen] = useState(false);
  const [openYears, setOpenYears] = useState<Set<string>>(new Set());
  const years = useMemo(() => groupByYear(schedule), [schedule]);
  const money = (v: number) => fmtMoney(v, hidden);

  function toggleYear(year: string) {
    setOpenYears((prev) => {
      const next = new Set(prev);
      if (next.has(year)) next.delete(year);
      else next.add(year);
      return next;
    });
  }

  return (
    <section className="rounded-[20px] border border-ink-200 dark:border-slate-700 bg-white dark:bg-slate-800 overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="w-full flex items-center justify-between gap-3 px-4 sm:px-5 py-4 text-left hover:bg-slate-50 dark:hover:bg-slate-700/40 transition-colors focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent-700"
      >
        <span>
          <span className="block text-base font-semibold text-slate-900 dark:text-slate-100">
            Amortization schedule
          </span>
          <span className="block text-[13px] text-slate-500 dark:text-slate-400">
            {years.length} years {label} · by year, tap a year for months
          </span>
        </span>
        <svg
          viewBox="0 0 20 20"
          fill="currentColor"
          className={`h-5 w-5 shrink-0 text-slate-400 transition-transform ${open ? 'rotate-180' : ''}`}
          aria-hidden="true"
        >
          <path
            fillRule="evenodd"
            d="M5.22 8.22a.75.75 0 0 1 1.06 0L10 11.94l3.72-3.72a.75.75 0 1 1 1.06 1.06l-4.25 4.25a.75.75 0 0 1-1.06 0L5.22 9.28a.75.75 0 0 1 0-1.06Z"
            clipRule="evenodd"
          />
        </svg>
      </button>

      {open && (
        <div className="max-h-[520px] overflow-auto border-t border-ink-200 dark:border-slate-700">
          <table className="w-full text-[13px] text-slate-700 dark:text-slate-300">
            <thead className="sticky top-0 z-10 bg-ink-50 text-xs font-semibold text-slate-500 dark:bg-slate-900 dark:text-slate-400">
              <tr>
                <th scope="col" className="px-3 py-2 text-left">
                  Year
                </th>
                <th scope="col" className={CELL}>
                  Payment
                </th>
                <th scope="col" className={CELL}>
                  Principal
                </th>
                <th scope="col" className={CELL}>
                  Interest
                </th>
                <th scope="col" className={CELL}>
                  Extra
                </th>
                <th scope="col" className={CELL}>
                  Balance
                </th>
              </tr>
            </thead>
            <tbody>
              {years.map((y) => {
                const expanded = openYears.has(y.year);
                return (
                  <Fragment key={y.year}>
                    <tr className="border-t border-ink-100 dark:border-slate-700/70">
                      <th scope="row" className="px-3 py-2 text-left font-semibold">
                        <button
                          type="button"
                          onClick={() => toggleYear(y.year)}
                          aria-expanded={expanded}
                          aria-label={`${y.year}, ${expanded ? 'hide' : 'show'} months`}
                          className="flex items-center gap-1.5 rounded text-slate-900 hover:text-accent-700 dark:text-slate-100 dark:hover:text-blue-300 focus-visible:outline-2 focus-visible:outline-accent-700"
                        >
                          <span
                            className={`text-[10px] text-slate-400 transition-transform ${expanded ? 'rotate-90' : ''}`}
                            aria-hidden="true"
                          >
                            ▶
                          </span>
                          {y.year}
                        </button>
                      </th>
                      <td className={CELL}>{money(y.payment)}</td>
                      <td className={CELL}>{money(y.principal)}</td>
                      <td className={CELL}>{money(y.interest)}</td>
                      <td className={CELL}>{y.extra > 0 ? money(y.extra) : '—'}</td>
                      <td className={`${CELL} font-semibold text-slate-900 dark:text-slate-100`}>
                        {money(y.balance)}
                      </td>
                    </tr>
                    {expanded &&
                      y.rows.map((r) => (
                        <tr key={r.month} className="bg-ink-50/60 dark:bg-slate-900/40">
                          <td className="px-3 py-1.5 pl-8 text-left text-slate-500 dark:text-slate-400 whitespace-nowrap">
                            {fmtYearMonth(r.month)}
                          </td>
                          <td className={CELL}>{money(r.payment)}</td>
                          <td className={CELL}>{money(r.principal)}</td>
                          <td className={CELL}>{money(r.interest)}</td>
                          <td className={CELL}>{r.extra > 0 ? money(r.extra) : '—'}</td>
                          <td className={CELL}>{money(r.balance)}</td>
                        </tr>
                      ))}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
