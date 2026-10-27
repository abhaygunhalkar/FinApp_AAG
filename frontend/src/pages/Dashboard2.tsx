import { useMemo, useState } from 'react';
import {
  useBrokerSummary,
  useDashboardSummary,
  useHoldings,
  useIntraday,
  useMonthlyRealizedGain,
  useOptions,
  useOptionsMonthlyPnl,
} from '../hooks';
import { ErrorNotification, HideNumbersToggle } from '../components/shared';
import { useUIStore } from '../store/uiStore';
import Hero from '../components/dashboard2/Hero';
import BrokerCard from '../components/dashboard2/BrokerCard';
import PerformanceCard from '../components/dashboard2/PerformanceCard';
import OptionsCard from '../components/dashboard2/OptionsCard';
import { optionsYtd, type OptionTradeLite } from '../components/dashboard2/calc';
import GrowthCard from '../components/dashboard2/GrowthCard';
import SectorCard from '../components/dashboard2/SectorCard';
import {
  MonthlyRealizedCard,
  TickerRealizedCard,
  type MonthRow,
  type TickerGain,
} from '../components/dashboard2/RealizedCards';
import { inCurrentYear } from '../components/dashboard2/format';
import { parseLocalDateString } from '../utils/date';

// Below 900px every row stacks; above it, cards fill columns at least 280/340px wide.
const ROW_280 = 'grid grid-cols-1 gap-3 min-[900px]:grid-cols-[repeat(auto-fit,minmax(280px,1fr))]';
const ROW_340 = 'grid grid-cols-1 gap-3 min-[900px]:grid-cols-[repeat(auto-fit,minmax(340px,1fr))]';

function asOf(iso: string | null): string | null {
  if (!iso) return null;
  return new Date(iso).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

export default function Dashboard2() {
  const hidden = useUIStore((s) => s.hideBalances);
  const summaryQ = useDashboardSummary();
  const brokersQ = useBrokerSummary();
  const intradayQ = useIntraday();
  const holdingsQ = useHoldings();
  const sellsQ = useMonthlyRealizedGain();
  const optionsQ = useOptions();
  const pnlQ = useOptionsMonthlyPnl();
  const [showError, setShowError] = useState(true);

  const summary = summaryQ.data;

  // This year's stock sells, used by Performance and both realized-gain cards.
  const sellsYtd = useMemo(
    () => (sellsQ.data ? sellsQ.data.filter((s) => inCurrentYear(s.transaction_date)) : null),
    [sellsQ.data],
  );

  const months = useMemo<MonthRow[] | null>(() => {
    if (!sellsYtd || !pnlQ.data) return null;
    const rows = Array.from({ length: 12 }, (_, month) => ({ month, stocks: 0, options: 0 }));
    for (const s of sellsYtd)
      rows[parseLocalDateString(s.transaction_date).getMonth()].stocks += s.realized_gain;
    for (const p of pnlQ.data) {
      if (inCurrentYear(p.transaction_date))
        rows[parseLocalDateString(p.transaction_date).getMonth()].options += p.realized_gain;
    }
    return rows;
  }, [sellsYtd, pnlQ.data]);

  const tickers = useMemo<TickerGain[] | null>(() => {
    if (!sellsYtd) return null;
    const by = new Map<string, number>();
    for (const s of sellsYtd) by.set(s.ticker, (by.get(s.ticker) ?? 0) + s.realized_gain);
    return [...by.entries()].map(([ticker, gain]) => ({ ticker, gain }));
  }, [sellsYtd]);

  const options = useMemo(
    () =>
      optionsQ.data && pnlQ.data ? optionsYtd(optionsQ.data as OptionTradeLite[], pnlQ.data) : null,
    [optionsQ.data, pnlQ.data],
  );

  const stocksRealizedYtd = sellsYtd ? sellsYtd.reduce((s, x) => s + x.realized_gain, 0) : null;
  const brokerCount = brokersQ.data?.length;
  const updated = asOf(summary?.last_successful_fetch ?? null);

  return (
    <div className="mx-auto flex max-w-[1240px] flex-col gap-3 text-[13px] text-[#0E1116] tabular-nums dark:text-slate-100">
      <header className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 flex-wrap items-baseline gap-x-2.5 gap-y-1 pt-1">
          <h1 className="text-xl font-bold tracking-tight text-[#0E1116] dark:text-white">
            Dashboard
          </h1>
          {summary && (
            <span className="text-[13px] text-[#5B6472] dark:text-slate-400">
              {summary.number_of_holdings}{' '}
              {summary.number_of_holdings === 1 ? 'holding' : 'holdings'}
              {brokerCount !== undefined &&
                ` · ${brokerCount} ${brokerCount === 1 ? 'broker' : 'brokers'}`}
              {updated && ` · as of ${updated}`}
              {summary.stale_data && (
                <span className="font-medium text-[#9A3412] dark:text-orange-300">
                  {' '}
                  · prices may be stale
                </span>
              )}
            </span>
          )}
        </div>
        <HideNumbersToggle />
      </header>

      {summaryQ.isError && showError && (
        <ErrorNotification
          message={
            summaryQ.error instanceof Error
              ? summaryQ.error.message
              : 'Failed to load dashboard data'
          }
          onDismiss={() => setShowError(false)}
        />
      )}

      <Hero summary={summary} intraday={intradayQ.data} hidden={hidden} />

      <div className={ROW_280}>
        <BrokerCard brokers={brokersQ.data} isLoading={brokersQ.isLoading} hidden={hidden} />
        <PerformanceCard summary={summary} stocksRealizedYtd={stocksRealizedYtd} hidden={hidden} />
        <OptionsCard ytd={options} hidden={hidden} />
      </div>

      <div className={ROW_340}>
        <GrowthCard hidden={hidden} />
        <SectorCard holdings={holdingsQ.data} isLoading={holdingsQ.isLoading} />
      </div>

      <div className={ROW_340}>
        <MonthlyRealizedCard months={months} hidden={hidden} />
        <TickerRealizedCard tickers={tickers} hidden={hidden} />
      </div>
    </div>
  );
}
