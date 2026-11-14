import { QueryClient } from '@tanstack/react-query';
import { isUnauthorized } from '../api/client';

// A 401 means the session ended; trying again won't help.
const retry = (failureCount: number, error: unknown) => !isUnauthorized(error) && failureCount < 3;

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry,
      staleTime: 30000,
      retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 30000),
    },
    mutations: {
      retry,
      retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 30000),
    },
  },
});
