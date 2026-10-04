import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import BrokerTiles from '../../../components/dashboard/BrokerTiles';
import type { BrokerSummary } from '../../../types';

const mockUseBrokerSummary = vi.fn();
vi.mock('../../../hooks', () => ({
  useBrokerSummary: () => mockUseBrokerSummary(),
}));

const mockBrokers: BrokerSummary[] = [
  {
    broker: 'Robinhood',
    market_value: 12724.7,
    total_invested: 11880.0,
    unrealized_gain: 844.7,
    holding_count: 3,
  },
  {
    broker: 'Schwab',
    market_value: 8400.0,
    total_invested: 9000.0,
    unrealized_gain: -600.0,
    holding_count: 1,
  },
];

describe('BrokerTiles', () => {
  it('renders a tile per broker with market value and gain', () => {
    mockUseBrokerSummary.mockReturnValue({ data: mockBrokers });
    render(<BrokerTiles />);

    expect(screen.getByText('Robinhood')).toBeInTheDocument();
    expect(screen.getByText('$12,724.70')).toBeInTheDocument();
    expect(screen.getByText('+$844.70')).toBeInTheDocument();
    expect(screen.getByText('3 holdings')).toBeInTheDocument();

    expect(screen.getByText('Schwab')).toBeInTheDocument();
    expect(screen.getByText('$8,400.00')).toBeInTheDocument();
    expect(screen.getByText('-$600.00')).toBeInTheDocument();
    expect(screen.getByText('1 holding')).toBeInTheDocument();
  });

  it('renders nothing when there are no brokers', () => {
    mockUseBrokerSummary.mockReturnValue({ data: [] });
    const { container } = render(<BrokerTiles />);

    expect(container).toBeEmptyDOMElement();
  });

  it('renders nothing while data has not loaded yet', () => {
    mockUseBrokerSummary.mockReturnValue({ data: undefined });
    const { container } = render(<BrokerTiles />);

    expect(container).toBeEmptyDOMElement();
  });
});
