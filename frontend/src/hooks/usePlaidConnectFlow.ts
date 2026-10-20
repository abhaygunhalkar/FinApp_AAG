// Sandbox test credentials: username "user_good" / password "pass_good"
import { useCallback, useEffect, useState } from 'react';
import { usePlaidLink } from 'react-plaid-link';
import { createLinkToken } from '../api/plaid';
import { useConnectPlaid } from './usePlaid';

/**
 * Opens Plaid Link on demand. The link token is fetched only when `start()` is
 * called, so the page doesn't pay for it on load. Use once per page and pass
 * `start` to every "connect" entry point.
 */
export function usePlaidConnectFlow() {
  const [linkToken, setLinkToken] = useState<string | null>(null);
  const [tokenRequesting, setTokenRequesting] = useState(false);
  const [tokenError, setTokenError] = useState<string | null>(null);
  const connectMutation = useConnectPlaid();

  const onSuccess = useCallback(
    (publicToken: string | null) => {
      if (publicToken) connectMutation.mutate(publicToken);
      setLinkToken(null);
    },
    [connectMutation],
  );

  const { open, ready } = usePlaidLink({
    token: linkToken ?? '',
    onSuccess,
    onExit: () => setLinkToken(null),
  });

  useEffect(() => {
    if (linkToken && ready) open();
  }, [linkToken, ready, open]);

  // Loading covers fetching the token and waiting for the Link script to be ready.
  const tokenLoading = tokenRequesting || (linkToken !== null && !ready);

  const start = useCallback(async () => {
    setTokenRequesting(true);
    setTokenError(null);
    try {
      setLinkToken(await createLinkToken());
    } catch {
      setTokenError('Could not load Plaid — check your credentials.');
    } finally {
      setTokenRequesting(false);
    }
  }, []);

  return {
    start,
    isBusy: tokenLoading || connectMutation.isPending,
    statusLabel: tokenLoading ? 'Loading…' : connectMutation.isPending ? 'Connecting…' : null,
    error:
      tokenError ??
      (connectMutation.isError
        ? `Failed to connect account — ${(connectMutation.error as Error)?.message ?? 'unknown error'}`
        : null),
    accountsImported: connectMutation.isSuccess ? connectMutation.data?.accounts_synced : null,
  };
}

export type PlaidConnectFlow = ReturnType<typeof usePlaidConnectFlow>;
