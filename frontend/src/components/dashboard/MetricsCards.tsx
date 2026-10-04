import type { DashboardSummary } from '../../types';
import BrokerTiles from './BrokerTiles';

interface MetricsCardsProps {
  data: DashboardSummary;
}

interface MetricCardProps {
  label: string;
  value: string;
  changeValue?: number;
  variant?: 'default' | 'blue' | 'purple' | 'peacock';
}

function formatCurrency(value: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

function formatNumber(value: number): string {
  return new Intl.NumberFormat('en-US').format(value);
}

function getChangeColor(value: number): string {
  if (value > 0) return 'text-green-600 dark:text-green-400';
  if (value < 0) return 'text-red-600 dark:text-red-400';
  return 'text-gray-500 dark:text-gray-400';
}

function MetricCard({ label, value, changeValue, variant = 'default' }: MetricCardProps) {
  const baseClasses = 'rounded-xl p-5 shadow-sm hover:shadow-md transition-shadow duration-200';
  const variantClasses =
    variant === 'blue'
      ? 'bg-gradient-to-br from-sky-700 via-sky-800 to-sky-900 text-white shadow-sky-700/40 border border-transparent'
      : variant === 'purple'
      ? 'bg-gradient-to-br from-violet-700 via-violet-800 to-violet-900 text-white shadow-violet-700/40 border border-transparent'
      : variant === 'peacock'
      ? 'bg-gradient-to-br from-teal-700 via-teal-800 to-teal-900 text-white shadow-teal-700/40 border border-transparent'
      : 'border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-800 text-slate-900 dark:text-white';
  const labelClasses = variant === 'default' ? 'text-sm font-medium text-slate-500 dark:text-slate-400' : 'text-sm font-medium text-white/90';
  const valueClasses = variant === 'default' ? 'mt-2 text-2xl font-bold text-slate-900 dark:text-white' : 'mt-2 text-2xl font-bold text-white';
  const changeClasses =
    variant === 'purple'
      ? 'mt-1 text-sm font-semibold text-white/90'
      : `mt-1 text-sm font-semibold ${getChangeColor(changeValue ?? 0)}`;

  return (
    <div className={`${baseClasses} ${variantClasses}`}>
      <p className={labelClasses}>{label}</p>
      <p className={valueClasses}>{value}</p>
      {changeValue !== undefined && (
        <p className={changeClasses}>
          {changeValue > 0 ? '↑ +' : changeValue < 0 ? '↓ ' : ''}
          {formatCurrency(changeValue)}
        </p>
      )}
    </div>
  );
}

export default function MetricsCards({ data }: MetricsCardsProps) {
  return (
    <div>
      {data.stale_data && (
        <div className="mb-4 flex items-center gap-2 rounded-md bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 px-3 py-2">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            className="h-5 w-5 text-yellow-600 dark:text-yellow-400"
            viewBox="0 0 20 20"
            fill="currentColor"
            aria-hidden="true"
          >
            <path
              fillRule="evenodd"
              d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z"
              clipRule="evenodd"
            />
          </svg>
          <span className="text-sm font-medium text-yellow-800 dark:text-yellow-200">
            Market data may be stale. Last updated:{' '}
            {data.last_successful_fetch
              ? new Date(data.last_successful_fetch).toLocaleString()
              : 'Never'}
          </span>
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-xl bg-gradient-to-br from-blue-500 to-blue-700 p-5 shadow-lg shadow-blue-500/20">
          <p className="text-sm font-medium text-blue-100">Total Portfolio Value</p>
          <p className="mt-2 text-2xl font-bold text-white">{formatCurrency(data.total_portfolio_value)}</p>
        </div>
        <BrokerTiles />
        <div className="rounded-xl bg-gradient-to-br from-indigo-500 to-indigo-700 p-5 shadow-lg shadow-indigo-500/20">
          <p className="text-sm font-medium text-indigo-100">Total Invested</p>
          <p className="mt-2 text-2xl font-bold text-white">{formatCurrency(data.total_invested)}</p>
        </div>
        <MetricCard
          label="Unrealized Gain/Loss"
          value={formatCurrency(data.unrealized_gain)}
          changeValue={data.unrealized_gain}
          variant="blue"
        />
        <MetricCard
          label="ETF Unrealized Gain/Loss"
          value={formatCurrency(data.etf_unrealized_gain)}
          variant="purple"
        />
        <MetricCard
          label="Realized Gain/Loss"
          value={formatCurrency(data.realized_gain)}
          changeValue={data.realized_gain}
          variant="peacock"
        />
        <div className={`rounded-xl p-5 shadow-lg ${
          data.daily_change > 0
            ? 'bg-gradient-to-br from-green-500 to-green-700 shadow-green-500/20'
            : data.daily_change < 0
              ? 'bg-gradient-to-br from-red-500 to-red-700 shadow-red-500/20'
              : 'bg-gradient-to-br from-slate-500 to-slate-700 shadow-slate-500/20'
        }`}>
          <p className="text-sm font-medium text-white/80">Daily Change</p>
          <p className="mt-2 text-2xl font-bold text-white">
            {data.daily_change > 0 ? '+' : ''}{formatCurrency(data.daily_change)}
          </p>
        </div>
        <div className="rounded-xl bg-gradient-to-br from-amber-500 to-amber-700 p-5 shadow-lg shadow-amber-500/20">
          <p className="text-sm font-medium text-amber-100">Cash Position</p>
          <p className="mt-2 text-2xl font-bold text-white">{formatCurrency(data.cash_position)}</p>
        </div>
        <MetricCard
          label="Number of Holdings"
          value={formatNumber(data.number_of_holdings)}
        />
      </div>
    </div>
  );
}
