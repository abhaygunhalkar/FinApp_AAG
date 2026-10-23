import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  getRecurringExpenses,
  createRecurringExpense,
  updateRecurringExpense,
  deleteRecurringExpense,
} from '../api';
import type { RecurringExpenseCreate, RecurringExpenseUpdate } from '../types';

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
    },
  });
}

export function useDeleteRecurringExpense() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: number) => deleteRecurringExpense(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: KEY });
    },
  });
}
