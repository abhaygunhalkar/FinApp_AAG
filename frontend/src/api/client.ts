import axios, { isAxiosError } from 'axios';
import type { ApiResponse } from '../types';

const apiClient = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:8000',
  timeout: 10000,
  // Sends the session cookie; locally the API is on another port.
  withCredentials: true,
  headers: {
    'Content-Type': 'application/json',
    // The backend refuses changes without it, so another site can't make them.
    'X-Requested-With': 'FinApp',
  },
});

let onSignedOut: (() => void) | null = null;

/** Called when the API says the session has ended (any 401 outside /api/auth). */
export function setSignedOutHandler(handler: (() => void) | null): void {
  onSignedOut = handler;
}

/** True for an error the API answered with 401 (not signed in). */
export function isUnauthorized(error: unknown): boolean {
  return isAxiosError(error) && error.response?.status === 401;
}

apiClient.interceptors.response.use(undefined, (error: unknown) => {
  if (isUnauthorized(error) && isAxiosError(error)) {
    const url = error.config?.url ?? '';
    if (!url.startsWith('/api/auth/')) onSignedOut?.();
  }
  return Promise.reject(error);
});

/**
 * Unwraps the ApiResponse envelope and returns the data field.
 * Throws an error if the response indicates failure.
 */
export function unwrapResponse<T>(response: ApiResponse<T>): T {
  if (!response.success) {
    throw new Error(response.error || 'An unexpected error occurred');
  }
  return response.data as T;
}

export default apiClient;
