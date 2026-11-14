import { useState } from 'react';
import { useWatchlist } from '../hooks/useWatchlist';
import { WatchlistTable, WatchlistForm } from '../components/watchlist';
import { LoadingSpinner, EmptyState } from '../components/shared';
import apiClient from '../api/client';
import { useQueryClient } from '@tanstack/react-query';

export default function Watchlist() {
  const { data: items, isLoading, isError } = useWatchlist();
  const [showAddForm, setShowAddForm] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const queryClient = useQueryClient();

  const handleRefreshPrices = async () => {
    setIsRefreshing(true);
    try {
      await apiClient.post('/api/market/refresh');
      await queryClient.invalidateQueries({ queryKey: ['watchlist'] });
      await queryClient.invalidateQueries({ queryKey: ['dashboard'] });
    } catch {
      // Silently fail
    } finally {
      setIsRefreshing(false);
    }
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
      <div className="p-4">
        <p className="text-red-600 dark:text-red-400">
          Failed to load watchlist. Please try again.
        </p>
      </div>
    );
  }

  const watchlistItems = items ?? [];

  if (watchlistItems.length === 0) {
    return (
      <div className="p-4">
        <h1 className="text-3xl font-bold text-slate-900 dark:text-white mb-2">Watchlist</h1>
        <p className="text-sm text-slate-500 dark:text-slate-400 mb-6">
          Monitor stocks you're considering
        </p>
        <EmptyState
          icon={
            <svg className="w-12 h-12" fill="none" stroke="currentColor" viewBox="0 0 24 24">
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
          title="No watchlist items"
          description="Add stocks to your watchlist to monitor their prices and make informed buy decisions."
          actionLabel="Add to Watchlist"
          onAction={() => setShowAddForm(true)}
        />

        {showAddForm && <WatchlistForm onClose={() => setShowAddForm(false)} />}
      </div>
    );
  }

  return (
    <div className="p-4">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-3xl font-bold text-slate-900 dark:text-white">Watchlist</h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            Monitor stocks you're considering
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={handleRefreshPrices}
            disabled={isRefreshing}
            className="inline-flex items-center gap-2 px-4 py-2.5 text-sm font-medium text-slate-700 dark:text-slate-200 bg-white dark:bg-slate-700 border border-slate-300 dark:border-slate-600 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-600 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 dark:focus:ring-offset-slate-900 transition-colors shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
            title="Fetch latest prices from market"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className={`h-4 w-4 ${isRefreshing ? 'animate-spin' : ''}`}
              viewBox="0 0 20 20"
              fill="currentColor"
            >
              <path
                fillRule="evenodd"
                d="M4 2a1 1 0 011 1v2.101a7.002 7.002 0 0111.601 2.566 1 1 0 11-1.885.666A5.002 5.002 0 005.999 7H9a1 1 0 010 2H4a1 1 0 01-1-1V3a1 1 0 011-1zm.008 9.057a1 1 0 011.276.61A5.002 5.002 0 0014.001 13H11a1 1 0 110-2h5a1 1 0 011 1v5a1 1 0 11-2 0v-2.101a7.002 7.002 0 01-11.601-2.566 1 1 0 01.61-1.276z"
                clipRule="evenodd"
              />
            </svg>
            {isRefreshing ? 'Refreshing...' : 'Refresh Prices'}
          </button>
          <button
            onClick={() => setShowAddForm(true)}
            className="inline-flex items-center gap-2 px-4 py-2.5 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 dark:focus:ring-offset-slate-900 transition-colors shadow-sm"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className="h-4 w-4"
              viewBox="0 0 20 20"
              fill="currentColor"
            >
              <path
                fillRule="evenodd"
                d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z"
                clipRule="evenodd"
              />
            </svg>
            Add to Watchlist
          </button>
        </div>
      </div>
      <WatchlistTable items={watchlistItems} />

      {showAddForm && <WatchlistForm onClose={() => setShowAddForm(false)} />}
    </div>
  );
}
