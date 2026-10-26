import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  getIncomeSources,
  createIncomeSource,
  updateIncomeSource,
  deleteIncomeSource,
  getCashFlowSummary,
} from '../api';
import type { IncomeSourceCreate, IncomeSourceUpdate } from '../types';

const KEY = ['income'];
const SUMMARY_KEY = ['cash-flow-summary'];

export function useIncomeSources() {
  return useQuery({ queryKey: KEY, queryFn: getIncomeSources });
}

export function useCashFlowSummary() {
  // Built from bills and account balances edited on other pages, so always refetch on open.
  return useQuery({ queryKey: SUMMARY_KEY, queryFn: getCashFlowSummary, staleTime: 0 });
}

function useInvalidateIncome() {
  const queryClient = useQueryClient();
  return () => {
    queryClient.invalidateQueries({ queryKey: KEY });
    queryClient.invalidateQueries({ queryKey: SUMMARY_KEY });
  };
}

export function useCreateIncomeSource() {
  const invalidate = useInvalidateIncome();
  return useMutation({
    mutationFn: (income: IncomeSourceCreate) => createIncomeSource(income),
    onSuccess: invalidate,
  });
}

export function useUpdateIncomeSource() {
  const invalidate = useInvalidateIncome();
  return useMutation({
    mutationFn: ({ id, income }: { id: number; income: IncomeSourceUpdate }) =>
      updateIncomeSource(id, income),
    onSuccess: invalidate,
  });
}

export function useDeleteIncomeSource() {
  const invalidate = useInvalidateIncome();
  return useMutation({
    mutationFn: (id: number) => deleteIncomeSource(id),
    onSuccess: invalidate,
  });
}
