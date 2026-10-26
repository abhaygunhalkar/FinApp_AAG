import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import FixedCosts from '../../../pages/FixedCosts';
import { useUIStore } from '../../../store/uiStore';
import { daysUntil } from '../../../components/fixedcosts/constants';
import type { FinancialAccount, RecurringExpense } from '../../../types';

const mocks = vi.hoisted(() => ({
  expenses: [] as RecurringExpense[],
  accounts: [] as FinancialAccount[],
  deleteMutate: vi.fn(),
  markPaidMutate: vi.fn(),
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
  useAccounts: () => ({ data: mocks.accounts }),
  useRecurringExpenses: () => ({ data: mocks.expenses, isLoading: false, isError: false }),
  useDeleteRecurringExpense: () => ({ mutate: mocks.deleteMutate, isPending: false }),
  useMarkRecurringExpensePaid: () => ({ mutate: mocks.markPaidMutate, isPending: false }),
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

const renderPage = () =>
  render(
    <MemoryRouter>
      <FixedCosts />
    </MemoryRouter>,
  );

beforeEach(() => {
  vi.clearAllMocks();
  mocks.accounts = [];
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
    renderPage();
    expect(screen.getAllByText('$2,170.00').length).toBeGreaterThan(0);
    expect(screen.getByText('$26,040.00')).toBeInTheDocument();
    expect(screen.getByText('1 on autopay · 2 paid manually')).toBeInTheDocument();
  });

  it('filters the table by category', () => {
    renderPage();
    fireEvent.click(screen.getByRole('button', { name: 'Utilities (1)' }));
    const table = screen.getByRole('table');
    expect(within(table).getByText('Internet')).toBeInTheDocument();
    expect(within(table).queryByText('Mortgage')).not.toBeInTheDocument();
    expect(within(table).getByText('Utilities total')).toBeInTheDocument();
  });

  it('asks before deleting, then deletes', () => {
    renderPage();
    fireEvent.click(screen.getByRole('button', { name: 'Delete Internet' }));
    fireEvent.click(screen.getByRole('button', { name: 'Keep' }));
    expect(mocks.deleteMutate).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Delete Internet' }));
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
    expect(mocks.deleteMutate).toHaveBeenCalledWith(3, expect.anything());
  });

  it('edits an expense with its current values filled in', async () => {
    mocks.updateMutateAsync.mockResolvedValue(undefined);
    renderPage();
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
    renderPage();
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
    renderPage();
    expect(screen.queryByText('$2,170.00')).not.toBeInTheDocument();
    expect(screen.getAllByText('••••••').length).toBeGreaterThan(5);
  });

  it('shows overdue manual bills and lets them be marked paid', () => {
    const iso = (offset: number) => {
      const d = new Date();
      d.setDate(d.getDate() + offset);
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
        d.getDate(),
      ).padStart(2, '0')}`;
    };
    mocks.expenses = [
      expense({ id: 7, name: 'Water', next_due_date: iso(-3), autopay: false }),
      expense({ id: 8, name: 'Internet', next_due_date: iso(5), autopay: true }),
    ];
    renderPage();

    expect(screen.getByText('Overdue by 3 days')).toBeInTheDocument();
    expect(screen.getByText('overdue by 3 days')).toBeInTheDocument(); // "Coming up" list
    expect(screen.getByText('2 bills · 1 overdue')).toBeInTheDocument();

    // Only manual bills get the button; autopay bills advance on their own.
    expect(screen.queryByRole('button', { name: 'Mark Internet paid' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Mark Water paid' }));
    expect(mocks.markPaidMutate).toHaveBeenCalledWith(7);
  });

  it('shows an empty state with no expenses', () => {
    mocks.expenses = [];
    renderPage();
    expect(screen.getByText('No fixed costs yet')).toBeInTheDocument();
  });
});

describe('Paid from', () => {
  const account = (overrides: Partial<FinancialAccount>): FinancialAccount => ({
    id: 1,
    name: 'Account',
    institution: null,
    account_type: 'checking',
    balance: 0,
    is_asset: true,
    is_linked: false,
    last_synced: null,
    notes: null,
    created_at: '2026-10-01T00:00:00Z',
    updated_at: '2026-10-01T00:00:00Z',
    ...overrides,
  });

  it('lists bank accounts and credit cards from Net Worth, grouped', async () => {
    mocks.createMutateAsync.mockResolvedValue(undefined);
    mocks.accounts = [
      account({ id: 1, name: 'Everyday Checking', institution: 'Harbor Bank' }),
      account({
        id: 2,
        name: 'Rewards Card',
        institution: 'Harbor Bank',
        account_type: 'credit_card',
      }),
      account({ id: 3, name: 'Home Mortgage', account_type: 'mortgage' }),
    ];
    renderPage();
    fireEvent.click(screen.getByRole('button', { name: 'Add expense' }));
    const dialog = screen.getByRole('dialog');
    const select = within(dialog).getByLabelText('Paid from') as HTMLSelectElement;
    expect([...select.querySelectorAll('optgroup')].map((g) => g.label)).toEqual([
      'Bank accounts',
      'Credit cards',
    ]);
    expect([...select.options].map((o) => o.text)).toEqual([
      'Not specified',
      'Everyday Checking (Harbor Bank)',
      'Rewards Card (Harbor Bank)',
    ]);

    fireEvent.change(within(dialog).getByLabelText('Name'), { target: { value: 'Gym' } });
    fireEvent.change(within(dialog).getByLabelText('Amount'), { target: { value: '45' } });
    fireEvent.change(select, { target: { value: 'Rewards Card (Harbor Bank)' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Add expense' }));
    await waitFor(() =>
      expect(mocks.createMutateAsync).toHaveBeenCalledWith(
        expect.objectContaining({ paid_from: 'Rewards Card (Harbor Bank)' }),
      ),
    );
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
