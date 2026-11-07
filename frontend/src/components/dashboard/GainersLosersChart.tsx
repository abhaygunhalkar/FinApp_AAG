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
import { useHoldings } from '../../hooks/useHoldings';
import { EmptyState } from '../shared';

interface ChartItem {
  ticker: string;
  unrealized_gain_pct: number;
}

export default function GainersLosersChart() {
  const { data: holdings, isLoading } = useHoldings();

  const chartData: ChartItem[] = useMemo(() => {
    if (!holdings || holdings.length === 0) return [];

    const sorted = [...holdings].sort(
      (a, b) => b.unrealized_gain_pct - a.unrealized_gain_pct
    );

    const gainers = sorted.slice(0, 5).filter((h) => h.unrealized_gain_pct > 0);
    const losers = sorted
      .slice(-5)
      .filter((h) => h.unrealized_gain_pct < 0)
      .reverse();

    return [
      ...gainers.map((h) => ({
        ticker: h.ticker,
        unrealized_gain_pct: Math.round(h.unrealized_gain_pct * 100) / 100,
      })),
      ...losers.map((h) => ({
        ticker: h.ticker,
        unrealized_gain_pct: Math.round(h.unrealized_gain_pct * 100) / 100,
      })),
    ];
  }, [holdings]);

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
          Top Gainers & Losers
        </h3>
        <EmptyState
          icon={
            <svg xmlns="http://www.w3.org/2000/svg" className="h-10 w-10" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
            </svg>
          }
          title="No Gainers or Losers"
          description="Performance data will appear here once you have holdings with price changes."
        />
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-4 shadow-sm">
      <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-4">
        Top Gainers & Losers
      </h3>
      <ResponsiveContainer width="100%" height={256}>
        <BarChart data={chartData} margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 3" className="stroke-gray-200 dark:stroke-gray-700" />
          <XAxis
            dataKey="ticker"
            tick={{ fontSize: 12 }}
            className="text-gray-500 dark:text-gray-400"
          />
          <YAxis
            tick={{ fontSize: 12 }}
            className="text-gray-500 dark:text-gray-400"
            tickFormatter={(value: number) => `${value}%`}
          />
          <Tooltip
            formatter={(value) => [`${value}%`, 'Unrealized Gain']}
            contentStyle={{
              backgroundColor: 'var(--color-white, #fff)',
              border: '1px solid var(--color-gray-200, #e5e7eb)',
              borderRadius: '0.375rem',
            }}
          />
          <Bar dataKey="unrealized_gain_pct" radius={[4, 4, 0, 0]}>
            {chartData.map((entry, index) => (
              <Cell
                key={`cell-${index}`}
                fill={entry.unrealized_gain_pct >= 0 ? 'var(--color-gain-500)' : 'var(--color-loss-500)'}
              />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
