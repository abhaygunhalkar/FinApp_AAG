import { fireEvent, render, screen, within } from '@testing-library/react';
import { AxiosError, type AxiosResponse } from 'axios';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import TransactionHistory from './TransactionHistory';
import { fillLots, openLots } from './lots';
import type { Transaction } from '../../types';

const buy = (id: number, date: string, quantity: number, price: number, left: number) =>
  ({
    id,
    holding_id: 7,
    ticker: 'NVDA',
    transaction_type: 'buy',
    quantity,
    price,
    fees: 0,
    transaction_date: date,
    notes: null,
    broker: 'Merrill',
    created_at: `${date}T10:00:00Z`,
    remaining_quantity: left,
  }) as Transaction;

const mocks = vi.hoisted(() => ({
  transactions: [] as Transaction[],
  create: vi.fn(),
  remove: vi.fn(),
}));

vi.mock('../../hooks/useTransactions', () => ({
  useTransactions: () => ({ data: mocks.transactions, isLoading: false }),
  useCreateTransaction: () => ({ mutate: mocks.create, isPending: false, isError: false }),
  useDeleteTransaction: () => ({ mutate: mocks.remove, isPending: false, isError: false }),
}));

beforeEach(() => {
  vi.clearAllMocks();
  mocks.transactions = [
    buy(4, '2025-04-01', 5, 160, 5),
    buy(3, '2025-03-01', 5, 180, 2),
    buy(2, '2025-02-01', 5, 120, 0),
    buy(1, '2025-01-01', 5, 150, 5),
    {
      ...buy(9, '2025-05-01', 3, 200, 0),
      transaction_type: 'sell',
      remaining_quantity: null,
      lots: [{ buy_transaction_id: 3, quantity: 3, price: 180, transaction_date: '2025-03-01' }],
    },
  ];
});

const renderIt = () => render(<TransactionHistory holdingId={7} ticker="NVDA" broker="Merrill" />);

describe('lot helpers', () => {
  it('lists lots with shares left, oldest first, up to the sale date', () => {
    expect(openLots(mocks.transactions).map((l) => l.id)).toEqual([1, 3, 4]);
    expect(openLots(mocks.transactions, '2025-03-15').map((l) => l.id)).toEqual([1, 3]);
  });

  it('fills oldest first or highest cost first', () => {
    const lots = openLots(mocks.transactions);
    expect(fillLots(lots, 6, 'oldest')).toEqual([
      { buy_transaction_id: 1, quantity: 5 },
      { buy_transaction_id: 3, quantity: 1 },
    ]);
    expect(fillLots(lots, 6, 'highest')).toEqual([
      { buy_transaction_id: 3, quantity: 2 },
      { buy_transaction_id: 4, quantity: 4 },
    ]);
  });
});

describe('TransactionHistory lots', () => {
  it('shows what is left of each lot and which lots a sell used', () => {
    renderIt();
    expect(screen.getByText('· Merrill')).toBeInTheDocument();
    expect(screen.getAllByText('All open')).toHaveLength(2);
    expect(screen.getByText('2 of 5 left')).toBeInTheDocument();
    expect(screen.getByText('Sold')).toBeInTheDocument();
    expect(screen.getByText('3 from Mar 1, 2025 @ $180.00')).toBeInTheDocument();
    // Only lots with shares left can be sold.
    expect(screen.getAllByRole('button', { name: /^Sell from the lot/ })).toHaveLength(3);
  });

  it('sells part of one chosen lot from its row', () => {
    renderIt();
    fireEvent.click(screen.getByRole('button', { name: 'Sell from the lot bought Mar 1, 2025' }));

    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByRole('button', { name: 'Choose lots' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    const lotInput = within(dialog).getByLabelText(
      'Shares to sell from the lot bought Mar 1, 2025',
    );
    expect(lotInput).toHaveValue(2);
    fireEvent.change(lotInput, { target: { value: '1' } });
    fireEvent.change(within(dialog).getByLabelText('Transaction Date'), {
      target: { value: '2025-06-01' },
    });
    fireEvent.change(within(dialog).getByLabelText('Price per Share'), {
      target: { value: '200' },
    });
    expect(dialog).toHaveTextContent('Est. realized gain on these lots: +$20.00');
    fireEvent.click(within(dialog).getByText('Save Transaction'));

    expect(mocks.create).toHaveBeenCalledWith(
      expect.objectContaining({
        holding_id: 7,
        transaction_type: 'sell',
        quantity: 1,
        lots: [{ buy_transaction_id: 3, quantity: 1 }],
      }),
      expect.any(Object),
    );
  });

  it('spreads a sell over the highest-cost lots', () => {
    renderIt();
    fireEvent.click(screen.getByText('Record Transaction'));
    const dialog = screen.getByRole('dialog');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Sell' }));
    fireEvent.change(within(dialog).getByLabelText('Transaction Date'), {
      target: { value: '2025-06-01' },
    });
    fireEvent.change(within(dialog).getByLabelText('Quantity'), { target: { value: '4' } });
    fireEvent.change(within(dialog).getByLabelText('Price per Share'), {
      target: { value: '200' },
    });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Highest cost' }));
    fireEvent.click(within(dialog).getByText('Save Transaction'));

    expect(mocks.create).toHaveBeenCalledWith(
      expect.objectContaining({
        quantity: 4,
        lots: [
          { buy_transaction_id: 3, quantity: 2 },
          { buy_transaction_id: 4, quantity: 2 },
        ],
      }),
      expect.any(Object),
    );
  });

  it('stops a lot being oversold', () => {
    renderIt();
    fireEvent.click(screen.getByRole('button', { name: 'Sell from the lot bought Mar 1, 2025' }));
    const dialog = screen.getByRole('dialog');
    fireEvent.change(
      within(dialog).getByLabelText('Shares to sell from the lot bought Mar 1, 2025'),
      { target: { value: '3' } },
    );
    fireEvent.change(within(dialog).getByLabelText('Price per Share'), {
      target: { value: '200' },
    });
    fireEvent.click(within(dialog).getByText('Save Transaction'));

    expect(dialog).toHaveTextContent('The lot bought on Mar 1, 2025 has only 2 shares left');
    expect(mocks.create).not.toHaveBeenCalled();
  });

  it('says why a sold lot cannot be deleted', () => {
    mocks.remove.mockImplementation((_id: number, options: { onError: (e: unknown) => void }) => {
      options.onError(
        new AxiosError('422', '422', undefined, undefined, {
          data: { success: false, data: null, error: 'Delete those sells first.' },
        } as AxiosResponse),
      );
    });
    renderIt();
    fireEvent.click(screen.getByLabelText('Delete transaction from Mar 1, 2025'));
    fireEvent.click(screen.getByText('Delete'));

    expect(screen.getByRole('alert')).toHaveTextContent('Delete those sells first.');
  });
});
