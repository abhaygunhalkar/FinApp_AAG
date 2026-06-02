import { useDashboardSummary } from '../hooks';
import {
  MetricsCards,
  PortfolioGrowthChart,
  MonthlyGainLossChart,
  SectorAllocationChart,
} from '../components/dashboard';
import { LoadingSpinner, ErrorNotification } from '../components/shared';
import { useState } from 'react';
import type { DashboardSummary } from '../types';

const emptySummary: DashboardSummary = {
  total_portfolio_value: 0,
  total_invested: 0,
  unrealized_gain: 0,
  etf_unrealized_gain: 0,
  realized_gain: 0,
  daily_change: 0,
  annual_dividend_income: 0,
  cash_position: 0,
  number_of_holdings: 0,
  stale_data: false,
  last_successful_fetch: null,
};

export default function Dashboard() {
  const { data, isLoading, isError, error } = useDashboardSummary();
  const [showError, setShowError] = useState(true);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <LoadingSpinner size="lg" />
      </div>
    );
  }

  const summary: DashboardSummary = data ?? emptySummary;

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-slate-900 dark:text-white">
          Dashboard
        </h1>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          Your portfolio overview at a glance
        </p>
      </div>

      {isError && showError && (
        <ErrorNotification
          message={error instanceof Error ? error.message : 'Failed to load dashboard data'}
          onDismiss={() => setShowError(false)}
        />
      )}

      <MetricsCards data={summary} />

      <div className="mt-8 grid gap-6 xl:grid-cols-[2fr_1fr]">
        <div className="grid gap-6">
          <PortfolioGrowthChart />
          <MonthlyGainLossChart />
        </div>
        <SectorAllocationChart />
      </div>
    </div>
  );
}
