import { useMemo } from 'react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from 'recharts';
import { useMonthlyRealizedGain } from '../../hooks/useDashboard';
import { parseLocalDateString } from '../../utils/date';
import { EmptyState } from '../shared';

function formatCurrency(value: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(value);
}

export default function RealizedGainByTickerChart() {
  const { data: sells, isLoading } = useMonthlyRealizedGain();

  const chartData = useMemo(() => {
    if (!sells) return [];
    const currentYear = new Date().getFullYear();
    const byTicker: Record<string, number> = {};

    for (const sell of sells) {
      const d = parseLocalDateString(sell.transaction_date);
      if (d.getFullYear() !== currentYear) continue;
      byTicker[sell.ticker] = (byTicker[sell.ticker] ?? 0) + sell.realized_gain;
    }

    return Object.entries(byTicker)
      .map(([ticker, gain]) => ({ ticker, gain: parseFloat(gain.toFixed(2)) }))
      .sort((a, b) => b.gain - a.gain);
  }, [sells]);

  if (isLoading) {
    return (
      <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-4 shadow-sm">
        <div className="h-64 flex items-center justify-center">
          <p className="text-sm text-gray-500 dark:text-gray-400">Loading...</p>
        </div>
      </div>
    );
  }

  if (chartData.length === 0) {
    return (
      <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-4 shadow-sm">
        <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-4">
          Realized Gain by Ticker
        </h3>
        <EmptyState
          icon={
            <svg xmlns="http://www.w3.org/2000/svg" className="h-10 w-10" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
            </svg>
          }
          title="No realized gains yet"
          description="Sell transactions for the current year will appear here."
        />
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-4 shadow-sm text-gray-900 dark:text-gray-100">
      <div className="mb-4 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">
          Realized Gain by Ticker
        </h3>
        <span className="text-xs text-gray-500 dark:text-gray-400">Current Year</span>
      </div>
      <ResponsiveContainer width="100%" height={256}>
        <BarChart data={chartData} margin={{ top: 5, right: 12, left: 0, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 3" className="stroke-gray-200 dark:stroke-gray-700" />
          <XAxis dataKey="ticker" tick={{ fontSize: 12 }} />
          <YAxis tick={{ fontSize: 12 }} tickFormatter={formatCurrency} width={70} />
          <Tooltip
            formatter={(value) => [formatCurrency(Number(value)), 'Realized Gain']}
            contentStyle={{
              backgroundColor: 'var(--color-white, #fff)',
              border: '1px solid var(--color-gray-200, #e5e7eb)',
              borderRadius: '0.375rem',
            }}
          />
          <Bar dataKey="gain" radius={[4, 4, 0, 0]}>
            {chartData.map((entry) => (
              <Cell key={entry.ticker} fill={entry.gain >= 0 ? '#10b981' : '#ef4444'} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
