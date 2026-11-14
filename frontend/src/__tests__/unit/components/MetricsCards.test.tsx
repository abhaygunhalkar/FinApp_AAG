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
  etf_unrealized_gain: 800,
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
  etf_unrealized_gain: 0,
  realized_gain: 0,
  daily_change: 0,
  annual_dividend_income: 0,
  cash_position: 0,
  number_of_holdings: 0,
  stale_data: false,
  last_successful_fetch: null,
};

describe('MetricsCards', () => {
  it('renders every metric card with its label', () => {
    render(<MetricsCards data={mockSummary} />);

    for (const label of [
      'Total Portfolio Value',
      'Total Invested',
      'Unrealized Gain/Loss',
      'ETF Unrealized Gain/Loss',
      'Realized Gain/Loss',
      'Daily Change',
      'Cash Position',
      'Number of Holdings',
    ]) {
      expect(screen.getByText(label)).toBeInTheDocument();
    }
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

  it('shows a gain with an up arrow in green, and a positive day on a green card', () => {
    render(<MetricsCards data={mockSummary} />);

    const unrealized = screen.getByText('↑ +$25,000.50');
    expect(unrealized.className).toContain('text-green-600');
    const daily = screen.getByText('+$1,250.75');
    expect(daily.parentElement?.className).toContain('from-green-500');
  });

  it('shows a loss with a down arrow in red, and a negative day on a red card', () => {
    render(<MetricsCards data={{ ...mockSummary, daily_change: -400 }} />);

    const realized = screen.getByText(/^↓ -\$3,500\.25$/);
    expect(realized.className).toContain('text-red-600');
    const daily = screen.getByText('-$400.00');
    expect(daily.parentElement?.className).toContain('from-red-500');
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
