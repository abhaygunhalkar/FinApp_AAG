import { render, screen, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import TransactionHistory from './TransactionHistory';
import type { Transaction } from '../../types';

const mockTransactions: Transaction[] = [
  {
    id: 1,
    holding_id: 1,
    ticker: 'AAPL',
    transaction_type: 'buy',
    quantity: 10,
    price: 150.0,
    fees: 4.99,
    transaction_date: '2024-01-15',
    notes: 'Initial purchase',
    created_at: '2024-01-15T10:00:00Z',
  },
  {
    id: 2,
    holding_id: 1,
    ticker: 'AAPL',
    transaction_type: 'sell',
    quantity: 5,
    price: 175.0,
    fees: 4.99,
    transaction_date: '2024-03-20',
    notes: null,
    created_at: '2024-03-20T10:00:00Z',
  },
];

const mockCreateTransaction = vi.fn();
const mockDeleteTransaction = vi.fn();

vi.mock('../../hooks/useTransactions', () => ({
  useTransactions: (holdingId: number) => ({
    data: holdingId > 0 ? mockTransactions : [],
    isLoading: false,
  }),
  useCreateTransaction: () => ({
    mutate: mockCreateTransaction,
    isPending: false,
    isError: false,
  }),
  useDeleteTransaction: () => ({
    mutate: mockDeleteTransaction,
    isPending: false,
    isError: false,
  }),
}));

function renderWithProviders(ui: React.ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>);
}

describe('TransactionHistory', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders transaction table with all columns', () => {
    renderWithProviders(<TransactionHistory holdingId={1} ticker="AAPL" />);
    expect(screen.getByText('Transaction History')).toBeInTheDocument();
    expect(screen.getByText('Type')).toBeInTheDocument();
    expect(screen.getByText('Quantity')).toBeInTheDocument();
    expect(screen.getByText('Price')).toBeInTheDocument();
    expect(screen.getByText('Fees')).toBeInTheDocument();
    expect(screen.getByText('Date')).toBeInTheDocument();
    expect(screen.getByText('Notes')).toBeInTheDocument();
    expect(screen.getByText('Actions')).toBeInTheDocument();
  });

  it('displays transaction type with color coding', () => {
    renderWithProviders(<TransactionHistory holdingId={1} ticker="AAPL" />);
    const buyText = screen.getByText('buy');
    const sellText = screen.getByText('sell');
    expect(buyText.className).toContain('text-green-600');
    expect(sellText.className).toContain('text-red-600');
  });

  it('displays transaction data correctly', () => {
    renderWithProviders(<TransactionHistory holdingId={1} ticker="AAPL" />);
    expect(screen.getByText('10')).toBeInTheDocument();
    expect(screen.getByText('5')).toBeInTheDocument();
    expect(screen.getByText('$150.00')).toBeInTheDocument();
    expect(screen.getByText('$175.00')).toBeInTheDocument();
    expect(screen.getByText('Initial purchase')).toBeInTheDocument();
  });

  it('shows "Record Transaction" button', () => {
    renderWithProviders(<TransactionHistory holdingId={1} ticker="AAPL" />);
    expect(screen.getByText('Record Transaction')).toBeInTheDocument();
  });

  it('opens transaction form when "Record Transaction" is clicked', () => {
    renderWithProviders(<TransactionHistory holdingId={1} ticker="AAPL" />);
    fireEvent.click(screen.getByText('Record Transaction'));
    expect(screen.getByText('Record Transaction — AAPL')).toBeInTheDocument();
    expect(screen.getByLabelText('Quantity')).toBeInTheDocument();
    expect(screen.getByLabelText('Price per Share')).toBeInTheDocument();
    expect(screen.getByLabelText('Fees')).toBeInTheDocument();
    expect(screen.getByLabelText('Transaction Date')).toBeInTheDocument();
    expect(screen.getByLabelText('Notes (optional)')).toBeInTheDocument();
  });

  it('has buy/sell type selector in the form', () => {
    renderWithProviders(<TransactionHistory holdingId={1} ticker="AAPL" />);
    fireEvent.click(screen.getByText('Record Transaction'));
    const buyButton = screen.getByRole('button', { name: 'Buy' });
    const sellButton = screen.getByRole('button', { name: 'Sell' });
    expect(buyButton).toBeInTheDocument();
    expect(sellButton).toBeInTheDocument();
  });

  it('validates form fields before submission', () => {
    renderWithProviders(<TransactionHistory holdingId={1} ticker="AAPL" />);
    fireEvent.click(screen.getByText('Record Transaction'));
    fireEvent.click(screen.getByText('Save Transaction'));
    expect(screen.getByText('Quantity must be greater than 0')).toBeInTheDocument();
    expect(screen.getByText('Price must be at least $0.01')).toBeInTheDocument();
  });

  it('calls createTransaction on valid form submission', () => {
    mockCreateTransaction.mockImplementation(
      (_payload: unknown, options: { onSuccess: () => void }) => {
        options.onSuccess();
      },
    );
    renderWithProviders(<TransactionHistory holdingId={1} ticker="AAPL" />);
    fireEvent.click(screen.getByText('Record Transaction'));

    fireEvent.change(screen.getByLabelText('Quantity'), { target: { value: '5' } });
    fireEvent.change(screen.getByLabelText('Price per Share'), { target: { value: '160.00' } });
    fireEvent.change(screen.getByLabelText('Fees'), { target: { value: '4.99' } });

    fireEvent.click(screen.getByText('Save Transaction'));

    expect(mockCreateTransaction).toHaveBeenCalledWith(
      expect.objectContaining({
        ticker: 'AAPL',
        transaction_type: 'buy',
        quantity: 5,
        price: 160,
        fees: 4.99,
      }),
      expect.any(Object),
    );
  });

  it('shows delete confirmation when delete button is clicked', () => {
    renderWithProviders(<TransactionHistory holdingId={1} ticker="AAPL" />);
    const deleteButtons = screen.getAllByLabelText(/Delete transaction/);
    fireEvent.click(deleteButtons[0]);
    expect(screen.getByText('Delete Transaction')).toBeInTheDocument();
    expect(
      screen.getByText(/Are you sure you want to delete this buy transaction/),
    ).toBeInTheDocument();
  });

  it('calls deleteTransaction on confirmation', () => {
    mockDeleteTransaction.mockImplementation((_id: number, options: { onSuccess: () => void }) => {
      options.onSuccess();
    });
    renderWithProviders(<TransactionHistory holdingId={1} ticker="AAPL" />);
    const deleteButtons = screen.getAllByLabelText(/Delete transaction/);
    fireEvent.click(deleteButtons[0]);

    fireEvent.click(screen.getByText('Delete'));
    expect(mockDeleteTransaction).toHaveBeenCalledWith(1, expect.any(Object));
  });

  it('shows empty state when no transactions exist', () => {
    vi.doMock('../../hooks/useTransactions', () => ({
      useTransactions: () => ({ data: [], isLoading: false }),
      useCreateTransaction: () => ({ mutate: vi.fn(), isPending: false, isError: false }),
      useDeleteTransaction: () => ({ mutate: vi.fn(), isPending: false, isError: false }),
    }));
    // Use holdingId 0 which returns empty array per our mock
    renderWithProviders(<TransactionHistory holdingId={0} ticker="AAPL" />);
    expect(screen.getByText('No transactions recorded.')).toBeInTheDocument();
  });
});
