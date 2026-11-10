import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useSyncPlaid } from '../../hooks';
import { useConfirmBalance, useUpdateAccount } from '../../hooks/useNetWorth';
import type { FinancialAccount } from '../../types';
import { accountStaleDays } from './accountConfig';
import { fmtMoney } from './format';

interface UpdateBalancesPanelProps {
  accounts: FinancialAccount[];
  hidden: boolean;
  onClose: () => void;
}

interface StaleRow {
  account: FinancialAccount;
  days: number;
}

/** Parses "$1,240.18" or "1240.18"; null when it isn't a number. */
function parseAmount(text: string): number | null {
  const cleaned = text.replace(/[$,\s]/g, '');
  if (cleaned === '') return null;
  const value = Number(cleaned);
  return Number.isFinite(value) ? value : null;
}

const sameCents = (a: number, b: number) => Math.round(a * 100) === Math.round(b * 100);

const BUTTON =
  'h-9 rounded-full px-3.5 text-sm font-semibold transition-colors disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-700';
const PRIMARY = `${BUTTON} bg-ink-900 text-white hover:bg-ink-800 dark:bg-white dark:text-slate-900 dark:hover:bg-slate-100`;
const SECONDARY = `${BUTTON} border border-ink-250 text-slate-700 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-700/60`;

/**
 * Walks through the out-of-date balances. Linked bank accounts are synced
 * automatically when the panel opens; manual ones are listed biggest first,
 * each confirmed ("Still right") or edited and saved on its own, so closing
 * halfway loses nothing.
 */
export default function UpdateBalancesPanel({
  accounts,
  hidden,
  onClose,
}: UpdateBalancesPanelProps) {
  // Fixed when the panel opens, so rows don't reshuffle as balances refresh.
  const [rows] = useState<StaleRow[]>(() =>
    accounts
      .filter((a) => !a.is_linked)
      .map((account) => ({ account, days: accountStaleDays(account) }))
      .filter((r): r is StaleRow => r.days !== null)
      .sort((a, b) => Math.abs(b.account.balance) - Math.abs(a.account.balance)),
  );
  const [syncLinked] = useState(() =>
    accounts.some((a) => a.is_linked && accountStaleDays(a) !== null),
  );

  const [done, setDone] = useState<Set<number>>(new Set());
  const [editing, setEditing] = useState<number | null>(null);
  const [draft, setDraft] = useState('');
  const [pending, setPending] = useState<number | null>(null);
  const [error, setError] = useState<{ id: number; message: string } | null>(null);

  const sync = useSyncPlaid();
  const confirmBalance = useConfirmBalance();
  const updateAccount = useUpdateAccount();
  const { mutate: runSync } = sync;
  const syncStarted = useRef(false);
  const firstAction = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (syncLinked && !syncStarted.current) {
      syncStarted.current = true;
      runSync();
    }
  }, [syncLinked, runSync]);

  const left = rows.filter((r) => !done.has(r.account.id));

  // Keep the keyboard on the next row as rows are finished.
  useEffect(() => {
    firstAction.current?.focus();
  }, [left.length]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (editing !== null) setEditing(null);
      else onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [editing, onClose]);

  async function run(id: number, action: () => Promise<unknown>) {
    setPending(id);
    setError(null);
    try {
      await action();
      setDone((prev) => new Set(prev).add(id));
      setEditing(null);
    } catch (err) {
      setError({ id, message: err instanceof Error ? err.message : 'Couldn’t save. Try again.' });
    } finally {
      setPending(null);
    }
  }

  function startEdit(account: FinancialAccount) {
    setEditing(account.id);
    setDraft(account.balance.toFixed(2));
    setError(null);
  }

  function save(e: FormEvent, account: FinancialAccount) {
    e.preventDefault();
    const value = parseAmount(draft);
    if (value === null) {
      setError({ id: account.id, message: 'Enter a number, like 1240.18' });
      return;
    }
    // An unchanged balance is a confirmation; saving it wouldn't mark it fresh.
    void run(account.id, () =>
      sameCents(value, account.balance)
        ? confirmBalance.mutateAsync(account.id)
        : updateAccount.mutateAsync({ id: account.id, data: { balance: value } }),
    );
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center"
      role="dialog"
      aria-modal="true"
      aria-labelledby="update-balances-title"
    >
      <div className="absolute inset-0 bg-hero-bg/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative z-10 w-full sm:max-w-lg sm:mx-4 max-h-[92vh] flex flex-col bg-white dark:bg-slate-800 rounded-t-[24px] sm:rounded-[24px] shadow-2xl overflow-hidden">
        <div className="px-6 pt-6 pb-3 flex items-start justify-between gap-4">
          <div className="min-w-0">
            <h2
              id="update-balances-title"
              className="text-lg font-bold text-slate-900 dark:text-white"
            >
              Update balances
            </h2>
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5" aria-live="polite">
              {left.length > 0
                ? `${left.length} left · biggest first`
                : rows.length > 0
                  ? 'All done'
                  : 'Nothing to check'}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="-mr-2 -mt-1 h-11 w-11 shrink-0 flex items-center justify-center rounded-full text-slate-500 hover:text-slate-900 hover:bg-slate-100 dark:hover:bg-slate-700 dark:hover:text-white transition-colors"
          >
            <svg viewBox="0 0 16 16" fill="currentColor" className="w-4 h-4" aria-hidden="true">
              <path d="M5.28 4.22a.75.75 0 0 0-1.06 1.06L6.94 8l-2.72 2.72a.75.75 0 1 0 1.06 1.06L8 9.06l2.72 2.72a.75.75 0 1 0 1.06-1.06L9.06 8l2.72-2.72a.75.75 0 0 0-1.06-1.06L8 6.94 5.28 4.22Z" />
            </svg>
          </button>
        </div>

        <div className="overflow-y-auto px-6 pb-2">
          {left.length === 0 ? (
            <div className="py-8 text-center">
              <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-emerald-50 text-emerald-600 dark:bg-emerald-500/15 dark:text-emerald-400">
                <svg viewBox="0 0 20 20" fill="currentColor" className="h-6 w-6" aria-hidden="true">
                  <path
                    fillRule="evenodd"
                    d="M16.704 4.153a.75.75 0 0 1 .143 1.052l-8 10.5a.75.75 0 0 1-1.127.075l-4.5-4.5a.75.75 0 0 1 1.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 0 1 1.05-.143Z"
                    clipRule="evenodd"
                  />
                </svg>
              </div>
              <p className="font-semibold text-slate-900 dark:text-white">
                {syncLinked && sync.isPending
                  ? 'Syncing your bank accounts…'
                  : 'Your balances are up to date'}
              </p>
            </div>
          ) : (
            <ul className="divide-y divide-ink-100 dark:divide-slate-700">
              {left.map(({ account, days }, i) => (
                <li key={account.id} className="py-3.5">
                  <div className="flex items-baseline justify-between gap-3">
                    <p className="min-w-0 truncate font-semibold text-slate-900 dark:text-white">
                      {account.name}
                    </p>
                    <p className="shrink-0 tabular-nums font-semibold text-slate-900 dark:text-white">
                      {fmtMoney(account.balance, hidden)}
                    </p>
                  </div>
                  {editing === account.id ? (
                    <form
                      onSubmit={(e) => save(e, account)}
                      className="mt-2 flex items-center gap-2"
                    >
                      <label htmlFor={`balance-${account.id}`} className="sr-only">
                        New balance for {account.name}
                      </label>
                      <div className="relative min-w-0 flex-1">
                        <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-slate-500">
                          $
                        </span>
                        <input
                          id={`balance-${account.id}`}
                          inputMode="decimal"
                          autoFocus
                          value={draft}
                          onChange={(e) => setDraft(e.target.value)}
                          onFocus={(e) => e.target.select()}
                          className="h-9 w-full rounded-xl border border-ink-300 bg-white pl-6 pr-3 text-sm tabular-nums text-slate-900 focus:border-accent-700 focus:outline-none focus:ring-2 focus:ring-accent-700/40 dark:border-slate-600 dark:bg-slate-700 dark:text-white"
                        />
                      </div>
                      <button type="submit" disabled={pending === account.id} className={PRIMARY}>
                        Save
                      </button>
                      <button type="button" onClick={() => setEditing(null)} className={SECONDARY}>
                        Cancel
                      </button>
                    </form>
                  ) : (
                    <div className="mt-1.5 flex items-center justify-between gap-3">
                      <p className="min-w-0 truncate text-[13px] text-slate-500 dark:text-slate-400">
                        {account.institution ? `${account.institution} · ` : ''}
                        <span className="text-amber-700 dark:text-amber-400">
                          updated {days} days ago
                        </span>
                      </p>
                      <div className="flex shrink-0 gap-2">
                        <button
                          ref={i === 0 ? firstAction : undefined}
                          type="button"
                          disabled={pending === account.id}
                          onClick={() =>
                            void run(account.id, () => confirmBalance.mutateAsync(account.id))
                          }
                          className={PRIMARY}
                        >
                          Still right
                        </button>
                        <button
                          type="button"
                          disabled={pending === account.id}
                          onClick={() => startEdit(account)}
                          className={SECONDARY}
                        >
                          Edit
                        </button>
                      </div>
                    </div>
                  )}
                  {error?.id === account.id && (
                    <p role="alert" className="mt-1.5 text-[13px] text-red-600 dark:text-red-400">
                      {error.message}
                    </p>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="flex items-center justify-between gap-3 border-t border-ink-100 px-6 py-4 dark:border-slate-700">
          <p className="min-w-0 text-[13px] text-slate-500 dark:text-slate-400" aria-live="polite">
            {syncLinked &&
              (sync.isPending
                ? 'Syncing bank accounts…'
                : sync.isError
                  ? 'Couldn’t sync bank accounts'
                  : sync.isSuccess
                    ? 'Bank accounts synced ✓'
                    : '')}
          </p>
          <button
            ref={left.length === 0 ? firstAction : undefined}
            type="button"
            onClick={onClose}
            className={left.length === 0 ? PRIMARY : SECONDARY}
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
