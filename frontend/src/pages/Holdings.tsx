import { useMemo, useState } from 'react';
import { useHoldings } from '../hooks/useHoldings';
import { HoldingsTable, SearchFilter, HoldingForm } from '../components/holdings';
import { LoadingSpinner } from '../components/shared';
import apiClient from '../api/client';
import { useQueryClient } from '@tanstack/react-query';

function fmt(v: number) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
  }).format(v);
}

function StatCard({
  label,
  value,
  valueClass = '',
  sub,
}: {
  label: string;
  value: string;
  valueClass?: string;
  sub?: string;
}) {
  return (
    <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 px-5 py-4 flex flex-col gap-1 shadow-sm">
      <span className="text-xs font-medium text-slate-400 uppercase tracking-widest">{label}</span>
      <span className={`text-2xl font-bold tabular-nums ${valueClass}`}>{value}</span>
      {sub && <span className="text-xs text-slate-400">{sub}</span>}
    </div>
  );
}

export default function Holdings() {
  const { data: holdings, isLoading, isError } = useHoldings();
  const [showAddForm, setShowAddForm] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const queryClient = useQueryClient();

  const handleRefreshPrices = async () => {
    setIsRefreshing(true);
    try {
      await apiClient.post('/api/market/refresh');
      await queryClient.invalidateQueries({ queryKey: ['holdings'] });
      await queryClient.invalidateQueries({ queryKey: ['dashboard'] });
    } catch {
      // silently fail — prices update on next scheduled refresh
    } finally {
      setIsRefreshing(false);
    }
  };

  const holdingsList = holdings ?? [];

  const stats = useMemo(() => {
    const totalValue = holdingsList.reduce((s, h) => s + h.current_value, 0);
    const totalInvested = holdingsList.reduce((s, h) => s + h.total_invested, 0);
    const totalGain = holdingsList.reduce((s, h) => s + h.unrealized_gain, 0);
    const dailyChange = holdingsList.reduce((s, h) => s + h.daily_change, 0);
    return { totalValue, totalInvested, totalGain, dailyChange };
  }, [holdingsList]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <LoadingSpinner size="lg" />
      </div>
    );
  }

  if (isError) {
    return (
      <div className="flex items-center gap-2 px-4 py-3 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-sm text-red-700 dark:text-red-400">
        Failed to load holdings. Please try again.
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* ── page header ── */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Holdings</h1>
          <p className="text-sm text-slate-400 mt-0.5">Manage your stock portfolio</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleRefreshPrices}
            disabled={isRefreshing}
            title="Fetch latest prices"
            className="inline-flex items-center gap-2 px-4 py-2.5 text-sm font-medium text-slate-600 dark:text-slate-300 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
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
            {isRefreshing ? 'Refreshing…' : 'Refresh Prices'}
          </button>
          <button
            onClick={() => setShowAddForm(true)}
            className="inline-flex items-center gap-2 px-4 py-2.5 bg-slate-900 dark:bg-white text-white dark:text-slate-900 text-sm font-semibold rounded-lg shadow-sm hover:bg-slate-700 dark:hover:bg-slate-100 transition-colors"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 16 16"
              fill="currentColor"
              className="w-4 h-4"
            >
              <path d="M8.75 3.75a.75.75 0 0 0-1.5 0v3.5h-3.5a.75.75 0 0 0 0 1.5h3.5v3.5a.75.75 0 0 0 1.5 0v-3.5h3.5a.75.75 0 0 0 0-1.5h-3.5v-3.5Z" />
            </svg>
            Add Holding
          </button>
        </div>
      </div>

      {/* ── stat cards ── */}
      {holdingsList.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <StatCard
            label="Holdings"
            value={String(holdingsList.length)}
            valueClass="text-slate-800 dark:text-white"
          />
          <StatCard
            label="Total Value"
            value={fmt(stats.totalValue)}
            valueClass="text-slate-800 dark:text-white"
          />
          <StatCard
            label="Unrealized Gain/Loss"
            value={`${stats.totalGain >= 0 ? '+' : ''}${fmt(stats.totalGain)}`}
            valueClass={stats.totalGain >= 0 ? 'text-emerald-600' : 'text-red-500'}
            sub={`Cost basis ${fmt(stats.totalInvested)}`}
          />
          <StatCard
            label="Day's Change"
            value={`${stats.dailyChange >= 0 ? '+' : ''}${fmt(stats.dailyChange)}`}
            valueClass={stats.dailyChange >= 0 ? 'text-emerald-600' : 'text-red-500'}
          />
        </div>
      )}

      {/* ── search / filter bar ── */}
      <SearchFilter holdings={holdingsList} />

      {/* ── table ── */}
      <HoldingsTable holdings={holdingsList} />

      {showAddForm && <HoldingForm onClose={() => setShowAddForm(false)} />}
    </div>
  );
}
