import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import NetWorth from '../../../pages/NetWorth';
import { useUIStore } from '../../../store/uiStore';
import type { FinancialAccount, NetWorthSnapshot, NetWorthSummary } from '../../../types';

const mocks = vi.hoisted(() => ({
  accounts: [] as FinancialAccount[],
  summary: null as NetWorthSummary | null,
  snapshots: [] as NetWorthSnapshot[],
  startPlaid: vi.fn(),
}));

const storage = new Map<string, string>();
vi.stubGlobal('localStorage', {
  getItem: (k: string) => storage.get(k) ?? null,
  setItem: (k: string, v: string) => void storage.set(k, v),
  removeItem: (k: string) => void storage.delete(k),
  clear: () => storage.clear(),
});

const mutation = { mutate: vi.fn(), mutateAsync: vi.fn(), isPending: false, isSuccess: false };

vi.mock('../../../hooks', () => ({
  useAccounts: () => ({ data: mocks.accounts, isLoading: false }),
  useNetWorthSummary: () => ({ data: mocks.summary, isLoading: false }),
  useNetWorthSnapshots: () => ({ data: mocks.snapshots }),
  usePlaidItems: () => ({ data: [] }),
  useDeleteAccount: () => mutation,
  useSyncPlaid: () => mutation,
  useDisconnectPlaid: () => mutation,
  usePlaidConnectFlow: () => ({
    start: mocks.startPlaid,
    isBusy: false,
    statusLabel: null,
    error: null,
    accountsImported: null,
  }),
}));

vi.mock('../../../hooks/useNetWorth', () => ({
  useCreateAccount: () => mutation,
  useUpdateAccount: () => mutation,
}));

function account(overrides: Partial<FinancialAccount>): FinancialAccount {
  return {
    id: 1,
    name: 'Account',
    institution: null,
    account_type: 'checking',
    balance: 0,
    is_asset: true,
    is_linked: false,
    last_synced: '2026-10-20T10:00:00Z',
    notes: null,
    created_at: '2026-10-01T00:00:00Z',
    updated_at: '2026-10-20T10:00:00Z',
    ...overrides,
  };
}

beforeEach(() => {
  useUIStore.setState({ hideBalances: false });
  mocks.accounts = [
    account({ id: 1, name: 'Chase Checking', account_type: 'checking', balance: 12_000 }),
    account({
      id: 2,
      name: 'Home Loan',
      account_type: 'mortgage',
      balance: 300_000,
      is_asset: false,
    }),
    account({
      id: 3,
      name: 'Visa',
      account_type: 'credit_card',
      balance: 1_500,
      is_asset: false,
    }),
  ];
  mocks.summary = {
    total_assets: 353_010,
    total_liabilities: 301_500,
    net_worth: 51_510,
    portfolio_value: 341_010,
  };
  mocks.snapshots = [];
});

describe('NetWorth page', () => {
  it('shows the backend net worth as the headline', async () => {
    render(<NetWorth />);
    const hero = screen.getByRole('region', { name: 'Net worth summary' });
    // The amount counts up on load, then settles on the exact value.
    await waitFor(() => expect(within(hero).getByText('$51,510')).toBeInTheDocument(), {
      timeout: 3000,
    });
  });

  it('shows the trend placeholder until there is a week of history', () => {
    mocks.snapshots = [
      {
        id: 1,
        date: '2026-10-19',
        total_assets: 0,
        total_liabilities: 0,
        net_worth: 1,
        created_at: '',
      },
    ];
    render(<NetWorth />);
    expect(screen.getByText(/check back in a week/i)).toBeInTheDocument();
  });

  it('masks every balance when hidden and persists the choice', () => {
    render(<NetWorth />);
    fireEvent.click(screen.getByRole('button', { name: 'Hide balances' }));
    expect(screen.queryByText('$12,000')).not.toBeInTheDocument();
    expect(screen.getAllByText('••••••').length).toBeGreaterThan(5);
    expect(localStorage.getItem('hideBalances')).toBe('true');
    expect(screen.getByRole('button', { name: 'Show balances' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
  });

  it('shows liabilities without a minus sign', () => {
    render(<NetWorth />);
    const row = screen.getByRole('button', { name: 'Edit Home Loan' });
    expect(within(row).getByText('$300,000')).toBeInTheDocument();
    expect(screen.queryByText(/−\$300,000/)).not.toBeInTheDocument();
  });

  it('prompts for missing liability details', () => {
    render(<NetWorth />);
    expect(screen.getByRole('button', { name: 'Add credit limit' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Add original amount' })).toBeInTheDocument();
  });

  it('shows utilization when a credit limit is known', () => {
    mocks.accounts[2] = { ...mocks.accounts[2], credit_limit: 6_000, due_date: '2026-11-05' };
    render(<NetWorth />);
    expect(screen.getByText('25% of $6,000 used · due Nov 5')).toBeInTheDocument();
  });

  it('offers home equity only while no property is tracked', () => {
    const { unmount } = render(<NetWorth />);
    expect(screen.getByText('See your home equity')).toBeInTheDocument();
    unmount();

    mocks.accounts.push(
      account({ id: 4, name: 'Home', account_type: 'real_estate', balance: 450_000 }),
    );
    render(<NetWorth />);
    expect(screen.queryByText('See your home equity')).not.toBeInTheDocument();
  });

  it('merges connect and manual actions into the Add menu', () => {
    render(<NetWorth />);
    fireEvent.click(screen.getByRole('button', { name: 'Add' }));
    const menu = screen.getByRole('menu');
    expect(
      within(menu)
        .getAllByRole('menuitem')
        .map((i) => i.textContent),
    ).toEqual([
      expect.stringContaining('Connect bank'),
      expect.stringContaining('Manual account'),
      expect.stringContaining('Property'),
      expect.stringContaining('Vehicle'),
      expect.stringContaining('Crypto'),
    ]);

    fireEvent.click(within(menu).getByRole('menuitem', { name: /Connect bank/ }));
    expect(mocks.startPlaid).toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Add' }));
    fireEvent.click(screen.getByRole('menuitem', { name: /Vehicle/ }));
    expect(screen.getByRole('dialog')).toHaveTextContent('Add vehicle');
  });
});
