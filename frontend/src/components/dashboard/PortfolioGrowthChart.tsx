import { useState } from 'react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import { usePortfolioHistory } from '../../hooks/useDashboard';
import { parseLocalDateString } from '../../utils/date';
import { EmptyState } from '../shared';
import { useUIStore } from '../../store/uiStore';
import { MASK } from '../networth/format';

type Range = 7 | 30 | 90 | 365;

const RANGE_OPTIONS: { label: string; value: Range }[] = [
  { label: '7d', value: 7 },
  { label: '30d', value: 30 },
  { label: '90d', value: 90 },
  { label: '1y', value: 365 },
];

function formatCurrency(value: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value);
}

export default function PortfolioGrowthChart() {
  const [range, setRange] = useState<Range>(30);
  const hidden = useUIStore((s) => s.hideBalances);
  const money = (v: number) => (hidden ? MASK : formatCurrency(v));
  const { data: history, isLoading } = usePortfolioHistory(range);

  if (isLoading) {
    return (
      <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-4 shadow-sm">
        <div className="h-64 flex items-center justify-center">
          <p className="text-sm text-gray-500 dark:text-gray-400">Loading...</p>
        </div>
      </div>
    );
  }

  if (!history || history.length === 0) {
    return (
      <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-4 shadow-sm">
        <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-4">
          Portfolio Growth
        </h3>
        <EmptyState
          icon={
            <svg xmlns="http://www.w3.org/2000/svg" className="h-10 w-10" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 12l3-3 3 3 4-4M8 21l4-4 4 4M3 4h18M4 4h16v12a1 1 0 01-1 1H5a1 1 0 01-1-1V4z" />
            </svg>
          }
          title="No Portfolio History"
          description="Portfolio growth data will appear here once price history is available."
        />
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-4 shadow-sm">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">
          Portfolio Growth
        </h3>
        <div className="flex gap-1">
          {RANGE_OPTIONS.map((option) => (
            <button
              key={option.value}
              onClick={() => setRange(option.value)}
              className={`px-2 py-1 text-xs font-medium rounded transition-colors ${
                range === option.value
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
              }`}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>
      <ResponsiveContainer width="100%" height={256}>
        <LineChart data={history} margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 3" className="stroke-gray-200 dark:stroke-gray-700" />
          <XAxis
            dataKey="date"
            tick={{ fontSize: 12 }}
            className="text-gray-500 dark:text-gray-400"
            tickFormatter={(value: string) => {
              const date = parseLocalDateString(value);
              return `${date.getMonth() + 1}/${date.getDate()}`;
            }}
          />
          <YAxis
            tick={{ fontSize: 12 }}
            className="text-gray-500 dark:text-gray-400"
            tickFormatter={money}
          />
          <Tooltip
            formatter={(value) => [money(Number(value)), 'Portfolio Value']}
            labelFormatter={(label) => parseLocalDateString(String(label)).toLocaleDateString()}
            contentStyle={{
              backgroundColor: 'var(--color-white, #fff)',
              border: '1px solid var(--color-gray-200, #e5e7eb)',
              borderRadius: '0.375rem',
            }}
          />
          <Line
            type="monotone"
            dataKey="total_value"
            stroke="#3b82f6"
            strokeWidth={2}
            dot={false}
            activeDot={{ r: 4 }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
