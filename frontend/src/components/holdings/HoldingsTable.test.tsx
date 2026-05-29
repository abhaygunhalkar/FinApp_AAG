import { render, screen, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { describe, it, expect, beforeEach } from 'vitest';
import HoldingsTable from './HoldingsTable';
import { useUIStore } from '../../store/uiStore';
import type { Holding } from '../../types';

function createHolding(overrides: Partial<Holding> = {}): Holding {
  return {
    id: 1,
    ticker: 'AAPL',
    company_name: 'Apple Inc.',
    quantity: 10,
    average_buy_price: 150,
    current_price: 175,
    total_invested: 1500,
    current_value: 1750,
    daily_change: 0,
    daily_change_pct: 0,
    unrealized_gain: 250,
    unrealized_gain_pct: 16.67,
    allocation_pct: 50,
    sector: 'Technology',
    industry: 'Consumer Electronics',
    dividend_yield: 0.5,
    annual_dividend_income: 8.75,
    created_at: '2024-01-01T00:00:00Z',
    updated_at: '2024-06-01T00:00:00Z',
    ...overrides,
  };
}

const mockHoldings: Holding[] = [
  createHolding({ id: 1, ticker: 'AAPL', company_name: 'Apple Inc.', sector: 'Technology', unrealized_gain: 250, unrealized_gain_pct: 16.67 }),
  createHolding({ id: 2, ticker: 'MSFT', company_name: 'Microsoft Corp', sector: 'Technology', unrealized_gain: 100, unrealized_gain_pct: 10, allocation_pct: 30 }),
  createHolding({ id: 3, ticker: 'JPM', company_name: 'JPMorgan Chase', sector: 'Financials', unrealized_gain: -50, unrealized_gain_pct: -5, allocation_pct: 20 }),
];

function renderWithProviders(ui: React.ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>
  );
}

describe('HoldingsTable', () => {
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

  it('renders all holdings rows', () => {
    renderWithProviders(<HoldingsTable holdings={mockHoldings} />);
    expect(screen.getByText('AAPL')).toBeInTheDocument();
    expect(screen.getByText('MSFT')).toBeInTheDocument();
    expect(screen.getByText('JPM')).toBeInTheDocument();
  });

  it('renders all column headers', () => {
    renderWithProviders(<HoldingsTable holdings={mockHoldings} />);
    expect(screen.getByText(/^Ticker/)).toBeInTheDocument();
    expect(screen.getByText(/^Company Name/)).toBeInTheDocument();
    expect(screen.getByText(/^Quantity/)).toBeInTheDocument();
    expect(screen.getByText(/^Avg Buy Price/)).toBeInTheDocument();
    expect(screen.getByText(/^Current Price/)).toBeInTheDocument();
    expect(screen.getByText(/^Day Change$/)).toBeInTheDocument();
    expect(screen.getByText(/^Day Change %$/)).toBeInTheDocument();
    expect(screen.getByText(/^Total Invested/)).toBeInTheDocument();
    expect(screen.getByText(/^Current Value/)).toBeInTheDocument();
    expect(screen.getByText(/^Gain\/Loss/)).toBeInTheDocument();
    expect(screen.getByText(/^Gain %/)).toBeInTheDocument();
    expect(screen.getByText(/^Sector/)).toBeInTheDocument();
    expect(screen.getByText(/^Broker/)).toBeInTheDocument();
    expect(screen.getByText(/^Allocation %/)).toBeInTheDocument();
    expect(screen.getByText(/^Last Updated/)).toBeInTheDocument();
  });

  it('filters by search text (case-insensitive partial match on ticker)', () => {
    useUIStore.setState({
      holdingsFilter: {
        search: 'aapl',
        sector: null,
        performance: 'all',
        sortColumn: 'ticker',
        sortDirection: 'asc',
      },
    });
    renderWithProviders(<HoldingsTable holdings={mockHoldings} />);
    expect(screen.getByText('AAPL')).toBeInTheDocument();
    expect(screen.queryByText('MSFT')).not.toBeInTheDocument();
    expect(screen.queryByText('JPM')).not.toBeInTheDocument();
  });

  it('filters by search text (partial match on company name)', () => {
    useUIStore.setState({
      holdingsFilter: {
        search: 'micro',
        sector: null,
        performance: 'all',
        sortColumn: 'ticker',
        sortDirection: 'asc',
      },
    });
    renderWithProviders(<HoldingsTable holdings={mockHoldings} />);
    expect(screen.getByText('MSFT')).toBeInTheDocument();
    expect(screen.queryByText('AAPL')).not.toBeInTheDocument();
  });

  it('filters by sector', () => {
    useUIStore.setState({
      holdingsFilter: {
        search: '',
        sector: 'Financials',
        performance: 'all',
        sortColumn: 'ticker',
        sortDirection: 'asc',
      },
    });
    renderWithProviders(<HoldingsTable holdings={mockHoldings} />);
    expect(screen.getByText('JPM')).toBeInTheDocument();
    expect(screen.queryByText('AAPL')).not.toBeInTheDocument();
    expect(screen.queryByText('MSFT')).not.toBeInTheDocument();
  });

  it('filters by performance - gainers', () => {
    useUIStore.setState({
      holdingsFilter: {
        search: '',
        sector: null,
        performance: 'gainers',
        sortColumn: 'ticker',
        sortDirection: 'asc',
      },
    });
    renderWithProviders(<HoldingsTable holdings={mockHoldings} />);
    expect(screen.getByText('AAPL')).toBeInTheDocument();
    expect(screen.getByText('MSFT')).toBeInTheDocument();
    expect(screen.queryByText('JPM')).not.toBeInTheDocument();
  });

  it('filters by performance - losers', () => {
    useUIStore.setState({
      holdingsFilter: {
        search: '',
        sector: null,
        performance: 'losers',
        sortColumn: 'ticker',
        sortDirection: 'asc',
      },
    });
    renderWithProviders(<HoldingsTable holdings={mockHoldings} />);
    expect(screen.getByText('JPM')).toBeInTheDocument();
    expect(screen.queryByText('AAPL')).not.toBeInTheDocument();
    expect(screen.queryByText('MSFT')).not.toBeInTheDocument();
  });

  it('shows empty state when no holdings match filters', () => {
    useUIStore.setState({
      holdingsFilter: {
        search: 'xyz',
        sector: null,
        performance: 'all',
        sortColumn: 'ticker',
        sortDirection: 'asc',
      },
    });
    renderWithProviders(<HoldingsTable holdings={mockHoldings} />);
    expect(screen.getByText('No holdings match your filters')).toBeInTheDocument();
  });

  it('shows empty state when holdings array is empty', () => {
    renderWithProviders(<HoldingsTable holdings={[]} />);
    expect(screen.getByText('No holdings yet')).toBeInTheDocument();
  });

  it('sorts by column when header is clicked', () => {
    renderWithProviders(<HoldingsTable holdings={mockHoldings} />);
    const tickerHeader = screen.getByText(/^Ticker/);
    // Default is asc for ticker
    fireEvent.click(tickerHeader);
    // Should toggle to desc
    const state = useUIStore.getState();
    expect(state.holdingsFilter.sortColumn).toBe('ticker');
    expect(state.holdingsFilter.sortDirection).toBe('desc');
  });

  it('sets default descending direction for numeric columns', () => {
    renderWithProviders(<HoldingsTable holdings={mockHoldings} />);
    const gainHeader = screen.getByText(/^Gain\/Loss/);
    fireEvent.click(gainHeader);
    const state = useUIStore.getState();
    expect(state.holdingsFilter.sortColumn).toBe('unrealized_gain');
    expect(state.holdingsFilter.sortDirection).toBe('desc');
  });
});
