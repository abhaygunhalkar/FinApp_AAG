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

/** Local date `ago` days before today, as YYYY-MM-DD. */
function day(ago: number): string {
  const d = new Date();
  d.setDate(d.getDate() - ago);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
    d.getDate(),
  ).padStart(2, '0')}`;
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
        date: day(1),
        total_assets: 0,
        total_liabilities: 0,
        net_worth: 1,
        created_at: '',
      },
    ];
    render(<NetWorth />);
    expect(screen.getByText(/check back in a week/i)).toBeInTheDocument();
  });

  it('notes when the change includes an account added in the range', () => {
    const snap = (id: number, date: string, net_worth: number) => ({
      id,
      date,
      total_assets: 0,
      total_liabilities: 0,
      net_worth,
      created_at: '',
    });
    mocks.snapshots = [snap(1, day(30), 40_000), snap(2, day(10), 50_000)];
    mocks.accounts = mocks.accounts.map((a, i) => ({
      ...a,
      created_at: i === 0 ? `${day(10)}T12:00:00Z` : `${day(200)}T12:00:00Z`,
    }));
    render(<NetWorth />);
    const hero = screen.getByRole('region', { name: 'Net worth summary' });
    const pill = within(hero).getByTitle('Includes accounts added this period: Chase Checking');
    expect(pill).toHaveTextContent('+$11,510');
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

  it('shows each card on one line under a combined utilization summary', () => {
    mocks.accounts[2] = {
      ...mocks.accounts[2],
      credit_limit: 6_000,
      apr: 24.99,
      due_date: '2026-11-05',
    };
    mocks.accounts.push(
      account({
        id: 4,
        name: 'Amex',
        account_type: 'credit_card',
        balance: 500,
        is_asset: false,
        credit_limit: 4_000,
        apr: 19.5,
      }),
    );
    render(<NetWorth />);
    expect(screen.getByText(/\$2,000 of \$10,000 limit · 20%\s+utilization/)).toBeInTheDocument();
    const visa = screen.getByRole('button', { name: 'Edit Visa' });
    expect(visa).toHaveTextContent('24.99% APR · due Nov 5');
    expect(visa).toHaveTextContent('highest APR');
    expect(within(visa).getByRole('progressbar', { name: 'Credit utilization' })).toHaveAttribute(
      'aria-valuenow',
      '25',
    );
    expect(within(visa).getByText('25%')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Edit Amex' })).not.toHaveTextContent('highest APR');
  });

  it('does not tag a paid-off card as highest APR', () => {
    mocks.accounts[2] = { ...mocks.accounts[2], balance: 0, apr: 29 };
    mocks.accounts.push(
      account({
        id: 4,
        name: 'Amex',
        account_type: 'credit_card',
        balance: 500,
        is_asset: false,
        apr: 19,
      }),
    );
    render(<NetWorth />);
    expect(screen.queryByText('highest APR')).not.toBeInTheDocument();
  });

  it('says when a row is stale, and only then', () => {
    const ago = (days: number) => new Date(Date.now() - days * 86_400_000).toISOString();
    mocks.accounts[0] = { ...mocks.accounts[0], last_synced: ago(1) };
    mocks.accounts[1] = { ...mocks.accounts[1], last_synced: ago(5) };
    render(<NetWorth />);
    expect(screen.getByRole('button', { name: 'Edit Chase Checking' })).not.toHaveTextContent(
      /updated|synced/,
    );
    expect(screen.getByRole('button', { name: 'Edit Home Loan' })).toHaveTextContent(
      'updated 5 days ago',
    );
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
