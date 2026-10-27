import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAccountForecast } from '../../hooks';
import { useUIStore } from '../../store/uiStore';
import { parseLocalDateString } from '../../utils/date';
import { MASK } from '../networth/format';
import type { AccountForecast } from '../../types';
import { fmtUSD } from './constants';

/** An account whose lowest balance stays under this is "tight" (amber). */
const BALANCE_BUFFER = 500;

type Tier = 'short' | 'tight' | 'covered';

const TIER: Record<
  Tier,
  { solid: string; hatch: string; card: string; pill: string; text: string }
> = {
  short: {
    solid: '#DC2626',
    hatch: 'rgba(220, 38, 38, 0.45)',
    card: 'border-red-200 bg-red-50/60 dark:border-red-800 dark:bg-red-900/20',
    pill: 'bg-red-600 text-white',
    text: 'text-red-700 dark:text-red-300',
  },
  tight: {
    solid: '#D97706',
    hatch: 'rgba(217, 119, 6, 0.4)',
    card: 'border-amber-200 bg-amber-50/60 dark:border-amber-800 dark:bg-amber-900/20',
    pill: 'bg-amber-100 text-amber-900 dark:bg-amber-900/50 dark:text-amber-200',
    text: 'text-amber-800 dark:text-amber-300',
  },
  covered: {
    solid: '#059669',
    hatch: 'rgba(5, 150, 105, 0.35)',
    card: 'border-slate-200 dark:border-slate-700',
    pill: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300',
    text: 'text-slate-700 dark:text-slate-300',
  },
};

const tierOf = (a: AccountForecast): Tier =>
  a.lowest_balance < 0 ? 'short' : a.lowest_balance < BALANCE_BUFFER ? 'tight' : 'covered';

/** Muted tints for the initials badge, picked by account name so it stays stable. */
const BADGE_TINTS = [
  'bg-blue-100 text-blue-800 dark:bg-blue-900/50 dark:text-blue-200',
  'bg-violet-100 text-violet-800 dark:bg-violet-900/50 dark:text-violet-200',
  'bg-teal-100 text-teal-800 dark:bg-teal-900/50 dark:text-teal-200',
  'bg-rose-100 text-rose-800 dark:bg-rose-900/50 dark:text-rose-200',
  'bg-sky-100 text-sky-800 dark:bg-sky-900/50 dark:text-sky-200',
];

function initials(name: string): string {
  const words = name.split(/\s+/).filter((w) => /[A-Za-z0-9]/.test(w));
  return (words.length > 1 ? words[0][0] + words[1][0] : name.slice(0, 2)).toUpperCase();
}

function badgeTint(name: string): string {
  const hash = [...name].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 0);
  return BADGE_TINTS[hash % BADGE_TINTS.length];
}

const fmtDay = (iso: string) =>
  parseLocalDateString(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

function WalletIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-4 w-4"
      aria-hidden="true"
    >
      <path d="M19 7V5a2 2 0 0 0-2-2H5a2 2 0 0 0 0 4h14a2 2 0 0 1 2 2v3" />
      <path d="M3 5v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-3" />
      <path d="M21 12h-4a2 2 0 0 0 0 4h4v-4Z" />
    </svg>
  );
}

/**
 * Today's balance as the full bar: the solid part is what's left at the
 * lowest point, the hatched part is how far bills pull it down before then.
 */
function CoverageBar({ a, tier, label }: { a: AccountForecast; tier: Tier; label: string }) {
  const { solid, hatch } = TIER[tier];
  const solidPct =
    a.balance > 0 ? (Math.min(Math.max(a.lowest_balance, 0), a.balance) / a.balance) * 100 : 0;
  return (
    <div
      role="img"
      aria-label={label}
      className="flex h-2.5 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-700"
    >
      <div style={{ width: `${solidPct}%`, background: solid }} />
      <div
        style={{
          width: `${100 - solidPct}%`,
          backgroundImage: `repeating-linear-gradient(135deg, ${hatch} 0 4px, transparent 4px 7px)`,
        }}
      />
    </div>
  );
}

/**
 * Walks each bank account's balance through the bills and paydays in the
 * window and flags any account that runs low or goes below $0.
 */
export default function AccountsPanel({ days }: { days: number }) {
  const { data, isLoading, isError } = useAccountForecast(days);
  const hidden = useUIStore((s) => s.hideBalances);
  const money = (v: number) => (hidden ? MASK : fmtUSD(v));
  // Short accounts start open so the reason is visible right away.
  const [toggled, setToggled] = useState<Record<number, boolean>>({});
  const isOpen = (a: AccountForecast) => toggled[a.account_id] ?? a.short_date !== null;

  const header = (
    <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-1 mb-4">
      <div className="flex items-start gap-2.5">
        <span className="mt-0.5 h-7 w-7 shrink-0 rounded-lg bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-200 flex items-center justify-center">
          <WalletIcon />
        </span>
        <div>
          <h2 className="text-sm font-semibold text-slate-900 dark:text-white">Accounts</h2>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Will your accounts cover upcoming bills?
          </p>
        </div>
      </div>
      <span className="text-xs text-slate-500 dark:text-slate-400 sm:pt-1">
        Bills and paydays in the next {days} days
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
        // Wide screens: account cards on the left, card chips in a column on the right.
        <div className="lg:flex lg:items-start lg:gap-6">
          <ul
            className="grid gap-4 items-start lg:flex-1 lg:min-w-0"
            // Cards stay card-sized (max 420px) even when there's only one,
            // and shrink to fit on phones.
            style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 360px), 420px))' }}
          >
            {data.accounts.map((a) => {
              const tier = tierOf(a);
              const style = TIER[tier];
              const open = isOpen(a);
              const showInstitution =
                a.institution && a.institution.toLowerCase() !== a.name.toLowerCase();
              const lowest = `lowest ${money(a.lowest_balance)} · ${fmtDay(a.lowest_date)}`;
              return (
                <li key={a.account_id} className={`rounded-xl border ${style.card}`}>
                  <button
                    type="button"
                    onClick={() => setToggled((t) => ({ ...t, [a.account_id]: !open }))}
                    aria-expanded={open}
                    aria-label={`${a.label}: ${
                      tier === 'short'
                        ? `short on ${fmtDay(a.short_date!)}`
                        : tier === 'tight'
                          ? 'tight'
                          : 'covered'
                    }`}
                    className="w-full px-4 pt-3 text-left"
                  >
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                      <span
                        className={`h-9 w-9 shrink-0 rounded-lg flex items-center justify-center text-xs font-bold ${badgeTint(a.name)}`}
                        aria-hidden="true"
                      >
                        {initials(a.name)}
                      </span>
                      <div className="flex-1 min-w-[9rem]">
                        <p className="text-sm font-semibold text-slate-900 dark:text-white truncate">
                          {a.name}
                        </p>
                        {showInstitution && (
                          <p className="text-xs text-slate-500 dark:text-slate-400 truncate">
                            {a.institution}
                          </p>
                        )}
                      </div>
                      <span
                        className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold ${style.pill}`}
                      >
                        {tier === 'short'
                          ? `Short ${money(-a.lowest_balance)} on ${fmtDay(a.short_date!)}`
                          : tier === 'tight'
                            ? `Tight · under ${money(BALANCE_BUFFER)}`
                            : 'Covered'}
                      </span>
                    </div>

                    <div className="mt-3 flex items-baseline justify-between gap-3 text-xs">
                      <span className="font-semibold tabular-nums text-slate-900 dark:text-white">
                        {money(a.balance)} today
                      </span>
                      <span className={`font-semibold tabular-nums ${style.text}`}>{lowest}</span>
                    </div>
                    <div className="mt-1.5">
                      <CoverageBar
                        a={a}
                        tier={tier}
                        label={`${money(a.balance)} today, ${lowest}`}
                      />
                    </div>
                  </button>

                  <p className="px-4 pt-1.5 pb-3 text-xs text-slate-500 dark:text-slate-400 tabular-nums">
                    bills -{money(a.bills_total)} · paydays{' '}
                    {a.income_total ? `+${money(a.income_total)}` : '—'}
                    {!a.has_paydays && (
                      <>
                        {' · '}
                        <Link
                          to="/cash-flow"
                          className="font-medium text-blue-700 dark:text-blue-400 hover:underline"
                        >
                          Add payday
                        </Link>
                      </>
                    )}
                  </p>

                  {open && (
                    <div className="px-4 pb-3">
                      {tier === 'short' && (
                        <p className="mb-2 text-sm text-red-700 dark:text-red-300">
                          {a.short_bill} on {fmtDay(a.short_date!)} takes this account below $0.
                          Move money in before then.
                        </p>
                      )}
                      <table className="w-full text-sm">
                        <caption className="sr-only">{a.label} timeline</caption>
                        <thead>
                          <tr className="text-xs text-slate-500 dark:text-slate-400">
                            <th className="text-left font-medium py-1 w-20">Date</th>
                            <th className="text-left font-medium py-1">Bill or payday</th>
                            <th className="text-right font-medium py-1 pl-3">Amount</th>
                            <th className="text-right font-medium py-1 pl-3">Balance after</th>
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
                              <td className="py-1.5 tabular-nums whitespace-nowrap">
                                {fmtDay(e.date)}
                              </td>
                              <td className="py-1.5">
                                {e.name}
                                {e.overdue && (
                                  <span className="ml-2 text-xs font-semibold text-red-600 dark:text-red-400">
                                    overdue
                                  </span>
                                )}
                              </td>
                              <td
                                className={`py-1.5 pl-3 text-right tabular-nums whitespace-nowrap ${
                                  e.kind === 'income'
                                    ? 'text-emerald-700 dark:text-emerald-400'
                                    : ''
                                }`}
                              >
                                {e.amount > 0 ? `+${money(e.amount)}` : `-${money(-e.amount)}`}
                              </td>
                              <td className="py-1.5 pl-3 text-right font-semibold tabular-nums whitespace-nowrap">
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

          {data.cards.length > 0 && (
            <ul
              className="mt-4 lg:mt-0 lg:max-w-sm lg:shrink-0 flex flex-wrap content-start gap-2"
              aria-label="Bills charged to cards"
            >
              {data.cards.map((c) => (
                <li
                  key={c.account_id}
                  title="No cash needed until the card is paid."
                  className="inline-flex items-center gap-1.5 rounded-2xl border border-slate-200 dark:border-slate-600 bg-slate-50 dark:bg-slate-700/50 px-3 py-1 text-xs text-slate-700 dark:text-slate-300"
                >
                  <svg
                    viewBox="0 0 16 16"
                    fill="currentColor"
                    className="h-3 w-3"
                    aria-hidden="true"
                  >
                    <path d="M2.5 3A1.5 1.5 0 0 0 1 4.5V5h14v-.5A1.5 1.5 0 0 0 13.5 3h-11ZM15 6.5H1v5A1.5 1.5 0 0 0 2.5 13h11a1.5 1.5 0 0 0 1.5-1.5v-5ZM3 10.25a.75.75 0 0 1 .75-.75h2a.75.75 0 0 1 0 1.5h-2a.75.75 0 0 1-.75-.75Z" />
                  </svg>
                  {c.label} · {money(c.total)} · {plural(c.count, 'bill')}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {(data.unlinked_count > 0 || data.undated_count > 0) && (
        <ul className="mt-3 space-y-1 text-sm text-slate-600 dark:text-slate-400">
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
