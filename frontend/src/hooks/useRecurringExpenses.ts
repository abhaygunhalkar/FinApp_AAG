import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  getRecurringExpenses,
  createRecurringExpense,
  updateRecurringExpense,
  markRecurringExpensePaid,
  deleteRecurringExpense,
} from '../api';
import type { RecurringExpenseCreate, RecurringExpenseUpdate } from '../types';
import { ACCOUNT_FORECAST_KEY } from './useIncome';

const KEY = ['recurring-expenses'];

export function useRecurringExpenses() {
  return useQuery({
    queryKey: KEY,
    queryFn: getRecurringExpenses,
  });
}

export function useCreateRecurringExpense() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (expense: RecurringExpenseCreate) => createRecurringExpense(expense),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: KEY });
      queryClient.invalidateQueries({ queryKey: ACCOUNT_FORECAST_KEY });
    },
  });
}

export function useUpdateRecurringExpense() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, expense }: { id: number; expense: RecurringExpenseUpdate }) =>
      updateRecurringExpense(id, expense),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: KEY });
      queryClient.invalidateQueries({ queryKey: ACCOUNT_FORECAST_KEY });
    },
  });
}

export function useMarkRecurringExpensePaid() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: number) => markRecurringExpensePaid(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: KEY });
      queryClient.invalidateQueries({ queryKey: ACCOUNT_FORECAST_KEY });
    },
  });
}

export function useDeleteRecurringExpense() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: number) => deleteRecurringExpense(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: KEY });
      queryClient.invalidateQueries({ queryKey: ACCOUNT_FORECAST_KEY });
    },
  });
}
