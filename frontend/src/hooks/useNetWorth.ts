import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  getAccounts,
  createAccount,
  updateAccount,
  deleteAccount,
  getNetWorthSummary,
  getNetWorthSnapshots,
} from '../api';
import type { FinancialAccountCreate, FinancialAccountUpdate } from '../types';

const KEY = ['net-worth'];

export function useAccounts() {
  return useQuery({ queryKey: [...KEY, 'accounts'], queryFn: getAccounts });
}

export function useNetWorthSummary() {
  return useQuery({ queryKey: [...KEY, 'summary'], queryFn: getNetWorthSummary });
}

export function useNetWorthSnapshots() {
  return useQuery({ queryKey: [...KEY, 'snapshots'], queryFn: getNetWorthSnapshots });
}

export function useCreateAccount() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: FinancialAccountCreate) => createAccount(data),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  });
}

export function useUpdateAccount() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: number; data: FinancialAccountUpdate }) =>
      updateAccount(id, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  });
}

export function useDeleteAccount() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => deleteAccount(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  });
}
