// Sandbox test credentials: username "user_good" / password "pass_good"
import { useCallback, useEffect, useState } from 'react';
import { usePlaidLink } from 'react-plaid-link';
import { createLinkToken } from '../../api/plaid';
import { useConnectPlaid, useDisconnectPlaid, usePlaidItems, useSyncPlaid } from '../../hooks';

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return new Date(iso).toLocaleDateString();
}

export default function PlaidConnect() {
  const [linkToken, setLinkToken] = useState<string | null>(null);
  const [tokenLoading, setTokenLoading] = useState(false);
  const [tokenError, setTokenError] = useState<string | null>(null);

  const { data: items = [] } = usePlaidItems();
  const connectMutation = useConnectPlaid();
  const syncMutation = useSyncPlaid();
  const disconnectMutation = useDisconnectPlaid();

  const onPlaidSuccess = useCallback(
    (publicToken: string | null) => {
      if (publicToken) connectMutation.mutate(publicToken);
      setLinkToken(null);
    },
    [connectMutation],
  );

  const { open, ready } = usePlaidLink({
    token: linkToken ?? '',
    onSuccess: onPlaidSuccess,
  });

  useEffect(() => {
    if (linkToken && ready) {
      open();
      setTokenLoading(false);
    }
  }, [linkToken, ready, open]);

  async function handleConnectClick() {
    setTokenLoading(true);
    setTokenError(null);
    try {
      const token = await createLinkToken();
      setLinkToken(token);
    } catch {
      setTokenError('Could not load Plaid — check your credentials.');
      setTokenLoading(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button
            onClick={handleConnectClick}
            disabled={tokenLoading || !!tokenError || connectMutation.isPending}
            className="inline-flex items-center gap-2 px-4 py-2.5 bg-slate-900 dark:bg-white text-white dark:text-slate-900 text-sm font-semibold rounded-lg shadow-sm hover:bg-slate-700 dark:hover:bg-slate-100 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 20 20"
              fill="currentColor"
              className="w-4 h-4"
            >
              <path d="M4 4a2 2 0 00-2 2v1h16V6a2 2 0 00-2-2H4z" />
              <path
                fillRule="evenodd"
                d="M18 9H2v5a2 2 0 002 2h12a2 2 0 002-2V9zM4 13a1 1 0 011-1h1a1 1 0 110 2H5a1 1 0 01-1-1zm5-1a1 1 0 100 2h1a1 1 0 100-2H9z"
                clipRule="evenodd"
              />
            </svg>
            {tokenLoading ? 'Loading…' : connectMutation.isPending ? 'Connecting…' : 'Connect a bank'}
          </button>

          {items.length > 0 && (
            <button
              onClick={() => syncMutation.mutate()}
              disabled={syncMutation.isPending}
              className="inline-flex items-center gap-2 px-4 py-2.5 text-sm font-medium text-slate-600 dark:text-slate-300 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                className={`h-4 w-4 ${syncMutation.isPending ? 'animate-spin' : ''}`}
                viewBox="0 0 20 20"
                fill="currentColor"
              >
                <path
                  fillRule="evenodd"
                  d="M4 2a1 1 0 011 1v2.101a7.002 7.002 0 0111.601 2.566 1 1 0 11-1.885.666A5.002 5.002 0 005.999 7H9a1 1 0 010 2H4a1 1 0 01-1-1V3a1 1 0 011-1zm.008 9.057a1 1 0 011.276.61A5.002 5.002 0 0014.001 13H11a1 1 0 110-2h5a1 1 0 011 1v5a1 1 0 11-2 0v-2.101a7.002 7.002 0 01-11.601-2.566 1 1 0 01.61-1.276z"
                  clipRule="evenodd"
                />
              </svg>
              {syncMutation.isPending ? 'Syncing…' : 'Sync all'}
            </button>
          )}
        </div>

        {syncMutation.isSuccess && (
          <span className="text-xs text-emerald-600 dark:text-emerald-400">Balances updated</span>
        )}
        {connectMutation.isSuccess && (
          <span className="text-xs text-emerald-600 dark:text-emerald-400">
            Connected — {connectMutation.data?.accounts_synced} accounts imported
          </span>
        )}
      </div>

      {tokenError && <p className="text-xs text-red-500 dark:text-red-400">{tokenError}</p>}
      {connectMutation.isError && (
        <p className="text-xs text-red-500 dark:text-red-400">
          Failed to connect account — {(connectMutation.error as Error)?.message ?? 'unknown error'}
        </p>
      )}

      {items.length > 0 && (
        <div className="divide-y divide-slate-100 dark:divide-slate-700 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 overflow-hidden shadow-sm">
          {items.map((item) => (
            <div key={item.item_id} className="flex items-center justify-between px-4 py-3">
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-8 h-8 rounded-full bg-blue-100 dark:bg-blue-900/40 flex items-center justify-center shrink-0">
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    viewBox="0 0 20 20"
                    fill="currentColor"
                    className="w-4 h-4 text-blue-600 dark:text-blue-400"
                  >
                    <path d="M4 4a2 2 0 00-2 2v1h16V6a2 2 0 00-2-2H4z" />
                    <path
                      fillRule="evenodd"
                      d="M18 9H2v5a2 2 0 002 2h12a2 2 0 002-2V9zM4 13a1 1 0 011-1h1a1 1 0 110 2H5a1 1 0 01-1-1zm5-1a1 1 0 100 2h1a1 1 0 100-2H9z"
                      clipRule="evenodd"
                    />
                  </svg>
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-medium text-slate-800 dark:text-slate-100 truncate">
                    {item.institution_name ?? 'Unknown Institution'}
                  </p>
                  <p className="text-xs text-slate-400">
                    {item.account_count} account{item.account_count !== 1 ? 's' : ''}
                    {item.last_synced ? ` · Synced ${timeAgo(item.last_synced)}` : ''}
                  </p>
                </div>
              </div>
              <button
                onClick={() => {
                  if (
                    window.confirm(
                      `Disconnect ${item.institution_name ?? 'this institution'}? All linked accounts will be removed.`,
                    )
                  )
                    disconnectMutation.mutate(item.item_id);
                }}
                disabled={disconnectMutation.isPending}
                className="ml-4 p-1.5 rounded text-slate-400 hover:text-red-500 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors shrink-0"
                aria-label="Disconnect"
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 20 20"
                  fill="currentColor"
                  className="w-4 h-4"
                >
                  <path
                    fillRule="evenodd"
                    d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z"
                    clipRule="evenodd"
                  />
                </svg>
              </button>
            </div>
          ))}
        </div>
      )}

      {items.length === 0 && !tokenError && (
        <p className="text-xs text-slate-400">
          Connect your bank accounts, credit cards, and loans to auto-populate balances.
        </p>
      )}
    </div>
  );
}
