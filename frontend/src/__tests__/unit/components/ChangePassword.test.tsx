import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ChangePasswordForm } from '../../../components/auth';

const api = vi.hoisted(() => ({ changePassword: vi.fn(), getMe: vi.fn(), login: vi.fn() }));
vi.mock('../../../api/auth', () => api);

const NEW = 'a brand new passphrase';

function renderForm(twoStep = false) {
  render(
    <QueryClientProvider client={new QueryClient()}>
      <ChangePasswordForm twoStep={twoStep} />
    </QueryClientProvider>,
  );
  fireEvent.click(screen.getByRole('button', { name: 'Change password' }));
}

function fill(values: Record<string, string>) {
  for (const [label, value] of Object.entries(values)) {
    fireEvent.change(screen.getByLabelText(label), { target: { value } });
  }
}

const submit = () => fireEvent.click(screen.getByRole('button', { name: 'Change password' }));

beforeEach(() => {
  api.changePassword.mockReset();
});

describe('ChangePasswordForm', () => {
  it('changes the password and says how many browsers were signed out', async () => {
    api.changePassword.mockResolvedValue({ signed_out: 2 });
    renderForm();
    fill({ 'Current password': 'old one here!', 'New password': NEW, 'Confirm new password': NEW });
    submit();
    expect(await screen.findByRole('status')).toHaveTextContent(
      'Password changed. 2 other browsers were signed out.',
    );
    expect(api.changePassword.mock.calls[0][0]).toEqual({
      current_password: 'old one here!',
      new_password: NEW,
    });
    // Closed again, back to the button.
    expect(screen.queryByLabelText('Current password')).not.toBeInTheDocument();
  });

  it('stops when the new passwords differ, without asking the server', () => {
    renderForm();
    fill({
      'Current password': 'old one here!',
      'New password': NEW,
      'Confirm new password': `${NEW}x`,
    });
    submit();
    expect(screen.getByRole('alert')).toHaveTextContent("The new passwords don't match.");
    expect(api.changePassword).not.toHaveBeenCalled();
  });

  it('waits for a long enough new password', () => {
    renderForm();
    fill({ 'Current password': 'x', 'New password': 'short', 'Confirm new password': 'short' });
    expect(screen.getByRole('button', { name: 'Change password' })).toBeDisabled();
  });

  it('asks for the authenticator code with two-step on, and clears guesses on failure', async () => {
    api.changePassword.mockRejectedValue(new Error('Your current password is incorrect.'));
    renderForm(true);
    fill({
      'Current password': 'wrong guess!',
      'New password': NEW,
      'Confirm new password': NEW,
      'Authenticator code': ' 123456 ',
    });
    submit();
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Your current password is incorrect.',
    );
    expect(api.changePassword.mock.calls[0][0].code).toBe('123456');
    expect(screen.getByLabelText('Current password')).toHaveValue('');
    expect(screen.getByLabelText('Authenticator code')).toHaveValue('');
    expect(screen.getByLabelText('New password')).toHaveValue(NEW);
  });
});
