import { useState } from 'react';
import { useAccountForecast } from '../../hooks';
import { useUIStore } from '../../store/uiStore';
import { parseLocalDateString } from '../../utils/date';
import { MASK } from '../networth/format';
import type { AccountForecast } from '../../types';
import { fmtUSD } from './constants';

const fmtDay = (iso: string) =>
  parseLocalDateString(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

/**
 * Walks each bank account's balance through the bills and paydays in the
 * window and flags any account that goes below $0 before a paycheck lands.
 */
export default function AccountsPanel({ days }: { days: number }) {
  const { data, isLoading, isError } = useAccountForecast(days);
  const hidden = useUIStore((s) => s.hideBalances);
  const money = (v: number) => (hidden ? MASK : fmtUSD(v));
  // Short accounts start open so the reason is visible right away.
  const [toggled, setToggled] = useState<Record<number, boolean>>({});
  const isOpen = (a: AccountForecast) => toggled[a.account_id] ?? a.short_date !== null;

  const header = (
    <div className="flex flex-wrap items-baseline justify-between gap-2 mb-3">
      <h2 className="text-sm font-semibold text-slate-900 dark:text-white">Accounts</h2>
      <span className="text-xs text-slate-500 dark:text-slate-400">
        Today&apos;s balance through bills and paydays in the next {days} days
      </span>
    </div>
  );

  if (isLoading || isError || !data) {
    return (
      <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-5">
        {header}
        <p className="text-sm text-slate-500 dark:text-slate-400">
          {isError ? 'Could not check your accounts. Please try again.' : 'Checking accounts…'}
        </p>
      </div>
    );
  }

  const nothing =
    data.accounts.length === 0 && data.cards.length === 0 && data.unlinked_count === 0;

  return (
    <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-5">
      {header}

      {nothing ? (
        <p className="text-sm text-slate-500 dark:text-slate-400">
          No bills due from your accounts in the next {days} days.
        </p>
      ) : (
        <ul className="space-y-2">
          {data.accounts.map((a) => {
            const short = a.short_date !== null;
            const open = isOpen(a);
            return (
              <li
                key={a.account_id}
                className={`rounded-lg border ${
                  short
                    ? 'border-red-200 bg-red-50 dark:border-red-800 dark:bg-red-900/20'
                    : 'border-slate-200 dark:border-slate-700'
                }`}
              >
                <button
                  type="button"
                  onClick={() => setToggled((t) => ({ ...t, [a.account_id]: !open }))}
                  aria-expanded={open}
                  className="w-full flex flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3 text-left"
                >
                  <span className="flex-1 min-w-[12rem] text-sm font-semibold text-slate-900 dark:text-white">
                    {a.label}
                  </span>
                  <Figure label="Balance" value={money(a.balance)} />
                  <Figure label="Bills" value={`-${money(a.bills_total)}`} />
                  <Figure
                    label="Paydays"
                    value={a.income_total ? `+${money(a.income_total)}` : '—'}
                  />
                  <Figure
                    label="Lowest"
                    value={`${money(a.lowest_balance)} · ${fmtDay(a.lowest_date)}`}
                    valueClass={short ? 'text-red-700 dark:text-red-300' : undefined}
                  />
                  <span
                    className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold ${
                      short
                        ? 'bg-red-600 text-white'
                        : 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300'
                    }`}
                  >
                    {short
                      ? `Short ${money(-a.lowest_balance)} on ${fmtDay(a.short_date!)}`
                      : 'Covered'}
                  </span>
                </button>

                {open && (
                  <div className="px-4 pb-3">
                    {short && (
                      <p className="mb-2 text-sm text-red-700 dark:text-red-300">
                        {a.short_bill} on {fmtDay(a.short_date!)} takes this account below $0. Move
                        money in before then.
                      </p>
                    )}
                    <table className="w-full text-sm">
                      <caption className="sr-only">{a.label} timeline</caption>
                      <thead>
                        <tr className="text-xs text-slate-500 dark:text-slate-400">
                          <th className="text-left font-medium py-1 w-20">Date</th>
                          <th className="text-left font-medium py-1">Bill or payday</th>
                          <th className="text-right font-medium py-1">Amount</th>
                          <th className="text-right font-medium py-1">Balance after</th>
                        </tr>
                      </thead>
                      <tbody>
                        {a.events.map((e, idx) => (
                          <tr
                            key={idx}
                            className={`border-t border-slate-100 dark:border-slate-700 ${
                              e.balance_after < 0 ? 'text-red-700 dark:text-red-300' : ''
                            }`}
                          >
                            <td className="py-1.5 tabular-nums">{fmtDay(e.date)}</td>
                            <td className="py-1.5">
                              {e.name}
                              {e.overdue && (
                                <span className="ml-2 text-xs font-semibold text-red-600 dark:text-red-400">
                                  overdue
                                </span>
                              )}
                            </td>
                            <td
                              className={`py-1.5 text-right tabular-nums ${
                                e.kind === 'income' ? 'text-emerald-700 dark:text-emerald-400' : ''
                              }`}
                            >
                              {e.amount > 0 ? `+${money(e.amount)}` : `-${money(-e.amount)}`}
                            </td>
                            <td className="py-1.5 text-right font-semibold tabular-nums">
                              {money(e.balance_after)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {(data.cards.length > 0 || data.unlinked_count > 0 || data.undated_count > 0) && (
        <ul className="mt-3 space-y-1 text-sm text-slate-600 dark:text-slate-400">
          {data.cards.map((c) => (
            <li key={c.account_id}>
              {money(c.total)} charged to {c.label} ({plural(c.count, 'bill')}). No cash needed
              until the card is paid.
            </li>
          ))}
          {data.unlinked_count > 0 && (
            <li className="text-amber-700 dark:text-amber-400">
              Not checked: {money(data.unlinked_total)} ({plural(data.unlinked_count, 'bill')}) with
              no &ldquo;Paid from&rdquo; account.
            </li>
          )}
          {data.undated_count > 0 && (
            <li>{plural(data.undated_count, 'bill')} with no due date not included.</li>
          )}
        </ul>
      )}
    </div>
  );
}

function Figure({
  label,
  value,
  valueClass,
}: {
  label: string;
  value: string;
  valueClass?: string;
}) {
  return (
    <span className="flex flex-col text-right">
      <span className="text-[11px] uppercase tracking-wide text-slate-500 dark:text-slate-400">
        {label}
      </span>
      <span
        className={`text-sm font-semibold tabular-nums ${valueClass ?? 'text-slate-900 dark:text-white'}`}
      >
        {value}
      </span>
    </span>
  );
}
