import { fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import AccountsPanel from '../../../components/fixedcosts/AccountsPanel';
import { useUIStore } from '../../../store/uiStore';
import type { AccountForecast, AccountForecastResponse } from '../../../types';

const mocks = vi.hoisted(() => ({
  forecast: undefined as AccountForecastResponse | undefined,
  days: [] as number[],
}));

vi.mock('../../../hooks', () => ({
  useAccountForecast: (days: number) => {
    mocks.days.push(days);
    return { data: mocks.forecast, isLoading: false, isError: false };
  },
}));

function account(overrides: Partial<AccountForecast>): AccountForecast {
  return {
    account_id: 1,
    label: 'Everyday Checking (Harbor Bank)',
    name: 'Everyday Checking',
    institution: 'Harbor Bank',
    account_type: 'checking',
    has_paydays: true,
    balance: 1000,
    bills_total: 1550,
    income_total: 2000,
    ending_balance: 1450,
    lowest_balance: -550,
    lowest_date: '2026-11-15',
    short_date: '2026-11-15',
    short_bill: 'Rent',
    events: [
      {
        date: '2026-11-09',
        kind: 'bill',
        name: 'Water',
        amount: -50,
        balance_after: 950,
        overdue: true,
      },
      {
        date: '2026-11-15',
        kind: 'bill',
        name: 'Rent',
        amount: -1500,
        balance_after: -550,
        overdue: false,
      },
      {
        date: '2026-11-20',
        kind: 'income',
        name: 'Paycheck',
        amount: 2000,
        balance_after: 1450,
        overdue: false,
      },
    ],
    ...overrides,
  };
}

function forecast(overrides: Partial<AccountForecastResponse> = {}): AccountForecastResponse {
  return {
    start: '2026-11-09',
    end: '2026-11-23',
    accounts: [
      account({}),
      account({
        account_id: 2,
        label: 'Summit Savings',
        name: 'Summit Savings',
        institution: 'Summit Savings',
        has_paydays: false,
        balance: 5000,
        bills_total: 100,
        income_total: 0,
        lowest_balance: 4900,
        lowest_date: '2026-11-12',
        short_date: null,
        short_bill: null,
        events: [
          {
            date: '2026-11-12',
            kind: 'bill',
            name: 'Insurance',
            amount: -100,
            balance_after: 4900,
            overdue: false,
          },
        ],
      }),
    ],
    cards: [
      {
        account_id: 3,
        label: 'Rewards Card (Harbor Bank)',
        name: 'Rewards Card',
        institution: 'Harbor Bank',
        total: 412,
        count: 3,
      },
    ],
    unlinked_total: 70,
    unlinked_count: 1,
    undated_count: 2,
    ...overrides,
  };
}

const renderPanel = (days: number) =>
  render(
    <MemoryRouter>
      <AccountsPanel days={days} />
    </MemoryRouter>,
  );

beforeEach(() => {
  mocks.forecast = forecast();
  mocks.days = [];
  useUIStore.setState({ hideBalances: false });
});

describe('AccountsPanel', () => {
  it('flags an account that goes below $0 and explains why', () => {
    renderPanel(14);
    expect(mocks.days).toContain(14);
    expect(screen.getByText('Short $550.00')).toBeInTheDocument();
    expect(screen.getByText(/Rent on Nov 15 takes this account below \$0/)).toBeInTheDocument();

    const timeline = screen.getByRole('table', {
      name: 'Everyday Checking (Harbor Bank) timeline',
    });
    const rows = within(timeline).getAllByRole('row').slice(1);
    expect(rows.map((r) => r.textContent)).toEqual([
      'Nov 9Wateroverdue-$50.00$950.00',
      'Nov 15Rent-$1,500.00-$550.00',
      'Nov 20Paycheck+$2,000.00$1,450.00',
    ]);
  });

  it('shows covered accounts collapsed until clicked', () => {
    renderPanel(14);
    expect(screen.getByText('Covered')).toBeInTheDocument();
    expect(
      screen.queryByRole('table', { name: 'Summit Savings timeline' }),
    ).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Summit Savings: covered' }));
    expect(screen.getByRole('table', { name: 'Summit Savings timeline' })).toBeInTheDocument();
  });

  it('shows credit cards as their own cards in the grid', () => {
    renderPanel(14);
    const card = screen.getByText('Rewards Card').closest('li')!;
    expect(within(card).getAllByText('Harbor Bank')).toHaveLength(1);
    expect(card).toHaveTextContent('$412.00charged · 3 bills');
    expect(card).toHaveAttribute('title', 'No cash needed until the card is paid.');
  });

  it('lists unlinked and undated bills', () => {
    renderPanel(14);
    expect(screen.getByText(/Not checked: \$70\.00 \(1 bill\)/)).toBeInTheDocument();
    expect(screen.getByText('2 bills with no due date not included.')).toBeInTheDocument();
  });

  it('shows the institution only when it differs from the name', () => {
    renderPanel(14);
    expect(screen.getAllByText('Harbor Bank')).toHaveLength(2); // checking + the card
    expect(screen.getAllByText('Summit Savings')).toHaveLength(1);
  });

  it('marks an account tight when its lowest point is under $500', () => {
    mocks.forecast = forecast({
      accounts: [account({ lowest_balance: 320, short_date: null, short_bill: null })],
    });
    renderPanel(14);
    expect(screen.getByText('Tight')).toHaveAttribute(
      'title',
      'Lowest balance stays under $500.00',
    );
    expect(
      screen.getByRole('img', { name: '$1,000.00 today, lowest $320.00 · Nov 15' }),
    ).toBeInTheDocument();
  });

  it('links to Cash Flow when an account has no paydays set up', () => {
    renderPanel(14);
    const links = screen.getAllByRole('link', { name: 'Add payday' });
    expect(links).toHaveLength(1); // only Summit Savings
    expect(links[0]).toHaveAttribute('href', '/cash-flow');
  });

  it('masks amounts when numbers are hidden', () => {
    useUIStore.setState({ hideBalances: true });
    renderPanel(14);
    expect(screen.queryByText(/\$550\.00/)).not.toBeInTheDocument();
    expect(screen.getByText('Short ••••••')).toBeInTheDocument();
  });

  it('says so when nothing is due', () => {
    mocks.forecast = forecast({ accounts: [], cards: [], unlinked_count: 0, undated_count: 0 });
    renderPanel(7);
    expect(
      screen.getByText('No bills due from your accounts in the next 7 days.'),
    ).toBeInTheDocument();
  });
});
