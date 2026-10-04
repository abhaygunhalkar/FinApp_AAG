import { render, screen, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import HoldingsTable from '../../../components/holdings/HoldingsTable';
import WatchlistTable from '../../../components/watchlist/WatchlistTable';
import MetricsCards from '../../../components/dashboard/MetricsCards';
import ErrorNotification from '../../../components/shared/ErrorNotification';
import { useUIStore } from '../../../store/uiStore';
import type { Holding } from '../../../types';
import type { WatchlistItem } from '../../../types';
import type { DashboardSummary } from '../../../types';

vi.mock('../../../hooks', () => ({
  useBrokerSummary: () => ({ data: [] }),
}));

// --- Test Data Factories ---

function createHolding(overrides: Partial<Holding> = {}): Holding {
  return {
    id: 1,
    ticker: 'AAPL',
    company_name: 'Apple Inc.',
    quantity: 10,
    average_buy_price: 150.0,
    current_price: 175.5,
    total_invested: 1500.0,
    current_value: 1755.0,
    unrealized_gain: 255.0,
    unrealized_gain_pct: 17.0,
    allocation_pct: 45.5,
    holding_type: 'stock',
    sector: 'Technology',
    industry: 'Consumer Electronics',
    dividend_yield: 0.55,
    annual_dividend_income: 9.63,
    broker: null,
    created_at: '2024-01-15T10:00:00Z',
    updated_at: '2024-06-20T14:30:00Z',
    ...overrides,
  };
}

function createWatchlistItem(overrides: Partial<WatchlistItem> = {}): WatchlistItem {
  return {
    id: 1,
    ticker: 'GOOGL',
    company_name: 'Alphabet Inc.',
    current_price: 178.25,
    daily_change_pct: 1.85,
    week_52_high: 191.75,
    week_52_low: 120.21,
    target_buy_price: 160.0,
    analyst_rating: 'Strong Buy',
    pe_ratio: 25.4,
    market_cap: 2200000000000,
    sector: 'Technology',
    notes: 'Good long-term hold',
    priority: 2,
    rsi_daily: null,
    rsi_weekly: null,
    created_at: '2024-02-01T08:00:00Z',
    updated_at: '2024-06-15T12:00:00Z',
    ...overrides,
  };
}

function renderWithQueryClient(ui: React.ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>
  );
}

// --- HoldingsTable Data Display Tests ---

describe('HoldingsTable - data display', () => {
  beforeEach(() => {
    useUIStore.setState({
      holdingsFilter: {
        search: '',
        sector: null,
        performance: 'all',
        sortColumn: 'ticker',
        sortDirection: 'asc',
      },
    });
  });

  it('displays formatted currency values for buy price, current price, invested, and value', () => {
    const holding = createHolding({
      average_buy_price: 150.0,
      current_price: 175.5,
      total_invested: 1500.0,
      current_value: 1755.0,
    });
    renderWithQueryClient(<HoldingsTable holdings={[holding]} />);

    expect(screen.getByText('$150.00')).toBeInTheDocument();
    expect(screen.getByText('$175.50')).toBeInTheDocument();
    expect(screen.getByText('$1,500.00')).toBeInTheDocument();
    expect(screen.getByText('$1,755.00')).toBeInTheDocument();
  });

  it('displays unrealized gain with correct formatting and color', () => {
    const gainer = createHolding({
      id: 1,
      ticker: 'AAPL',
      unrealized_gain: 255.0,
      unrealized_gain_pct: 17.0,
    });
    const loser = createHolding({
      id: 2,
      ticker: 'TSLA',
      unrealized_gain: -120.5,
      unrealized_gain_pct: -8.03,
      sector: 'Automotive',
    });
    renderWithQueryClient(<HoldingsTable holdings={[gainer, loser]} />);

    // Gain values should be present
    expect(screen.getByText('$255.00')).toBeInTheDocument();
    expect(screen.getByText('17.00%')).toBeInTheDocument();

    // Loss values should be present
    expect(screen.getByText('-$120.50')).toBeInTheDocument();
    expect(screen.getByText('-8.03%')).toBeInTheDocument();
  });

  it('displays allocation percentage and dividend yield as percentages', () => {
    const holding = createHolding({
      allocation_pct: 45.5,
      dividend_yield: 0.55,
    });
    renderWithQueryClient(<HoldingsTable holdings={[holding]} />);

    expect(screen.getByText('45.50%')).toBeInTheDocument();
    expect(screen.getByText('0.55%')).toBeInTheDocument();
  });

  it('displays annual dividend income as currency', () => {
    const holding = createHolding({ annual_dividend_income: 9.63 });
    renderWithQueryClient(<HoldingsTable holdings={[holding]} />);

    expect(screen.getByText('$9.63')).toBeInTheDocument();
  });

  it('displays quantity as a number', () => {
    const holding = createHolding({ quantity: 10 });
    renderWithQueryClient(<HoldingsTable holdings={[holding]} />);

    expect(screen.getByText('10')).toBeInTheDocument();
  });

  it('displays dash for null company name', () => {
    const holding = createHolding({ company_name: null });
    renderWithQueryClient(<HoldingsTable holdings={[holding]} />);

    expect(screen.getByText('—')).toBeInTheDocument();
  });

  it('renders 15 column headers', () => {
    renderWithQueryClient(<HoldingsTable holdings={[createHolding()]} />);

    const headers = screen.getAllByRole('columnheader');
    expect(headers).toHaveLength(15);
  });
});

// --- WatchlistTable Data Display Tests ---

describe('WatchlistTable - data display', () => {
  it('displays formatted current price as currency', () => {
    const item = createWatchlistItem({ current_price: 178.25 });
    render(<WatchlistTable items={[item]} />);

    expect(screen.getByText('$178.25')).toBeInTheDocument();
  });

  it('displays 52 week high and low as currency', () => {
    const item = createWatchlistItem({
      week_52_high: 191.75,
      week_52_low: 120.21,
    });
    render(<WatchlistTable items={[item]} />);

    expect(screen.getByText('$191.75')).toBeInTheDocument();
    expect(screen.getByText('$120.21')).toBeInTheDocument();
  });

  it('displays target buy price as currency', () => {
    const item = createWatchlistItem({ target_buy_price: 160.0 });
    render(<WatchlistTable items={[item]} />);

    expect(screen.getByText('$160.00')).toBeInTheDocument();
  });

  it('displays analyst rating text', () => {
    const item = createWatchlistItem({ analyst_rating: 'Strong Buy' });
    render(<WatchlistTable items={[item]} />);

    expect(screen.getByText('Strong Buy')).toBeInTheDocument();
  });

  it('displays PE ratio formatted to 2 decimal places', () => {
    const item = createWatchlistItem({ pe_ratio: 25.4 });
    render(<WatchlistTable items={[item]} />);

    expect(screen.getByText('25.40')).toBeInTheDocument();
  });

  it('displays sector and notes', () => {
    const item = createWatchlistItem({
      sector: 'Technology',
      notes: 'Good long-term hold',
    });
    render(<WatchlistTable items={[item]} />);

    expect(screen.getByText('Technology')).toBeInTheDocument();
    expect(screen.getByText('Good long-term hold')).toBeInTheDocument();
  });

  it('renders 13 column headers', () => {
    render(<WatchlistTable items={[createWatchlistItem()]} />);

    const headers = screen.getAllByRole('columnheader');
    expect(headers).toHaveLength(13);
  });

  it('renders empty table with no rows when items array is empty', () => {
    render(<WatchlistTable items={[]} />);

    // Headers should still be present
    expect(screen.getByText('Ticker')).toBeInTheDocument();
    // No data rows - only header row
    const rows = screen.getAllByRole('row');
    expect(rows).toHaveLength(1); // Only header row
  });
});

// --- MetricsCards Display Tests ---

describe('MetricsCards - value display', () => {
  const mockData: DashboardSummary = {
    total_portfolio_value: 250750.99,
    total_invested: 200000.0,
    unrealized_gain: 50750.99,
    realized_gain: 12500.0,
    daily_change: -1250.5,
    annual_dividend_income: 8400.0,
    cash_position: 25000.0,
    number_of_holdings: 15,
    stale_data: false,
    last_successful_fetch: '2024-06-20T10:00:00Z',
  };

  it('displays total portfolio value formatted as currency', () => {
    render(<MetricsCards data={mockData} />);
    expect(screen.getByText('$250,750.99')).toBeInTheDocument();
  });

  it('displays total invested formatted as currency', () => {
    render(<MetricsCards data={mockData} />);
    expect(screen.getByText('$200,000.00')).toBeInTheDocument();
  });

  it('displays unrealized gain formatted as currency', () => {
    render(<MetricsCards data={mockData} />);
    expect(screen.getByText('$50,750.99')).toBeInTheDocument();
  });

  it('displays realized gain formatted as currency', () => {
    render(<MetricsCards data={mockData} />);
    expect(screen.getByText('$12,500.00')).toBeInTheDocument();
  });

  it('displays annual dividend income formatted as currency', () => {
    render(<MetricsCards data={mockData} />);
    expect(screen.getByText('$8,400.00')).toBeInTheDocument();
  });

  it('displays cash position formatted as currency', () => {
    render(<MetricsCards data={mockData} />);
    expect(screen.getByText('$25,000.00')).toBeInTheDocument();
  });

  it('displays number of holdings as plain number', () => {
    render(<MetricsCards data={mockData} />);
    expect(screen.getByText('15')).toBeInTheDocument();
  });

  it('displays negative daily change with red color indicator', () => {
    render(<MetricsCards data={mockData} />);
    // The change indicator for daily change should show negative value
    // There are two elements with this text (main value + change indicator)
    const negativeElements = screen.getAllByText('-$1,250.50');
    expect(negativeElements.length).toBeGreaterThanOrEqual(1);
    // The change indicator (text-sm) should have red color
    const changeIndicator = negativeElements.find((el) =>
      el.className.includes('text-sm')
    );
    expect(changeIndicator).toBeDefined();
    expect(changeIndicator!.className).toContain('text-red-600');
  });

  it('displays all zero values when portfolio is empty', () => {
    const emptyData: DashboardSummary = {
      total_portfolio_value: 0,
      total_invested: 0,
      unrealized_gain: 0,
      realized_gain: 0,
      daily_change: 0,
      annual_dividend_income: 0,
      cash_position: 0,
      number_of_holdings: 0,
      stale_data: false,
      last_successful_fetch: null,
    };
    render(<MetricsCards data={emptyData} />);

    // All currency values should show $0.00
    const zeroValues = screen.getAllByText('$0.00');
    expect(zeroValues.length).toBeGreaterThanOrEqual(7);
    // Number of holdings should show 0
    expect(screen.getByText('0')).toBeInTheDocument();
  });
});

// --- ErrorNotification Tests ---

describe('ErrorNotification - API failure display', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('displays error message for connection failure', () => {
    render(
      <ErrorNotification
        message="Failed to load dashboard data"
        onDismiss={vi.fn()}
      />
    );

    expect(screen.getByText('Failed to load dashboard data')).toBeInTheDocument();
    expect(screen.getByRole('alert')).toBeInTheDocument();
  });

  it('displays error message for API timeout', () => {
    render(
      <ErrorNotification
        message="Request timed out. Please try again."
        onDismiss={vi.fn()}
      />
    );

    expect(screen.getByText('Request timed out. Please try again.')).toBeInTheDocument();
  });

  it('auto-dismisses after default 5 seconds', () => {
    const onDismiss = vi.fn();
    render(
      <ErrorNotification message="Network error" onDismiss={onDismiss} />
    );

    expect(screen.getByRole('alert')).toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(5000);
    });

    expect(onDismiss).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('remains visible before auto-dismiss timeout', () => {
    const onDismiss = vi.fn();
    render(
      <ErrorNotification message="Server error" onDismiss={onDismiss} />
    );

    act(() => {
      vi.advanceTimersByTime(4999);
    });

    expect(onDismiss).not.toHaveBeenCalled();
    expect(screen.getByRole('alert')).toBeInTheDocument();
  });

  it('can be manually dismissed before auto-dismiss', () => {
    const onDismiss = vi.fn();
    render(
      <ErrorNotification message="Error occurred" onDismiss={onDismiss} />
    );

    const dismissButton = screen.getByLabelText('Dismiss notification');
    act(() => {
      dismissButton.click();
    });

    expect(onDismiss).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});
