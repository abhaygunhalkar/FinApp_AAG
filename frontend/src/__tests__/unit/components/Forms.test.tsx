import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen } from '@testing-library/react';
import type { ReactElement } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import HoldingForm from '../../../components/holdings/HoldingForm';
import OptionsLogForm from '../../../components/options/OptionsLogForm';
import type { OptionsTrade } from '../../../types';

const get = vi.hoisted(() => vi.fn());
vi.mock('../../../api/client', async (importOriginal) => {
  const real = await importOriginal<typeof import('../../../api/client')>();
  return { ...real, default: { ...real.default, get } };
});

function renderWithClient(ui: ReactElement) {
  return render(<QueryClientProvider client={new QueryClient()}>{ui}</QueryClientProvider>);
}

beforeEach(() => {
  get.mockReset().mockImplementation(async (url: string) => {
    if (url === '/api/market/brokers') {
      return { data: { success: true, data: ['Schwab'], error: null } };
    }
    return {
      data: {
        success: true,
        data: { ticker: 'AAPL', company_name: 'Apple Inc.', sector: 'Technology' },
        error: null,
      },
    };
  });
});

describe('HoldingForm', () => {
  it('looks up the company for a ticker and forgets it when the ticker is cleared', async () => {
    renderWithClient(<HoldingForm onClose={() => {}} />);
    const ticker = screen.getByLabelText(/Ticker/);

    fireEvent.change(ticker, { target: { value: 'aapl' } });
    expect(ticker).toHaveValue('AAPL');
    expect(await screen.findByText('Apple Inc.', {}, { timeout: 2000 })).toBeInTheDocument();
    expect(get).toHaveBeenCalledWith('/api/market/info/AAPL');

    fireEvent.change(ticker, { target: { value: '' } });
    expect(screen.queryByText('Apple Inc.')).not.toBeInTheDocument();
    expect(screen.queryByText('Company info loaded')).not.toBeInTheDocument();
  });
});

describe('OptionsLogForm', () => {
  const trade: OptionsTrade = {
    id: 7,
    ticker: 'MSFT',
    trade_type: 'buy_call',
    strike_price: 420,
    premium: 3.5,
    contracts: 2,
    open_date: '2026-11-01',
    expiry_date: '2026-12-19',
    status: 'open',
    close_price: null,
    notes: null,
    broker: 'Schwab',
    created_at: '2026-11-01T00:00:00Z',
    updated_at: '2026-11-01T00:00:00Z',
    pnl: null,
  };

  it('starts from the trade being edited', () => {
    renderWithClient(<OptionsLogForm editing={trade} onClose={() => {}} />);
    expect(screen.getByLabelText(/Ticker/)).toHaveValue('MSFT');
    expect(screen.getByLabelText(/Strategy/)).toHaveValue('buy_call');
    expect(screen.getByLabelText(/Strike/)).toHaveValue(420);
  });

  it('starts empty for a new trade', () => {
    renderWithClient(<OptionsLogForm onClose={() => {}} />);
    expect(screen.getByLabelText(/Ticker/)).toHaveValue('');
    expect(screen.getByLabelText(/Strategy/)).toHaveValue('sell_put');
  });
});
