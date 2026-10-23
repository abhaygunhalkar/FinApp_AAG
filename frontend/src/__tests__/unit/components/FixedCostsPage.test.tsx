import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import FixedCosts from '../../../pages/FixedCosts';
import { useUIStore } from '../../../store/uiStore';
import { daysUntil } from '../../../components/fixedcosts/constants';
import type { RecurringExpense } from '../../../types';

const mocks = vi.hoisted(() => ({
  expenses: [] as RecurringExpense[],
  deleteMutate: vi.fn(),
  createMutateAsync: vi.fn(),
  updateMutateAsync: vi.fn(),
}));

const storage = new Map<string, string>();
vi.stubGlobal('localStorage', {
  getItem: (k: string) => storage.get(k) ?? null,
  setItem: (k: string, v: string) => void storage.set(k, v),
  removeItem: (k: string) => void storage.delete(k),
  clear: () => storage.clear(),
});

vi.mock('../../../hooks', () => ({
  useRecurringExpenses: () => ({ data: mocks.expenses, isLoading: false, isError: false }),
  useDeleteRecurringExpense: () => ({ mutate: mocks.deleteMutate, isPending: false }),
  useCreateRecurringExpense: () => ({ mutateAsync: mocks.createMutateAsync, isPending: false }),
  useUpdateRecurringExpense: () => ({ mutateAsync: mocks.updateMutateAsync, isPending: false }),
}));

function expense(overrides: Partial<RecurringExpense>): RecurringExpense {
  return {
    id: 1,
    name: 'Expense',
    category: 'Utilities',
    amount: 100,
    frequency: 'monthly',
    monthly_amount: 100,
    next_due_date: null,
    paid_from: null,
    autopay: false,
    notes: null,
    created_at: '2026-10-01T00:00:00Z',
    updated_at: '2026-10-01T00:00:00Z',
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  useUIStore.setState({ hideBalances: false });
  mocks.expenses = [
    expense({ id: 1, name: 'Mortgage', category: 'Housing', amount: 2000, monthly_amount: 2000 }),
    expense({
      id: 2,
      name: 'Home insurance',
      category: 'Housing',
      amount: 1200,
      frequency: 'annual',
      monthly_amount: 100,
    }),
    expense({ id: 3, name: 'Internet', amount: 70, monthly_amount: 70, autopay: true }),
  ];
});

describe('FixedCosts page', () => {
  it('totals bills as monthly and yearly amounts', () => {
    render(<FixedCosts />);
    expect(screen.getAllByText('$2,170.00').length).toBeGreaterThan(0);
    expect(screen.getByText('$26,040.00')).toBeInTheDocument();
    expect(screen.getByText('1 on autopay · 2 paid manually')).toBeInTheDocument();
  });

  it('filters the table by category', () => {
    render(<FixedCosts />);
    fireEvent.click(screen.getByRole('button', { name: 'Utilities (1)' }));
    const table = screen.getByRole('table');
    expect(within(table).getByText('Internet')).toBeInTheDocument();
    expect(within(table).queryByText('Mortgage')).not.toBeInTheDocument();
    expect(within(table).getByText('Utilities total')).toBeInTheDocument();
  });

  it('asks before deleting, then deletes', () => {
    render(<FixedCosts />);
    fireEvent.click(screen.getByRole('button', { name: 'Delete Internet' }));
    fireEvent.click(screen.getByRole('button', { name: 'Keep' }));
    expect(mocks.deleteMutate).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Delete Internet' }));
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
    expect(mocks.deleteMutate).toHaveBeenCalledWith(3, expect.anything());
  });

  it('edits an expense with its current values filled in', async () => {
    mocks.updateMutateAsync.mockResolvedValue(undefined);
    render(<FixedCosts />);
    fireEvent.click(screen.getByRole('button', { name: 'Edit Internet' }));
    const amount = screen.getByLabelText('Amount') as HTMLInputElement;
    expect(amount.value).toBe('70');
    fireEvent.change(amount, { target: { value: '80' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));
    await waitFor(() =>
      expect(mocks.updateMutateAsync).toHaveBeenCalledWith({
        id: 3,
        expense: expect.objectContaining({ name: 'Internet', amount: 80, autopay: true }),
      }),
    );
  });

  it('validates the add form before saving', async () => {
    mocks.createMutateAsync.mockResolvedValue(undefined);
    render(<FixedCosts />);
    fireEvent.click(screen.getByRole('button', { name: 'Add expense' }));
    const dialog = screen.getByRole('dialog');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Add expense' }));
    expect(within(dialog).getByRole('alert')).toHaveTextContent('Enter a name');

    fireEvent.change(within(dialog).getByLabelText('Name'), { target: { value: 'Gym' } });
    fireEvent.change(within(dialog).getByLabelText('Amount'), { target: { value: '45' } });
    fireEvent.change(within(dialog).getByLabelText('Category'), {
      target: { value: 'Subscriptions' },
    });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Add expense' }));
    await waitFor(() =>
      expect(mocks.createMutateAsync).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'Gym', amount: 45, category: 'Subscriptions' }),
      ),
    );
  });

  it('masks amounts when numbers are hidden', () => {
    useUIStore.setState({ hideBalances: true });
    render(<FixedCosts />);
    expect(screen.queryByText('$2,170.00')).not.toBeInTheDocument();
    expect(screen.getAllByText('••••••').length).toBeGreaterThan(5);
  });

  it('shows an empty state with no expenses', () => {
    mocks.expenses = [];
    render(<FixedCosts />);
    expect(screen.getByText('No fixed costs yet')).toBeInTheDocument();
  });
});

describe('daysUntil', () => {
  it('counts whole days from local midnight', () => {
    const today = new Date(2026, 9, 23, 15, 30);
    expect(daysUntil('2026-10-23', today)).toBe(0);
    expect(daysUntil('2026-11-06', today)).toBe(14);
    expect(daysUntil('2026-10-20', today)).toBe(-3);
    expect(daysUntil(null, today)).toBeNull();
  });
});
