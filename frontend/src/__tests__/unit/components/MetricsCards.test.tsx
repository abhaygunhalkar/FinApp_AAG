import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import MetricsCards from '../../../components/dashboard/MetricsCards';
import type { DashboardSummary, BrokerSummary } from '../../../types';

const mockUseBrokerSummary = vi.fn();
vi.mock('../../../hooks', () => ({
  useBrokerSummary: () => mockUseBrokerSummary(),
}));

beforeEach(() => {
  mockUseBrokerSummary.mockReturnValue({ data: [] });
});

const mockSummary: DashboardSummary = {
  total_portfolio_value: 125000.5,
  total_invested: 100000,
  unrealized_gain: 25000.5,
  realized_gain: -3500.25,
  daily_change: 1250.75,
  annual_dividend_income: 4200,
  cash_position: 15000,
  number_of_holdings: 12,
  stale_data: false,
  last_successful_fetch: '2024-01-15T10:30:00Z',
};

const emptySummary: DashboardSummary = {
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

describe('MetricsCards', () => {
  it('renders all 8 metric cards with correct labels', () => {
    render(<MetricsCards data={mockSummary} />);

    expect(screen.getByText('Total Portfolio Value')).toBeInTheDocument();
    expect(screen.getByText('Total Invested')).toBeInTheDocument();
    expect(screen.getByText('Unrealized Gain/Loss')).toBeInTheDocument();
    expect(screen.getByText('Realized Gain/Loss')).toBeInTheDocument();
    expect(screen.getByText('Daily Change')).toBeInTheDocument();
    expect(screen.getByText('Annual Dividend Income')).toBeInTheDocument();
    expect(screen.getByText('Cash Position')).toBeInTheDocument();
    expect(screen.getByText('Number of Holdings')).toBeInTheDocument();
  });

  it('formats currency values correctly', () => {
    render(<MetricsCards data={mockSummary} />);

    expect(screen.getByText('$125,000.50')).toBeInTheDocument();
    expect(screen.getByText('$100,000.00')).toBeInTheDocument();
    expect(screen.getByText('$15,000.00')).toBeInTheDocument();
  });

  it('formats number of holdings as plain number', () => {
    render(<MetricsCards data={mockSummary} />);

    expect(screen.getByText('12')).toBeInTheDocument();
  });

  it('shows positive gain values with green color', () => {
    render(<MetricsCards data={mockSummary} />);

    const positiveChanges = screen.getAllByText(/^\+\$/);
    expect(positiveChanges.length).toBeGreaterThan(0);
    positiveChanges.forEach((el) => {
      expect(el.className).toContain('text-green-600');
    });
  });

  it('shows negative gain values with red color', () => {
    render(<MetricsCards data={mockSummary} />);

    // The change indicator for negative values should have red text
    const negativeChangeIndicators = screen.getAllByText(/^-\$/).filter(
      (el) => el.className.includes('text-sm')
    );
    expect(negativeChangeIndicators.length).toBeGreaterThan(0);
    negativeChangeIndicators.forEach((el) => {
      expect(el.className).toContain('text-red-600');
    });
  });

  it('shows empty state with all zeros when no holdings exist', () => {
    render(<MetricsCards data={emptySummary} />);

    // All currency metrics show $0.00 (main values + change indicators)
    const zeroValues = screen.getAllByText('$0.00');
    expect(zeroValues.length).toBeGreaterThanOrEqual(7);
    expect(screen.getByText('0')).toBeInTheDocument(); // number of holdings
  });

  it('does not show stale data indicator when stale_data is false', () => {
    render(<MetricsCards data={mockSummary} />);

    expect(screen.queryByText(/Market data may be stale/)).not.toBeInTheDocument();
  });

  it('shows stale data indicator when stale_data is true', () => {
    const staleData: DashboardSummary = {
      ...mockSummary,
      stale_data: true,
    };
    render(<MetricsCards data={staleData} />);

    expect(screen.getByText(/Market data may be stale/)).toBeInTheDocument();
  });

  it('shows last successful fetch time in stale data indicator', () => {
    const staleData: DashboardSummary = {
      ...mockSummary,
      stale_data: true,
      last_successful_fetch: '2024-01-15T10:30:00Z',
    };
    render(<MetricsCards data={staleData} />);

    expect(screen.getByText(/Last updated:/)).toBeInTheDocument();
  });

  it('shows "Never" when last_successful_fetch is null and data is stale', () => {
    const staleData: DashboardSummary = {
      ...mockSummary,
      stale_data: true,
      last_successful_fetch: null,
    };
    render(<MetricsCards data={staleData} />);

    expect(screen.getByText(/Never/)).toBeInTheDocument();
  });

  it('places broker tiles between Total Portfolio Value and Total Invested', () => {
    const brokers: BrokerSummary[] = [
      {
        broker: 'Schwab',
        market_value: 104257.25,
        total_invested: 107121.5,
        unrealized_gain: -2864.25,
        holding_count: 9,
      },
      {
        broker: 'Robinhood',
        market_value: 99938.84,
        total_invested: 146920.95,
        unrealized_gain: -46982.11,
        holding_count: 18,
      },
    ];
    mockUseBrokerSummary.mockReturnValue({ data: brokers });

    render(<MetricsCards data={mockSummary} />);

    const labels = screen
      .getAllByText(/Total Portfolio Value|Total Invested|Schwab|Robinhood/)
      .map((el) => el.textContent);
    expect(labels).toEqual(['Total Portfolio Value', 'Schwab', 'Robinhood', 'Total Invested']);
  });
});
