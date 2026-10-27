import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import AccountForm from '../../../components/networth/AccountForm';

const mocks = vi.hoisted(() => ({ create: vi.fn() }));

vi.mock('../../../hooks/useNetWorth', () => ({
  useCreateAccount: () => ({ mutateAsync: mocks.create, isPending: false }),
  useUpdateAccount: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));

beforeEach(() => {
  mocks.create.mockReset().mockResolvedValue(undefined);
});

const submit = () => fireEvent.click(screen.getByRole('button', { name: /^Add/ }));

describe('AccountForm balance', () => {
  it('saves a credit card with an empty balance owed as $0', async () => {
    render(<AccountForm defaults={{ account_type: 'credit_card' }} onClose={vi.fn()} />);
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Amex Gold' } });
    submit();
    await waitFor(() =>
      expect(mocks.create).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'Amex Gold', account_type: 'credit_card', balance: 0 }),
      ),
    );
  });

  it('still needs a value for other accounts', () => {
    render(<AccountForm defaults={{ account_type: 'checking' }} onClose={vi.fn()} />);
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Checking' } });
    submit();
    expect(screen.getByText('Balance must be 0 or greater')).toBeInTheDocument();
    expect(mocks.create).not.toHaveBeenCalled();
  });
});
