import { useMemo } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { useHoldings } from '../../hooks/useHoldings';
import { EmptyState } from '../shared';

interface MonthlyDividend {
  month: string;
  amount: number;
}

const MONTH_LABELS = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
];

export default function DividendForecastChart() {
  const { data: holdings, isLoading } = useHoldings();

  const monthlyData: MonthlyDividend[] = useMemo(() => {
    if (!holdings || holdings.length === 0) return [];

    const totalAnnualDividend = holdings.reduce((sum, h) => sum + h.annual_dividend_income, 0);

    if (totalAnnualDividend === 0) return [];

    const monthlyAmount = totalAnnualDividend / 12;

    const now = new Date();
    const currentMonth = now.getMonth();

    return Array.from({ length: 12 }, (_, i) => {
      const monthIndex = (currentMonth + i) % 12;
      return {
        month: MONTH_LABELS[monthIndex],
        amount: Math.round(monthlyAmount * 100) / 100,
      };
    });
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

  if (monthlyData.length === 0) {
    return (
      <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-4 shadow-sm">
        <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-4">
          Dividend Forecast
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
                d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
          }
          title="No Dividend Data"
          description="Dividend forecast will appear here once you have holdings with dividend income."
        />
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-4 shadow-sm">
      <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-4">
        Dividend Forecast (Next 12 Months)
      </h3>
      <ResponsiveContainer width="100%" height={256}>
        <BarChart data={monthlyData} margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 3" className="stroke-gray-200 dark:stroke-gray-700" />
          <XAxis
            dataKey="month"
            tick={{ fontSize: 12 }}
            className="text-gray-500 dark:text-gray-400"
          />
          <YAxis
            tick={{ fontSize: 12 }}
            className="text-gray-500 dark:text-gray-400"
            tickFormatter={(value: number) =>
              new Intl.NumberFormat('en-US', {
                style: 'currency',
                currency: 'USD',
                minimumFractionDigits: 0,
                maximumFractionDigits: 0,
              }).format(value)
            }
          />
          <Tooltip
            formatter={(value) => [
              new Intl.NumberFormat('en-US', {
                style: 'currency',
                currency: 'USD',
              }).format(Number(value)),
              'Projected Dividend',
            ]}
            contentStyle={{
              backgroundColor: 'var(--color-white, #fff)',
              border: '1px solid var(--color-gray-200, #e5e7eb)',
              borderRadius: '0.375rem',
            }}
          />
          <Bar dataKey="amount" fill="#8b5cf6" radius={[4, 4, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
