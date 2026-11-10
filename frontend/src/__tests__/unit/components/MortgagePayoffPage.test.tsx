import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import NetWorth from '../../../pages/NetWorth';
import MortgagePayoff from '../../../pages/MortgagePayoff';
import Sidebar from '../../../components/layout/Sidebar';
import { useUIStore } from '../../../store/uiStore';
import type { FinancialAccount } from '../../../types';

const mocks = vi.hoisted(() => ({ accounts: [] as FinancialAccount[] }));
const mutation = { mutate: vi.fn(), mutateAsync: vi.fn(), isPending: false, isSuccess: false };

vi.mock('../../../hooks', () => ({
  useAccounts: () => ({ data: mocks.accounts, isLoading: false }),
  useNetWorthSummary: () => ({
    data: { total_assets: 0, total_liabilities: 0, net_worth: 0, portfolio_value: 0 },
    isLoading: false,
  }),
  useNetWorthSnapshots: () => ({ data: [] }),
  usePlaidItems: () => ({ data: [] }),
  useDeleteAccount: () => mutation,
  useSyncPlaid: () => mutation,
  useDisconnectPlaid: () => mutation,
  usePlaidConnectFlow: () => ({
    start: vi.fn(),
    isBusy: false,
    statusLabel: null,
    error: null,
    accountsImported: null,
  }),
}));

/** A date `years` from now, as YYYY-MM-01. */
function inYears(years: number): string {
  const d = new Date();
  return `${d.getFullYear() + years}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
}

function mortgage(overrides: Partial<FinancialAccount>): FinancialAccount {
  return {
    id: 6,
    name: 'Home Mortgage',
    institution: 'Harbor Bank',
    account_type: 'mortgage',
    balance: 386_200,
    is_asset: false,
    is_linked: false,
    last_synced: new Date().toISOString(),
    notes: null,
    created_at: '',
    updated_at: new Date().toISOString(),
    apr: 6.125,
    original_amount: 420_000,
    payoff_date: inYears(28),
    due_date: null,
    ...overrides,
  };
}

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/mortgage-payoff" element={<MortgagePayoff />} />
        <Route path="/net-worth" element={<NetWorth />} />
      </Routes>
    </MemoryRouter>,
  );
}

const tile = (label: string) => screen.getByText(label).parentElement!;

// jsdom has no layout, so no scrollIntoView.
Element.prototype.scrollIntoView = vi.fn();

beforeEach(() => {
  useUIStore.setState({ hideBalances: false });
  mocks.accounts = [mortgage({})];
});

describe('Mortgage payoff page', () => {
  it('shows an empty state that points to Net Worth when there is no mortgage', () => {
    mocks.accounts = [];
    renderAt('/mortgage-payoff');
    expect(screen.getByText('No mortgage to simulate yet')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Add a mortgage on Net Worth' })).toHaveAttribute(
      'href',
      '/net-worth',
    );
  });

  it('starts from the current plan, paid off on the payoff date', () => {
    renderAt('/mortgage-payoff');
    const [y, m] = inYears(28).split('-').map(Number);
    const payoff = new Date(y, m - 1, 1);
    const label = payoff.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
    expect(within(tile('Payoff date')).getByText(label)).toBeInTheDocument();
    expect(within(tile('Time saved')).getByText('0 mos')).toBeInTheDocument();
    expect(screen.getByText(/You're on track to pay off your home in/)).toBeInTheDocument();
  });

  it('recalculates as an extra payment is entered, and Reset undoes it', async () => {
    renderAt('/mortgage-payoff');
    fireEvent.change(screen.getByLabelText('Extra each month'), { target: { value: '500' } });
    await waitFor(() =>
      expect(
        screen.getByText(/^Paying \$500\/mo extra saves \$[\d,]+ in interest/),
      ).toBeInTheDocument(),
    );
    expect(within(tile('Time saved')).queryByText('0 mos')).not.toBeInTheDocument();
    expect((screen.getByLabelText('Extra each month (slider)') as HTMLInputElement).value).toBe(
      '500',
    );

    fireEvent.click(screen.getByRole('button', { name: 'Reset' }));
    await waitFor(() => expect(within(tile('Time saved')).getByText('0 mos')).toBeInTheDocument());
  });

  it('shows refinance break-even and the new payment', async () => {
    renderAt('/mortgage-payoff');
    const toggle = screen.getByRole('switch', { name: 'Refinance' });
    expect(toggle).toHaveAttribute('aria-checked', 'false');
    fireEvent.click(screen.getByRole('switch', { name: 'Refinance' }));
    await waitFor(() => expect(screen.getByText('Break-even')).toBeInTheDocument());
    expect(screen.getByText('New monthly payment')).toBeInTheDocument();
  });

  it('opens the mortgage named in the link, with a selector when there are several', () => {
    mocks.accounts = [
      mortgage({}),
      mortgage({ id: 9, name: 'Lake House', institution: null, balance: 150_000 }),
    ];
    renderAt('/mortgage-payoff?account=9');
    expect(screen.getByLabelText('Mortgage')).toHaveValue('9');
    expect(screen.getByText(/would do to Lake House/)).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Mortgage'), { target: { value: '6' } });
    expect(screen.getByText(/would do to Home Mortgage/)).toBeInTheDocument();
  });

  it('explains a missing payoff date and takes you to the payment field', () => {
    mocks.accounts = [mortgage({ payoff_date: null })];
    renderAt('/mortgage-payoff');
    expect(screen.getByText('Enter your monthly payment to see results')).toBeInTheDocument();
    expect(screen.getByText(/no payoff date saved/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Update on Net Worth' })).toHaveAttribute(
      'href',
      '/net-worth',
    );

    fireEvent.click(screen.getByRole('button', { name: 'Enter payment' }));
    const payment = screen.getByLabelText('Monthly P&I');
    expect(payment).toHaveFocus();
    fireEvent.change(payment, { target: { value: '2400' } });
    expect(screen.queryByText('Enter your monthly payment to see results')).not.toBeInTheDocument();
  });

  it('explains a payoff date that has passed', () => {
    mocks.accounts = [mortgage({ payoff_date: '2020-01-01' })];
    renderAt('/mortgage-payoff');
    expect(screen.getByText(/payoff date has already passed/)).toBeInTheDocument();
  });

  it('hides dollar amounts with the eye toggle', () => {
    renderAt('/mortgage-payoff');
    fireEvent.click(screen.getByRole('button', { name: 'Hide balances' }));
    expect(within(tile('Total interest')).getByText('••••••')).toBeInTheDocument();
  });

  it('is reached from the Net Worth mortgage row with that mortgage loaded', () => {
    mocks.accounts = [
      mortgage({}),
      mortgage({ id: 9, name: 'Lake House', institution: null, balance: 150_000 }),
    ];
    renderAt('/net-worth');
    const links = screen.getAllByRole('link', { name: 'Simulate payoff →' });
    fireEvent.click(links[1]);
    expect(screen.getByRole('heading', { name: 'Mortgage payoff' })).toBeInTheDocument();
    expect(screen.getByLabelText('Mortgage')).toHaveValue('9');
  });
});

describe('Sidebar', () => {
  it('lists Mortgage Payoff under Tools, after Options Strategy, and highlights it', () => {
    render(
      <MemoryRouter initialEntries={['/mortgage-payoff']}>
        <Sidebar />
      </MemoryRouter>,
    );
    const tools = screen.getByRole('heading', { name: 'Tools' }).parentElement!;
    const names = within(tools)
      .getAllByRole('link')
      .map((l) => l.textContent);
    expect(names).toEqual([
      'Options Strategy',
      'Mortgage Payoff',
      'Earnings Calendar',
      'Utilities',
    ]);
    expect(within(tools).getByRole('link', { name: 'Mortgage Payoff' })).toHaveAttribute(
      'aria-current',
      'page',
    );
    expect(screen.getByRole('link', { name: 'Dashboard' })).not.toHaveAttribute('aria-current');
  });
});
