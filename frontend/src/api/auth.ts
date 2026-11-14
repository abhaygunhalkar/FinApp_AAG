import { isAxiosError } from 'axios';
import apiClient, { unwrapResponse } from './client';
import type { ApiResponse, AuthUser, LoginRequest } from '../types';

/** The server's own message for a failed request, or a fallback. */
function messageOf(err: unknown): string {
  if (isAxiosError(err)) {
    const error = (err.response?.data as ApiResponse<unknown> | undefined)?.error;
    if (error) return error;
    if (!err.response) return "Couldn't reach the server. Check your connection and try again.";
  }
  return 'Something went wrong. Please try again.';
}

/** The signed-in user; rejects with a 401 error when there is no session. */
export async function getMe(): Promise<AuthUser> {
  const { data } = await apiClient.get<ApiResponse<AuthUser>>('/api/auth/me');
  return unwrapResponse(data);
}

/** Signs in. Throws an Error whose message is fit to show on the form. */
export async function login(credentials: LoginRequest): Promise<AuthUser> {
  try {
    const { data } = await apiClient.post<ApiResponse<AuthUser>>('/api/auth/login', credentials);
    return unwrapResponse(data);
  } catch (err) {
    throw new Error(messageOf(err), { cause: err });
  }
}

export async function logout(): Promise<void> {
  await apiClient.post('/api/auth/logout');
}
