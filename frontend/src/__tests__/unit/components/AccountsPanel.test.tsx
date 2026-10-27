import { fireEvent, render, screen, within } from '@testing-library/react';
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
    account_type: 'checking',
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
    cards: [{ account_id: 3, label: 'Rewards Card', total: 412, count: 3 }],
    unlinked_total: 70,
    unlinked_count: 1,
    undated_count: 2,
    ...overrides,
  };
}

beforeEach(() => {
  mocks.forecast = forecast();
  mocks.days = [];
  useUIStore.setState({ hideBalances: false });
});

describe('AccountsPanel', () => {
  it('flags an account that goes below $0 and explains why', () => {
    render(<AccountsPanel days={14} />);
    expect(mocks.days).toContain(14);
    expect(screen.getByText('Short $550.00 on Nov 15')).toBeInTheDocument();
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
    render(<AccountsPanel days={14} />);
    expect(screen.getByText('Covered')).toBeInTheDocument();
    expect(
      screen.queryByRole('table', { name: 'Summit Savings timeline' }),
    ).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Summit Savings/ }));
    expect(screen.getByRole('table', { name: 'Summit Savings timeline' })).toBeInTheDocument();
  });

  it('lists card charges, unlinked and undated bills', () => {
    render(<AccountsPanel days={14} />);
    expect(screen.getByText(/\$412\.00 charged to Rewards Card \(3 bills\)/)).toBeInTheDocument();
    expect(screen.getByText(/Not checked: \$70\.00 \(1 bill\)/)).toBeInTheDocument();
    expect(screen.getByText('2 bills with no due date not included.')).toBeInTheDocument();
  });

  it('masks amounts when numbers are hidden', () => {
    useUIStore.setState({ hideBalances: true });
    render(<AccountsPanel days={14} />);
    expect(screen.queryByText(/\$550\.00/)).not.toBeInTheDocument();
    expect(screen.getByText('Short •••••• on Nov 15')).toBeInTheDocument();
  });

  it('says so when nothing is due', () => {
    mocks.forecast = forecast({ accounts: [], cards: [], unlinked_count: 0, undated_count: 0 });
    render(<AccountsPanel days={7} />);
    expect(
      screen.getByText('No bills due from your accounts in the next 7 days.'),
    ).toBeInTheDocument();
  });
});
