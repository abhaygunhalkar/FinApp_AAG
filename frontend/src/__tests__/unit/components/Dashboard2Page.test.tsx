import { fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import Dashboard2 from '../../../pages/Dashboard2';
import { useUIStore } from '../../../store/uiStore';
import type { BrokerSummary, DashboardSummary, IntradaySeries } from '../../../types';

const Y = new Date().getFullYear();

const mocks = vi.hoisted(() => ({
  summary: undefined as DashboardSummary | undefined,
  brokers: [] as BrokerSummary[],
  sells: [] as { ticker: string; transaction_date: string; realized_gain: number }[],
  options: [] as unknown[],
  pnl: [] as { transaction_date: string; realized_gain: number }[],
  intraday: undefined as IntradaySeries | undefined,
  history: [] as { date: string; total_value: number }[],
  bench: { data: [] as unknown[], isLoading: false, isError: false },
  benchTicker: '',
}));

vi.mock('../../../hooks', () => ({
  useDashboardSummary: () => ({ data: mocks.summary, isLoading: !mocks.summary, isError: false }),
  useBrokerSummary: () => ({ data: mocks.brokers, isLoading: false }),
  usePortfolioHistory: () => ({ data: mocks.history, isLoading: false }),
  useMarketHistory: (ticker: string) => {
    mocks.benchTicker = ticker;
    return mocks.bench;
  },
  useIntraday: () => ({ data: mocks.intraday }),
  useHoldings: () => ({ data: [], isLoading: false }),
  useMonthlyRealizedGain: () => ({ data: mocks.sells }),
  useOptions: () => ({ data: mocks.options }),
  useOptionsMonthlyPnl: () => ({ data: mocks.pnl }),
}));

const summary = (o: Partial<DashboardSummary> = {}): DashboardSummary => ({
  total_portfolio_value: 121_801.64,
  total_invested: 107_757.25,
  unrealized_gain: 14_044.39,
  etf_unrealized_gain: 3_827.61,
  realized_gain: 99_999,
  daily_change: -88.05,
  annual_dividend_income: 0,
  cash_position: 12_480,
  number_of_holdings: 16,
  stale_data: false,
  last_successful_fetch: null,
  ...o,
});

const broker = (name: string, value: number, invested: number, count = 1): BrokerSummary => ({
  broker: name,
  market_value: value,
  total_invested: invested,
  unrealized_gain: value - invested,
  holding_count: count,
});

const renderPage = () =>
  render(
    <MemoryRouter>
      <Dashboard2 />
    </MemoryRouter>,
  );

beforeEach(() => {
  useUIStore.setState({ hideBalances: false });
  mocks.summary = summary();
  mocks.brokers = [broker('Schwab', 80_000, 70_000, 7), broker('Merrill', 41_801.64, 37_757.25, 4)];
  mocks.sells = [
    { ticker: 'INTC', transaction_date: `${Y}-06-10`, realized_gain: 700 },
    { ticker: 'NFLX', transaction_date: `${Y}-08-02`, realized_gain: -20 },
    { ticker: 'OLD', transaction_date: `${Y - 1}-05-01`, realized_gain: 5000 },
  ];
  mocks.options = [
    { trade_type: 'sell_put', premium: 2, contracts: 5, open_date: `${Y}-02-01` },
    { trade_type: 'buy_call', premium: 1, contracts: 2, open_date: `${Y}-03-01` },
  ];
  mocks.pnl = [{ transaction_date: `${Y}-04-01`, realized_gain: 150 }];
  mocks.intraday = undefined;
  mocks.history = [];
  mocks.bench = { data: [], isLoading: false, isError: false };
  mocks.benchTicker = '';
});

describe('Dashboard 2', () => {
  it('shows counts in the header and the hero with signed pills', () => {
    renderPage();
    expect(screen.getByText('16 holdings · 2 brokers')).toBeInTheDocument();
    const hero = screen.getByRole('region', { name: 'Portfolio value' });
    expect(within(hero).getByText('$121,801.64')).toBeInTheDocument();
    expect(hero).toHaveTextContent('▲$14,044.39 (13.0%) all time');
    expect(hero).toHaveTextContent('▼$88.05 (0.07%) today');
    // The total is holdings only; the info button says cash is left out.
    expect(
      within(hero).getByRole('button', { name: /Cash \(\$12,480\.00\) is not included/ }),
    ).toBeInTheDocument();
  });

  it('captions the hero trend Today, or Last trading day when the market is closed', () => {
    const points = [
      { time: `${Y}-10-24T09:30:00-04:00`, value: 100 },
      { time: `${Y}-10-24T15:55:00-04:00`, value: 101 },
    ];
    mocks.intraday = { session_date: `${Y}-10-24`, is_today: true, points };
    const { unmount } = renderPage();
    expect(screen.getByRole('region', { name: 'Portfolio value' })).toHaveTextContent('Today');
    unmount();
    mocks.intraday = { session_date: `${Y}-10-24`, is_today: false, points };
    renderPage();
    expect(screen.getByRole('region', { name: 'Portfolio value' })).toHaveTextContent(
      'Last trading day',
    );
  });

  it('compares with the S&P 500 by default and notes when its data is missing', () => {
    mocks.history = [
      { date: `${Y}-10-01`, total_value: 100 },
      { date: `${Y}-10-02`, total_value: 101 },
    ];
    mocks.bench = { data: [], isLoading: false, isError: true };
    renderPage();
    expect(screen.getByRole('button', { name: /vs S&P 500/ })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(mocks.benchTicker).toBe('VOO');
    expect(screen.getByText('S&P 500 data unavailable')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /vs S&P 500/ }));
    expect(screen.queryByText('S&P 500 data unavailable')).not.toBeInTheDocument();
  });

  it('lists brokers with share and return on cost', () => {
    renderPage();
    const card = screen.getByRole('region', { name: 'By broker' });
    expect(card).toHaveTextContent('Schwab66% · 7 holdings$80,000.00▲ $10,000.00 (14.3%)');
  });

  it('folds brokers past four into "+N more" and a grey Other segment', () => {
    mocks.brokers = ['A', 'B', 'C', 'D', 'E'].map((n, i) => broker(n, 500 - i * 50, 400 - i * 50));
    renderPage();
    const card = screen.getByRole('region', { name: 'By broker' });
    expect(within(card).queryByText('D')).not.toBeInTheDocument();
    expect(within(card).getByRole('img').getAttribute('aria-label')).toContain('Other');
    fireEvent.click(within(card).getByRole('button', { name: /\+2 more/ }));
    expect(within(card).getByText('D')).toBeInTheDocument();
    expect(within(card).getByText('E')).toBeInTheDocument();
  });

  it('shows this year’s stock realized gain, not the all-time total', () => {
    renderPage();
    const card = screen.getByRole('region', { name: 'Performance' });
    expect(card).toHaveTextContent('Realized gain · stocks YTD+$680.00');
    expect(card).not.toHaveTextContent('99,999');
  });

  it('summarises options for the year', () => {
    renderPage();
    const card = screen.getByRole('region', { name: 'Options' });
    expect(card).toHaveTextContent('Premium collected+$1,000.00');
    expect(card).toHaveTextContent('Premium paid−$200.00');
    expect(card).toHaveTextContent('Net premium+$800.00');
    expect(card).toHaveTextContent('Options realized P&L+$150.00');
    expect(card).toHaveTextContent('80% of premium collected kept');
  });

  it('lists realized gain by ticker with losses last and signed', () => {
    renderPage();
    const card = screen.getByRole('region', { name: 'Realized gain by ticker' });
    const rows = within(card).getAllByRole('listitem');
    expect(rows[0]).toHaveTextContent('INTC+$700');
    expect(rows[1]).toHaveTextContent('NFLX−$20');
  });

  it('shows empty states instead of broken charts', () => {
    mocks.brokers = [];
    mocks.sells = [];
    mocks.options = [];
    mocks.pnl = [];
    renderPage();
    expect(screen.getByText(/No holdings yet/)).toBeInTheDocument();
    expect(screen.getByText('No options trades this year yet.')).toBeInTheDocument();
    expect(screen.getByText('No realized gains yet this year.')).toBeInTheDocument();
    expect(screen.getByText('No stock sales this year yet.')).toBeInTheDocument();
  });

  it('masks every amount when numbers are hidden', () => {
    useUIStore.setState({ hideBalances: true });
    renderPage();
    expect(screen.queryByText('$121,801.64')).not.toBeInTheDocument();
    expect(screen.queryByText(/\$80,000/)).not.toBeInTheDocument();
    expect(screen.getAllByText(/••••••/).length).toBeGreaterThan(5);
  });
});
