import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import CashFlow from '../../../pages/CashFlow';
import { useUIStore } from '../../../store/uiStore';
import type {
  CashFlowSummary,
  FinancialAccount,
  IncomeSource,
  RecurringExpense,
} from '../../../types';

const mocks = vi.hoisted(() => ({
  summary: null as CashFlowSummary | null,
  incomes: [] as IncomeSource[],
  expenses: [] as RecurringExpense[],
  accounts: [] as FinancialAccount[],
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
  useCashFlowSummary: () => ({ data: mocks.summary, isLoading: false, isError: false }),
  useIncomeSources: () => ({ data: mocks.incomes, isLoading: false }),
  useRecurringExpenses: () => ({ data: mocks.expenses }),
  useAccounts: () => ({ data: mocks.accounts }),
  useDeleteIncomeSource: () => ({ mutate: mocks.deleteMutate, isPending: false }),
  useCreateIncomeSource: () => ({ mutateAsync: mocks.createMutateAsync, isPending: false }),
  useUpdateIncomeSource: () => ({ mutateAsync: mocks.updateMutateAsync, isPending: false }),
}));

function income(overrides: Partial<IncomeSource>): IncomeSource {
  return {
    id: 1,
    name: 'Paycheck',
    category: 'Salary',
    amount: 3000,
    frequency: 'biweekly',
    monthly_amount: 6500,
    deposited_to_account_id: null,
    deposited_to: 'Checking',
    notes: null,
    created_at: '2026-10-01T00:00:00Z',
    updated_at: '2026-10-01T00:00:00Z',
    ...overrides,
  };
}

function expense(overrides: Partial<RecurringExpense>): RecurringExpense {
  return {
    id: 1,
    name: 'Mortgage',
    category: 'Housing',
    amount: 2500,
    frequency: 'monthly',
    monthly_amount: 2500,
    next_due_date: null,
    paid_from_account_id: null,
    paid_from: null,
    autopay: true,
    notes: null,
    created_at: '2026-10-01T00:00:00Z',
    updated_at: '2026-10-01T00:00:00Z',
    ...overrides,
  };
}

const renderPage = () =>
  render(
    <MemoryRouter>
      <CashFlow />
    </MemoryRouter>,
  );

function account(overrides: Partial<FinancialAccount>): FinancialAccount {
  return {
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
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.accounts = [
    account({ id: 1, name: 'Everyday Checking', institution: 'Harbor Bank' }),
    account({ id: 2, name: 'Emergency Savings', account_type: 'savings' }),
    account({ id: 3, name: 'Rewards Card', account_type: 'credit_card', is_asset: false }),
    account({ id: 4, name: 'Brokerage', account_type: 'investment' }),
  ];
  useUIStore.setState({ hideBalances: false });
  mocks.incomes = [
    income({ id: 1 }),
    income({
      id: 2,
      name: 'Basement rent',
      category: 'Rental income',
      amount: 1000,
      frequency: 'monthly',
      monthly_amount: 1000,
    }),
  ];
  mocks.expenses = [
    expense({ id: 1 }),
    expense({
      id: 2,
      name: 'Electricity',
      category: 'Utilities',
      amount: 500,
      monthly_amount: 500,
    }),
  ];
  mocks.summary = {
    monthly_income: 7500,
    monthly_fixed_costs: 3000,
    monthly_surplus: 4500,
    kept_pct: 60,
    liquid_cash: 15000,
    emergency_months: 5,
  };
});

describe('CashFlow page', () => {
  it('shows income, fixed costs, what is left and emergency months', () => {
    renderPage();
    expect(screen.getAllByText('$7,500.00').length).toBeGreaterThan(0);
    expect(screen.getByText('60% of income, before variable spending')).toBeInTheDocument();
    expect(screen.getAllByText('5.0 months').length).toBeGreaterThan(0);
    expect(screen.getByText(/Within the 3–6 month range/)).toBeInTheDocument();
  });

  it('breaks income down by fixed-cost category plus what is left', () => {
    renderPage();
    const bar = screen.getByRole('img');
    expect(bar).toHaveAttribute(
      'aria-label',
      'Housing 33%, Utilities 7%, Left after fixed costs 60%',
    );
  });

  it('warns when fixed costs exceed income', () => {
    mocks.summary = {
      ...mocks.summary!,
      monthly_income: 2000,
      monthly_surplus: -1000,
      kept_pct: -50,
    };
    renderPage();
    expect(screen.getByRole('alert')).toHaveTextContent('$1,000.00 a month more than your income');
  });

  it('asks before deleting an income source', () => {
    renderPage();
    fireEvent.click(screen.getByRole('button', { name: 'Delete Basement rent' }));
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
    expect(mocks.deleteMutate).toHaveBeenCalledWith(2, expect.anything());
  });

  it('adds income from the form', async () => {
    mocks.createMutateAsync.mockResolvedValue(undefined);
    renderPage();
    fireEvent.click(screen.getByRole('button', { name: 'Add income' }));
    const dialog = screen.getByRole('dialog');
    fireEvent.change(within(dialog).getByLabelText('Name'), { target: { value: 'Freelance' } });
    fireEvent.change(within(dialog).getByLabelText('Take-home amount'), {
      target: { value: '800' },
    });
    fireEvent.change(within(dialog).getByLabelText('Category'), {
      target: { value: 'Side income' },
    });
    fireEvent.change(within(dialog).getByLabelText('How often'), { target: { value: 'monthly' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Add income' }));
    await waitFor(() =>
      expect(mocks.createMutateAsync).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'Freelance',
          amount: 800,
          category: 'Side income',
          frequency: 'monthly',
        }),
      ),
    );
  });

  it('offers checking and savings accounts from Net Worth as deposit options', async () => {
    mocks.createMutateAsync.mockResolvedValue(undefined);
    renderPage();
    fireEvent.click(screen.getByRole('button', { name: 'Add income' }));
    const dialog = screen.getByRole('dialog');
    const select = within(dialog).getByLabelText('Deposited to') as HTMLSelectElement;
    expect([...select.options].map((o) => o.text)).toEqual([
      'Not specified',
      'Everyday Checking (Harbor Bank)',
      'Emergency Savings',
    ]);

    fireEvent.change(within(dialog).getByLabelText('Name'), { target: { value: 'Paycheck' } });
    fireEvent.change(within(dialog).getByLabelText('Take-home amount'), {
      target: { value: '100' },
    });
    fireEvent.change(select, { target: { value: '1' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Add income' }));
    await waitFor(() =>
      expect(mocks.createMutateAsync).toHaveBeenCalledWith(
        expect.objectContaining({ deposited_to_account_id: 1, deposited_to: null }),
      ),
    );
  });

  it('keeps a typed-in deposit value that is not on Net Worth when editing', () => {
    mocks.incomes = [income({ id: 9, name: 'Old paycheck', deposited_to: 'Chase chk' })];
    renderPage();
    fireEvent.click(screen.getByRole('button', { name: 'Edit Old paycheck' }));
    const select = within(screen.getByRole('dialog')).getByLabelText(
      'Deposited to',
    ) as HTMLSelectElement;
    expect(select.value).toBe('legacy');
    expect(select.selectedOptions[0].text).toBe('Chase chk (not on Net Worth)');
  });

  it('pre-selects the linked account when editing, and can unlink it', async () => {
    mocks.updateMutateAsync.mockResolvedValue(undefined);
    mocks.incomes = [
      income({
        id: 5,
        name: 'Linked pay',
        deposited_to_account_id: 2,
        deposited_to: 'Emergency Savings',
      }),
    ];
    renderPage();
    fireEvent.click(screen.getByRole('button', { name: 'Edit Linked pay' }));
    const dialog = screen.getByRole('dialog');
    const select = within(dialog).getByLabelText('Deposited to') as HTMLSelectElement;
    expect(select.value).toBe('2');
    // A linked record never shows its label as a separate "not on Net Worth" option.
    expect([...select.options].some((o) => o.text.includes('not on Net Worth'))).toBe(false);

    fireEvent.change(select, { target: { value: '' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Save changes' }));
    await waitFor(() =>
      expect(mocks.updateMutateAsync).toHaveBeenCalledWith({
        id: 5,
        income: expect.objectContaining({ deposited_to_account_id: null, deposited_to: null }),
      }),
    );
  });

  it('points to Net Worth when there are no bank accounts', () => {
    mocks.accounts = [];
    renderPage();
    fireEvent.click(screen.getByRole('button', { name: 'Add income' }));
    expect(screen.getByRole('link', { name: 'Add them on Net Worth' })).toBeInTheDocument();
  });

  it('masks amounts but keeps months when numbers are hidden', () => {
    useUIStore.setState({ hideBalances: true });
    renderPage();
    expect(screen.queryByText('$7,500.00')).not.toBeInTheDocument();
    expect(screen.getAllByText('5.0 months').length).toBeGreaterThan(0);
  });

  it('shows empty states with no data', () => {
    mocks.incomes = [];
    mocks.expenses = [];
    mocks.summary = {
      monthly_income: 0,
      monthly_fixed_costs: 0,
      monthly_surplus: 0,
      kept_pct: null,
      liquid_cash: 0,
      emergency_months: null,
    };
    renderPage();
    expect(screen.getByText('No income yet')).toBeInTheDocument();
    expect(screen.getByText('Add fixed costs to see this')).toBeInTheDocument();
  });
});
