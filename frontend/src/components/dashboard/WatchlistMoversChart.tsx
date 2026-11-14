import { useMemo } from 'react';
import { useWatchlist } from '../../hooks/useWatchlist';
import { EmptyState } from '../shared';
import type { WatchlistItem } from '../../types';

interface MoverItem {
  ticker: string;
  company_name: string | null;
  daily_change_pct: number;
  current_price: number;
}

function getChangeColor(value: number): string {
  if (value >= 2) return 'text-green-600 dark:text-green-400';
  if (value <= -2) return 'text-red-600 dark:text-red-400';
  return 'text-gray-500 dark:text-gray-400';
}

function getChangeBg(value: number): string {
  if (value >= 2) return 'bg-green-50 dark:bg-green-900/20';
  if (value <= -2) return 'bg-red-50 dark:bg-red-900/20';
  return 'bg-gray-50 dark:bg-gray-800';
}

export default function WatchlistMoversChart() {
  const { data: watchlist, isLoading } = useWatchlist();

  const movers: MoverItem[] = useMemo(() => {
    if (!watchlist || watchlist.length === 0) return [];

    return watchlist
      .filter((item: WatchlistItem) => Math.abs(item.daily_change_pct) >= 2)
      .map((item: WatchlistItem) => ({
        ticker: item.ticker,
        company_name: item.company_name,
        daily_change_pct: Math.round(item.daily_change_pct * 100) / 100,
        current_price: item.current_price,
      }))
      .sort((a, b) => Math.abs(b.daily_change_pct) - Math.abs(a.daily_change_pct));
  }, [watchlist]);

  if (isLoading) {
    return (
      <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-4 shadow-sm">
        <div className="h-64 flex items-center justify-center">
          <p className="text-sm text-gray-500 dark:text-gray-400">Loading...</p>
        </div>
      </div>
    );
  }

  if (movers.length === 0) {
    return (
      <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-4 shadow-sm">
        <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-4">
          Watchlist Movers
        </h3>
        <EmptyState
          icon={
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className="h-10 w-10"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              aria-hidden="true"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.5}
                d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
              />
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.5}
                d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"
              />
            </svg>
          }
          title="No Significant Movers"
          description="Watchlist items with daily changes of 2% or more will appear here."
        />
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-4 shadow-sm">
      <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-4">
        Watchlist Movers
      </h3>
      <div className="space-y-2 max-h-64 overflow-y-auto">
        {movers.map((mover) => (
          <div
            key={mover.ticker}
            className={`flex items-center justify-between rounded-md px-3 py-2 ${getChangeBg(mover.daily_change_pct)}`}
          >
            <div>
              <p className="text-sm font-medium text-gray-900 dark:text-gray-100">{mover.ticker}</p>
              {mover.company_name && (
                <p className="text-xs text-gray-500 dark:text-gray-400">{mover.company_name}</p>
              )}
            </div>
            <div className="text-right">
              <p className="text-sm font-medium text-gray-900 dark:text-gray-100">
                {new Intl.NumberFormat('en-US', {
                  style: 'currency',
                  currency: 'USD',
                }).format(mover.current_price)}
              </p>
              <p className={`text-xs font-medium ${getChangeColor(mover.daily_change_pct)}`}>
                {mover.daily_change_pct > 0 ? '+' : ''}
                {mover.daily_change_pct}%
              </p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
