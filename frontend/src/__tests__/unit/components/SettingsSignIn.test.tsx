import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import Settings from '../../../pages/Settings';
import type { AuthUser } from '../../../types';

const me = vi.hoisted(() => ({ data: undefined as AuthUser | undefined }));
vi.mock('../../../hooks/useAuth', () => ({ useMe: () => ({ data: me.data }) }));

describe('Settings: sign-in & security', () => {
  beforeEach(() => {
    me.data = undefined;
  });

  it('says when two-step verification is off and how to turn it on', () => {
    me.data = { username: 'abhay', two_step_enabled: false, backup_codes_left: 0 };
    render(<Settings />);
    expect(screen.getByText('Signed in as').nextSibling).toHaveTextContent('abhay');
    expect(screen.getByText('Two-step verification').nextSibling).toHaveTextContent('Off');
    expect(screen.getByText(/--enable-2fa/)).toBeInTheDocument();
    expect(screen.queryByText('Backup codes left')).not.toBeInTheDocument();
  });

  it('counts backup codes and warns when they run low', () => {
    me.data = { username: 'abhay', two_step_enabled: true, backup_codes_left: 8 };
    const { rerender } = render(<Settings />);
    expect(screen.getByText('Backup codes left').nextSibling).toHaveTextContent('8');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();

    me.data = { ...me.data, backup_codes_left: 2 };
    rerender(<Settings />);
    expect(screen.getByRole('alert')).toHaveTextContent('Running low on backup codes');
    expect(screen.getByText(/--backup-codes/)).toBeInTheDocument();
  });
});
