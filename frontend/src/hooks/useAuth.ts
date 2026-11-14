import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { getMe, login, logout } from '../api/auth';
import type { LoginRequest } from '../types';

export const AUTH_ME_KEY = ['auth', 'me'] as const;

/** Who is signed in. Errors (with a 401) when nobody is. */
export function useMe() {
  return useQuery({
    queryKey: AUTH_ME_KEY,
    queryFn: getMe,
    retry: false,
    staleTime: Infinity,
  });
}

export function useLogin() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (credentials: LoginRequest) => login(credentials),
    // Never retried: each try counts toward the lockout.
    retry: false,
    onSuccess: (user) => queryClient.setQueryData(AUTH_ME_KEY, user),
  });
}

/** Signs out, forgets every cached response, and goes to the sign-in page. */
export function useLogout() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  return useMutation({
    mutationFn: logout,
    retry: false,
    onSettled: () => {
      queryClient.clear();
      navigate('/login', { replace: true });
    },
  });
}
