import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import UpdateBalancesPanel from '../../../components/networth/UpdateBalancesPanel';
import { accountStaleDays } from '../../../components/networth/accountConfig';
import type { FinancialAccount } from '../../../types';

const mocks = vi.hoisted(() => ({
  sync: { mutate: vi.fn(), isPending: false, isError: false, isSuccess: false },
  confirm: vi.fn(),
  update: vi.fn(),
}));

vi.mock('../../../hooks', () => ({
  useSyncPlaid: () => mocks.sync,
}));

vi.mock('../../../hooks/useNetWorth', () => ({
  useConfirmBalance: () => ({ mutateAsync: mocks.confirm }),
  useUpdateAccount: () => ({ mutateAsync: mocks.update }),
}));

const ago = (days: number) => new Date(Date.now() - days * 86_400_000).toISOString();

function account(overrides: Partial<FinancialAccount>): FinancialAccount {
  return {
    id: 1,
    name: 'Account',
    institution: null,
    account_type: 'checking',
    balance: 0,
    is_asset: true,
    is_linked: false,
    last_synced: ago(10),
    notes: null,
    created_at: ago(100),
    updated_at: ago(10),
    ...overrides,
  };
}

const ACCOUNTS = [
  account({ id: 1, name: 'Amex Gold', account_type: 'credit_card', balance: 1240.18 }),
  account({ id: 2, name: 'Car loan', account_type: 'loan', balance: 14302, last_synced: ago(45) }),
  // Fresh, or not past its type's limit: not listed.
  account({ id: 3, name: 'Savings', account_type: 'savings', balance: 50000, last_synced: ago(2) }),
  account({
    id: 4,
    name: 'Home',
    account_type: 'real_estate',
    balance: 450000,
    last_synced: ago(40),
  }),
  // Linked accounts are synced, not listed.
  account({ id: 5, name: 'Plaid Checking', is_linked: true, balance: 900 }),
];

function renderPanel(accounts = ACCOUNTS, onClose = vi.fn()) {
  render(<UpdateBalancesPanel accounts={accounts} hidden={false} onClose={onClose} />);
  return { panel: screen.getByRole('dialog', { name: 'Update balances' }), onClose };
}

const rowNames = (panel: HTMLElement) =>
  within(panel)
    .queryAllByRole('listitem')
    .map((li) => li.querySelector('p')?.textContent);

beforeEach(() => {
  mocks.sync = { mutate: vi.fn(), isPending: false, isError: false, isSuccess: false };
  mocks.confirm.mockReset().mockResolvedValue({});
  mocks.update.mockReset().mockResolvedValue({});
});

describe('accountStaleDays', () => {
  it('uses a limit per account type', () => {
    const at = (type: FinancialAccount['account_type'], days: number) =>
      accountStaleDays(account({ account_type: type, last_synced: ago(days) }));
    expect(at('checking', 6)).toBeNull();
    expect(at('checking', 8)).toBe(8);
    expect(at('mortgage', 20)).toBeNull();
    expect(at('mortgage', 31)).toBe(31);
    expect(at('real_estate', 60)).toBeNull();
    expect(at('real_estate', 91)).toBe(91);
  });
});

describe('UpdateBalancesPanel', () => {
  it('lists only stale manual accounts, biggest balance first', () => {
    const { panel } = renderPanel();
    expect(rowNames(panel)).toEqual(['Car loan', 'Amex Gold']);
    expect(within(panel).getByText('2 left · biggest first')).toBeInTheDocument();
    expect(within(panel).getByText('updated 45 days ago')).toBeInTheDocument();
  });

  it('confirms with "Still right" and moves on, then says it is done', async () => {
    const { panel } = renderPanel();
    fireEvent.click(within(panel).getAllByRole('button', { name: 'Still right' })[0]);
    await waitFor(() => expect(rowNames(panel)).toEqual(['Amex Gold']));
    expect(mocks.confirm).toHaveBeenCalledWith(2);

    fireEvent.click(within(panel).getByRole('button', { name: 'Still right' }));
    await waitFor(() => expect(within(panel).getByText('All done')).toBeInTheDocument());
    expect(within(panel).getByText('Your balances are up to date')).toBeInTheDocument();
  });

  it('saves an edited balance, and treats an unchanged one as a confirmation', async () => {
    const { panel } = renderPanel();
    const edit = () => within(panel).getAllByRole('button', { name: 'Edit' })[0];

    fireEvent.click(edit());
    const input = within(panel).getByLabelText('New balance for Car loan');
    expect(input).toHaveValue('14302.00');
    fireEvent.change(input, { target: { value: '$14,050.50' } });
    fireEvent.click(within(panel).getByRole('button', { name: 'Save' }));
    await waitFor(() =>
      expect(mocks.update).toHaveBeenCalledWith({ id: 2, data: { balance: 14050.5 } }),
    );
    await waitFor(() => expect(rowNames(panel)).toEqual(['Amex Gold']));

    fireEvent.click(edit());
    fireEvent.click(within(panel).getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(mocks.confirm).toHaveBeenCalledWith(1));
    expect(mocks.update).toHaveBeenCalledTimes(1);
  });

  it('explains a balance that is not a number, and a failed save', async () => {
    const { panel } = renderPanel();
    fireEvent.click(within(panel).getAllByRole('button', { name: 'Edit' })[0]);
    fireEvent.change(within(panel).getByLabelText('New balance for Car loan'), {
      target: { value: 'abc' },
    });
    fireEvent.click(within(panel).getByRole('button', { name: 'Save' }));
    expect(within(panel).getByRole('alert')).toHaveTextContent('Enter a number');
    expect(mocks.update).not.toHaveBeenCalled();

    mocks.confirm.mockRejectedValueOnce(new Error('Account not found'));
    fireEvent.click(within(panel).getByRole('button', { name: 'Still right' }));
    await waitFor(() =>
      expect(within(panel).getByRole('alert')).toHaveTextContent('Account not found'),
    );
    expect(rowNames(panel)).toEqual(['Car loan', 'Amex Gold']);
  });

  it('syncs linked accounts once when one is stale', () => {
    mocks.sync = { ...mocks.sync, isPending: true };
    renderPanel();
    expect(mocks.sync.mutate).toHaveBeenCalledTimes(1);
    expect(screen.getByText('Syncing bank accounts…')).toBeInTheDocument();
  });

  it('does not sync when every linked account is fresh', () => {
    renderPanel([
      ACCOUNTS[0],
      account({ id: 5, name: 'Plaid Checking', is_linked: true, last_synced: ago(1) }),
    ]);
    expect(mocks.sync.mutate).not.toHaveBeenCalled();
  });

  it('shows the sync result', () => {
    mocks.sync = { ...mocks.sync, isSuccess: true };
    renderPanel();
    expect(screen.getByText('Bank accounts synced ✓')).toBeInTheDocument();
  });

  it('closes with Escape, but Escape while editing only cancels the edit', () => {
    const { panel, onClose } = renderPanel();
    fireEvent.click(within(panel).getAllByRole('button', { name: 'Edit' })[0]);
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onClose).not.toHaveBeenCalled();
    expect(within(panel).queryByLabelText('New balance for Car loan')).not.toBeInTheDocument();

    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
