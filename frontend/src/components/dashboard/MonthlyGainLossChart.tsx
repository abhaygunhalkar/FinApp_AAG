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
  Legend,
} from 'recharts';
import { useMonthlyRealizedGain } from '../../hooks/useDashboard';
import { useOptionsMonthlyPnl } from '../../hooks/useOptions';
import { parseLocalDateString } from '../../utils/date';
import { EmptyState } from '../shared';

const MONTH_NAMES = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
];

function formatCurrency(value: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(value);
}

export default function MonthlyGainLossChart() {
  const { data: sells, isLoading: sellsLoading } = useMonthlyRealizedGain();
  const { data: optionsPnl, isLoading: optionsLoading } = useOptionsMonthlyPnl();

  const isLoading = sellsLoading || optionsLoading;

  const monthlyData = useMemo(() => {
    const currentYear = new Date().getFullYear();
    const totals = MONTH_NAMES.map((month) => ({ month, stocks: 0, options: 0 }));

    if (sells) {
      for (const sell of sells) {
        const d = parseLocalDateString(sell.transaction_date);
        if (d.getFullYear() === currentYear) {
          totals[d.getMonth()].stocks += sell.realized_gain;
        }
      }
    }

    if (optionsPnl) {
      for (const entry of optionsPnl) {
        const d = parseLocalDateString(entry.transaction_date);
        if (d.getFullYear() === currentYear) {
          totals[d.getMonth()].options += entry.realized_gain;
        }
      }
    }

    return totals.map((row) => ({
      month: row.month,
      stocks: parseFloat(row.stocks.toFixed(2)),
      options: parseFloat(row.options.toFixed(2)),
    }));
  }, [sells, optionsPnl]);

  const hasData = monthlyData.some((e) => e.stocks !== 0 || e.options !== 0);

  if (isLoading) {
    return (
      <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-4 shadow-sm">
        <div className="h-64 flex items-center justify-center">
          <p className="text-sm text-gray-500 dark:text-gray-400">Loading...</p>
        </div>
      </div>
    );
  }

  if (!hasData) {
    return (
      <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-4 shadow-sm">
        <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-4">
          Monthly Gain/Loss
        </h3>
        <EmptyState
          icon={
            <svg xmlns="http://www.w3.org/2000/svg" className="h-10 w-10" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 12h18M12 3v18" />
            </svg>
          }
          title="No monthly gain/loss data"
          description="Realized gain/loss for the current year will appear here once sell transactions are available."
        />
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-4 shadow-sm text-gray-900 dark:text-gray-100">
      <div className="mb-4 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">
          Monthly Gain/Loss
        </h3>
        <span className="text-xs text-gray-500 dark:text-gray-400">Current Year</span>
      </div>
      <ResponsiveContainer width="100%" height={256}>
        <BarChart data={monthlyData} margin={{ top: 5, right: 12, left: 0, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 3" className="stroke-gray-200 dark:stroke-gray-700" />
          <XAxis dataKey="month" tick={{ fontSize: 12 }} className="text-gray-500 dark:text-gray-400" />
          <YAxis tick={{ fontSize: 12 }} className="text-gray-500 dark:text-gray-400" tickFormatter={formatCurrency} />
          <Tooltip
            formatter={(value, name) => [
              formatCurrency(Number(value)),
              name === 'stocks' ? 'Stocks' : 'Options',
            ]}
            contentStyle={{
              backgroundColor: 'var(--color-white, #fff)',
              border: '1px solid var(--color-gray-200, #e5e7eb)',
              borderRadius: '0.375rem',
            }}
          />
          <Legend
            formatter={(value) => (value === 'stocks' ? 'Stocks' : 'Options')}
            wrapperStyle={{ fontSize: 12 }}
          />
          <Bar dataKey="stocks" radius={[4, 4, 0, 0]} fill="#3b82f6">
            {monthlyData.map((entry) => (
              <Cell key={`stocks-${entry.month}`} fill={entry.stocks >= 0 ? '#3b82f6' : '#ef4444'} />
            ))}
          </Bar>
          <Bar dataKey="options" radius={[4, 4, 0, 0]} fill="#8b5cf6">
            {monthlyData.map((entry) => (
              <Cell key={`options-${entry.month}`} fill={entry.options >= 0 ? '#8b5cf6' : '#f97316'} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
