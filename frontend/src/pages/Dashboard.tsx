import { useDashboardSummary, useOptions } from '../hooks';
import {
  MetricsCards,
  PortfolioGrowthChart,
  MonthlyGainLossChart,
  SectorAllocationChart,
  RealizedGainByTickerChart,
} from '../components/dashboard';
import { LoadingSpinner, ErrorNotification, HideNumbersToggle } from '../components/shared';
import { MASK } from '../components/networth/format';
import { useUIStore } from '../store/uiStore';
import { useState } from 'react';
import type { DashboardSummary } from '../types';

function formatCurrency(value: number): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2 }).format(value);
}

function OptionsStats() {
  const { data: trades } = useOptions();
  const hidden = useUIStore((s) => s.hideBalances);
  const money = (v: number) => (hidden ? MASK : formatCurrency(v));

  const creditTypes = new Set(['sell_call', 'sell_put']);
  const debitTypes = new Set(['buy_call', 'buy_put']);

  const collected = (trades ?? []).reduce((acc: number, t: any) => {
    if (creditTypes.has(t.trade_type)) return acc + (t.premium || 0) * (t.contracts || 0) * 100;
    return acc;
  }, 0);

  const paid = (trades ?? []).reduce((acc: number, t: any) => {
    if (debitTypes.has(t.trade_type)) return acc + (t.premium || 0) * (t.contracts || 0) * 100;
    return acc;
  }, 0);

  const net = collected - paid;

  const realized = (trades ?? []).reduce((acc: number, t: any) => {
    if (t.status === 'closed' || t.status === 'expired_worthless') return acc + (t.pnl || 0);
    return acc;
  }, 0);

  return (
    <div className="mt-6 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
  <div className="rounded-xl p-4 bg-green-100 border-2 border-green-300">
    <p className="text-sm font-medium text-green-800">Premium collected</p>
    <p className="mt-2 text-xl font-bold text-green-900">{money(collected)}</p>
  </div>
  <div className="rounded-xl p-4 bg-red-100 border-2 border-red-300">
    <p className="text-sm font-medium text-red-800">Premium paid</p>
    <p className="mt-2 text-xl font-bold text-red-900">{hidden ? MASK : `-${formatCurrency(paid)}`}</p>
  </div>
  <div className={`rounded-xl p-4 ${net >= 0 ? 'bg-green-100 border-2 border-green-300' : 'bg-red-100 border-2 border-red-300'}`}>
    <p className="text-sm font-medium text-slate-600">Net premium</p>
    <p className={`mt-2 text-xl font-bold ${net >= 0 ? 'text-green-900' : 'text-red-900'}`}>{money(net)}</p>
  </div>
  <div className="rounded-xl p-4 bg-slate-200 border-2 border-slate-300">
    <p className="text-sm font-medium text-slate-600">Realized P&L</p>
    <p className="mt-2 text-xl font-bold text-slate-900">{money(realized)}</p>
  </div>
</div>
  );
}

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
      <div className="mb-8 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-slate-900 dark:text-white">Dashboard</h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            Your portfolio overview at a glance
          </p>
        </div>
        <HideNumbersToggle />
      </div>

      {isError && showError && (
        <ErrorNotification
          message={error instanceof Error ? error.message : 'Failed to load dashboard data'}
          onDismiss={() => setShowError(false)}
        />
      )}

      <MetricsCards data={summary} />

      {/* Options summary stat cards (premium collected/paid, net premium, realized P&L) */}
      <OptionsStats />

      <div className="mt-8 grid gap-6 xl:grid-cols-[2fr_1fr]">
        <PortfolioGrowthChart />
        <SectorAllocationChart />
        <MonthlyGainLossChart />
        <div className="xl:col-start-1">
          <RealizedGainByTickerChart />
        </div>
      </div>
    </div>
  );
}
