import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { AxiosError, type AxiosResponse, type InternalAxiosRequestConfig } from 'axios';
import type { ReactNode } from 'react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import apiClient, { setSignedOutHandler } from '../../../api/client';
import { RequireAuth, loginUrl, safeNext } from '../../../components/auth';
import Sidebar from '../../../components/layout/Sidebar';
import Login from '../../../pages/Login';

const USER = { username: 'abhay', two_step_enabled: false, backup_codes_left: 0 };

/** The server accepts the sign-in: from then on, "who's signed in" is the user. */
function acceptSignIn(codeRequired = false) {
  return async () => {
    if (!codeRequired) api.getMe.mockResolvedValue(USER);
    return { username: 'abhay', code_required: codeRequired };
  };
}

const api = vi.hoisted(() => ({ getMe: vi.fn(), login: vi.fn(), logout: vi.fn() }));
vi.mock('../../../api/auth', () => api);

function httpError(status: number | null): AxiosError {
  const config = { headers: {} } as InternalAxiosRequestConfig;
  const response =
    status === null
      ? undefined
      : ({ status, data: {}, headers: {}, statusText: '', config } as AxiosResponse);
  return new AxiosError('failed', 'ERR', config, null, response);
}

/** Shows the current address, so tests can see where a redirect went. */
function Where() {
  const location = useLocation();
  return <p data-testid="where">{location.pathname + location.search}</p>;
}

function renderAt(path: string, extra?: ReactNode) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route element={<RequireAuth />}>
            <Route path="/" element={<h1>Investment Dashboard</h1>} />
            <Route path="/net-worth" element={<h1>Net worth page</h1>} />
          </Route>
        </Routes>
        <Where />
        {extra}
      </MemoryRouter>
    </QueryClientProvider>,
  );
  return queryClient;
}

beforeEach(() => {
  api.getMe.mockReset().mockRejectedValue(httpError(401));
  api.login.mockReset();
  api.logout.mockReset().mockResolvedValue(undefined);
});

describe('redirect helpers', () => {
  it('only ever returns to a path inside the app', () => {
    expect(safeNext('/net-worth?tab=2')).toBe('/net-worth?tab=2');
    for (const bad of [null, '', 'https://evil.com', '//evil.com', '/\\evil.com', '/login']) {
      expect(safeNext(bad)).toBe('/');
    }
  });

  it('builds the sign-in address', () => {
    expect(loginUrl('/')).toBe('/login');
    expect(loginUrl('/net-worth?x=1', true)).toBe('/login?expired=1&next=%2Fnet-worth%3Fx%3D1');
  });
});

describe('RequireAuth', () => {
  it('sends a signed-out visitor to the sign-in page, remembering where they were', async () => {
    renderAt('/net-worth');
    expect(await screen.findByRole('heading', { name: 'Sign in' })).toBeInTheDocument();
    expect(screen.getByTestId('where')).toHaveTextContent('/login?next=%2Fnet-worth');
    expect(screen.queryByText('Net worth page')).not.toBeInTheDocument();
  });

  it('shows the page to a signed-in user', async () => {
    api.getMe.mockResolvedValue(USER);
    renderAt('/net-worth');
    expect(await screen.findByText('Net worth page')).toBeInTheDocument();
  });

  it("says when the server can't be reached instead of asking to sign in", async () => {
    api.getMe.mockRejectedValue(httpError(null));
    renderAt('/net-worth');
    expect(await screen.findByRole('alert')).toHaveTextContent("Couldn't reach the server");
    api.getMe.mockResolvedValue(USER);
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByText('Net worth page')).toBeInTheDocument();
  });
});

describe('Login page', () => {
  async function fill(username: string, password: string) {
    fireEvent.change(await screen.findByLabelText('Username'), { target: { value: username } });
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: password } });
  }

  it('signs in and goes back to the page that asked', async () => {
    api.login.mockImplementation(acceptSignIn());
    renderAt('/login?next=%2Fnet-worth');
    const button = await screen.findByRole('button', { name: 'Sign in' });
    expect(button).toBeDisabled();
    await fill('  abhay ', 'correct horse battery');
    fireEvent.click(button);
    expect(await screen.findByText('Net worth page')).toBeInTheDocument();
    expect(api.login).toHaveBeenCalledTimes(1);
    expect(api.login.mock.calls[0][0]).toEqual({
      username: 'abhay',
      password: 'correct horse battery',
    });
  });

  it('shows the server message and clears the password on failure', async () => {
    api.login.mockRejectedValue(new Error('Incorrect username or password.'));
    renderAt('/login');
    await fill('abhay', 'nope nope nope');
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Incorrect username or password.');
    expect(screen.getByLabelText('Password')).toHaveValue('');
    expect(api.login).toHaveBeenCalledTimes(1);
  });

  it('explains an ended session', async () => {
    renderAt('/login?expired=1');
    expect(await screen.findByRole('status')).toHaveTextContent('Your session ended');
  });

  it('can show the password while typing', async () => {
    renderAt('/login');
    const password = await screen.findByLabelText('Password');
    expect(password).toHaveAttribute('type', 'password');
    fireEvent.click(screen.getByRole('button', { name: 'Show password' }));
    expect(password).toHaveAttribute('type', 'text');
  });

  it('skips the form when already signed in', async () => {
    api.getMe.mockResolvedValue(USER);
    renderAt('/login');
    expect(await screen.findByText('Investment Dashboard')).toBeInTheDocument();
  });
});

describe('Two-step sign-in', () => {
  async function passPasswordStep() {
    fireEvent.change(await screen.findByLabelText('Username'), { target: { value: 'abhay' } });
    fireEvent.change(screen.getByLabelText('Password'), {
      target: { value: 'correct horse battery' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));
    return screen.findByRole('heading', { name: 'Two-step verification' });
  }

  it('asks for a code after the password, then signs in with both', async () => {
    api.login.mockImplementationOnce(acceptSignIn(true)).mockImplementationOnce(acceptSignIn());
    renderAt('/login?next=%2Fnet-worth');
    await passPasswordStep();

    const code = screen.getByLabelText('Code');
    const verify = screen.getByRole('button', { name: 'Verify' });
    fireEvent.change(code, { target: { value: '12a34' } });
    expect(code).toHaveValue('1234');
    expect(verify).toBeDisabled();
    fireEvent.change(code, { target: { value: '123456' } });
    fireEvent.click(verify);

    expect(await screen.findByText('Net worth page')).toBeInTheDocument();
    expect(api.login.mock.calls[1][0]).toEqual({
      username: 'abhay',
      password: 'correct horse battery',
      code: '123456',
    });
  });

  it('shows a wrong code and clears it, keeping the step', async () => {
    api.login
      .mockImplementationOnce(acceptSignIn(true))
      .mockRejectedValueOnce(new Error("That code didn't work."));
    renderAt('/login');
    await passPasswordStep();
    fireEvent.change(screen.getByLabelText('Code'), { target: { value: '000000' } });
    fireEvent.click(screen.getByRole('button', { name: 'Verify' }));
    expect(await screen.findByRole('alert')).toHaveTextContent("That code didn't work.");
    expect(screen.getByLabelText('Code')).toHaveValue('');
    expect(screen.getByRole('heading', { name: 'Two-step verification' })).toBeInTheDocument();
  });

  it('takes a backup code instead', async () => {
    api.login.mockImplementationOnce(acceptSignIn(true)).mockImplementationOnce(acceptSignIn());
    renderAt('/login');
    await passPasswordStep();
    fireEvent.click(screen.getByRole('button', { name: 'Use a backup code' }));
    fireEvent.change(screen.getByLabelText('Backup code'), { target: { value: 'k7mp-q2xa' } });
    fireEvent.click(screen.getByRole('button', { name: 'Verify' }));
    expect(await screen.findByText('Investment Dashboard')).toBeInTheDocument();
    expect(api.login.mock.calls[1][0].code).toBe('k7mp-q2xa');
  });

  it('goes back to the password step and forgets the password', async () => {
    api.login.mockImplementationOnce(acceptSignIn(true));
    renderAt('/login');
    await passPasswordStep();
    fireEvent.click(screen.getByRole('button', { name: '← Back' }));
    expect(screen.getByRole('heading', { name: 'Sign in' })).toBeInTheDocument();
    expect(screen.getByLabelText('Password')).toHaveValue('');
  });
});

describe('Sign out', () => {
  it('ends the session, forgets cached data and shows the sign-in page', async () => {
    api.getMe.mockResolvedValue(USER);
    const queryClient = renderAt('/', <Sidebar />);
    await screen.findByText('Investment Dashboard');
    queryClient.setQueryData(['holdings'], [{ ticker: 'NVDA' }]);
    api.getMe.mockRejectedValue(httpError(401));

    fireEvent.click(screen.getByRole('button', { name: 'Sign out' }));
    await waitFor(() => expect(screen.getByTestId('where')).toHaveTextContent('/login'));
    expect(api.logout).toHaveBeenCalledTimes(1);
    expect(queryClient.getQueryData(['holdings'])).toBeUndefined();
  });
});

describe('API client', () => {
  const signedOut = vi.fn();
  beforeEach(() => setSignedOutHandler(signedOut));
  afterEach(() => {
    setSignedOutHandler(null);
    signedOut.mockReset();
  });

  it('sends the session cookie and the anti-forgery header', async () => {
    let sent: InternalAxiosRequestConfig | undefined;
    await apiClient.post(
      '/api/holdings',
      {},
      {
        adapter: async (config) => {
          sent = config;
          return { data: {}, status: 200, statusText: 'OK', headers: {}, config };
        },
      },
    );
    expect(sent?.withCredentials).toBe(true);
    expect(sent?.headers['X-Requested-With']).toBe('FinApp');
  });

  it('reports an ended session, except from the sign-in calls themselves', async () => {
    const fail = async (config: InternalAxiosRequestConfig) => {
      throw new AxiosError('401', 'ERR', config, null, {
        status: 401,
        data: {},
        headers: {},
        statusText: '',
        config,
      });
    };
    await expect(apiClient.get('/api/auth/me', { adapter: fail })).rejects.toThrow();
    expect(signedOut).not.toHaveBeenCalled();
    await expect(apiClient.get('/api/holdings', { adapter: fail })).rejects.toThrow();
    expect(signedOut).toHaveBeenCalledTimes(1);
  });
});
