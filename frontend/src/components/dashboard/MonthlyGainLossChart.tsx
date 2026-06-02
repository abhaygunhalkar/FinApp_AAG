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
  const { data: sells, isLoading } = useMonthlyRealizedGain();

  const monthlyData = useMemo(() => {
    const currentYear = new Date().getFullYear();
    const monthlyTotals = MONTH_NAMES.map((month) => ({
      month,
      total: 0,
    }));

    if (!sells) {
      return monthlyTotals;
    }

    for (const sell of sells) {
      const transactionDate = new Date(sell.transaction_date);
      if (transactionDate.getFullYear() !== currentYear) {
        continue;
      }
      const monthIndex = transactionDate.getMonth();
      monthlyTotals[monthIndex].total += sell.realized_gain;
    }

    return monthlyTotals;
  }, [sells]);

  const hasData = monthlyData.some((entry) => entry.total !== 0);

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
          <XAxis
            dataKey="month"
            tick={{ fontSize: 12 }}
            className="text-gray-500 dark:text-gray-400"
          />
          <YAxis
            tick={{ fontSize: 12 }}
            className="text-gray-500 dark:text-gray-400"
            tickFormatter={formatCurrency}
          />
          <Tooltip
            formatter={(value) => [formatCurrency(Number(value)), 'Gain/Loss']}
            labelFormatter={(label) => String(label)}
            contentStyle={{
              backgroundColor: 'var(--color-white, #fff)',
              border: '1px solid var(--color-gray-200, #e5e7eb)',
              borderRadius: '0.375rem',
            }}
          />
          <Bar dataKey="total" radius={[4, 4, 0, 0]}>
            {monthlyData.map((entry) => (
              <Cell
                key={entry.month}
                fill={entry.total >= 0 ? '#3b82f6' : '#ef4444'}
              />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
