import { useDisconnectPlaid, usePlaidItems, useSyncPlaid } from '../../hooks';
import type { PlaidConnectFlow } from '../../hooks/usePlaidConnectFlow';
import { BankIcon, CardIcon, LoanIcon } from './NetWorthHeader';
import { initials, timeAgo } from './format';

const quickButtonClass =
  'h-11 px-4 inline-flex items-center gap-2 rounded-full border border-[#E4E7EC] dark:border-slate-600 bg-white dark:bg-slate-800 text-sm font-semibold text-slate-800 dark:text-slate-100 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#1D4ED8]';

export default function ConnectCard({ plaid }: { plaid: PlaidConnectFlow }) {
  const { data: items = [] } = usePlaidItems();
  const syncMutation = useSyncPlaid();
  const disconnectMutation = useDisconnectPlaid();

  return (
    <section className="rounded-[20px] border border-[#E4E7EC] dark:border-slate-700 bg-white dark:bg-slate-800 p-5 sm:p-6">
      <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
        <div className="max-w-xl">
          <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
            Keep balances up to date automatically
          </h2>
          <p className="mt-1.5 text-sm text-slate-600 dark:text-slate-300">
            Connections are read-only through Plaid — we can see balances but never move money. Your
            bank login is never shared with this app.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {/* Plaid Link lets the user pick any institution, so each quick button opens it. */}
          <button
            type="button"
            className={quickButtonClass}
            onClick={plaid.start}
            disabled={plaid.isBusy}
          >
            <BankIcon /> Bank
          </button>
          <button
            type="button"
            className={quickButtonClass}
            onClick={plaid.start}
            disabled={plaid.isBusy}
          >
            <CardIcon /> Card
          </button>
          <button
            type="button"
            className={quickButtonClass}
            onClick={plaid.start}
            disabled={plaid.isBusy}
          >
            <LoanIcon /> Loan
          </button>
          <button
            type="button"
            onClick={plaid.start}
            disabled={plaid.isBusy}
            className="h-11 px-5 inline-flex items-center rounded-full bg-[#0C1322] dark:bg-white text-white dark:text-[#0C1322] text-sm font-semibold hover:bg-[#1F2A3F] dark:hover:bg-slate-100 transition-colors disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#1D4ED8]"
          >
            {plaid.statusLabel ?? 'Connect a bank'}
          </button>
        </div>
      </div>

      <div aria-live="polite">
        {plaid.error && (
          <p className="mt-4 text-sm text-red-700 dark:text-red-400">{plaid.error}</p>
        )}
        {plaid.accountsImported != null && (
          <p className="mt-4 text-sm text-emerald-700 dark:text-emerald-400">
            Connected — {plaid.accountsImported} accounts imported
          </p>
        )}
      </div>

      {items.length > 0 && (
        <div className="mt-5 border-t border-[#E4E7EC] dark:border-slate-700 pt-4">
          <div className="flex items-center justify-between gap-3">
            <h3 className="text-xs font-semibold uppercase tracking-[0.1em] text-slate-500 dark:text-slate-400">
              Connected institutions
            </h3>
            <button
              type="button"
              onClick={() => syncMutation.mutate()}
              disabled={syncMutation.isPending}
              className="h-11 px-3 -mr-3 text-sm font-semibold text-[#1D4ED8] dark:text-blue-300 hover:underline disabled:opacity-50"
            >
              {syncMutation.isPending
                ? 'Syncing…'
                : syncMutation.isSuccess
                  ? 'Synced ✓'
                  : 'Sync all'}
            </button>
          </div>
          <ul className="mt-1 divide-y divide-[#F2F4F7] dark:divide-slate-700/60">
            {items.map((item) => {
              const name = item.institution_name ?? 'Unknown institution';
              return (
                <li key={item.item_id} className="flex items-center justify-between gap-3 py-2">
                  <span className="flex items-center gap-3 min-w-0">
                    <span
                      className="h-9 w-9 shrink-0 rounded-lg bg-[#F4F5F7] dark:bg-slate-700 text-xs font-bold text-slate-700 dark:text-slate-200 flex items-center justify-center"
                      aria-hidden="true"
                    >
                      {initials(name)}
                    </span>
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-semibold text-slate-900 dark:text-slate-100">
                        {name}
                      </span>
                      <span className="block text-[13px] text-slate-500 dark:text-slate-400">
                        {item.account_count} account{item.account_count !== 1 ? 's' : ''}
                        {item.last_synced ? ` · synced ${timeAgo(item.last_synced)}` : ''}
                      </span>
                    </span>
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      if (
                        window.confirm(`Disconnect ${name}? All linked accounts will be removed.`)
                      )
                        disconnectMutation.mutate(item.item_id);
                    }}
                    disabled={disconnectMutation.isPending}
                    aria-label={`Disconnect ${name}`}
                    className="h-11 w-11 shrink-0 flex items-center justify-center rounded-full text-slate-500 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                  >
                    <svg
                      viewBox="0 0 20 20"
                      fill="currentColor"
                      className="h-4 w-4"
                      aria-hidden="true"
                    >
                      <path d="M5.28 4.22a.75.75 0 0 0-1.06 1.06L8.94 10l-4.72 4.72a.75.75 0 1 0 1.06 1.06L10 11.06l4.72 4.72a.75.75 0 1 0 1.06-1.06L11.06 10l4.72-4.72a.75.75 0 0 0-1.06-1.06L10 8.94 5.28 4.22Z" />
                    </svg>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </section>
  );
}
