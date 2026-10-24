import apiClient, { unwrapResponse } from './client';
import type {
  ApiResponse,
  RecurringExpense,
  RecurringExpenseCreate,
  RecurringExpenseUpdate,
} from '../types';

export async function getRecurringExpenses(): Promise<RecurringExpense[]> {
  const { data } = await apiClient.get<ApiResponse<RecurringExpense[]>>('/api/recurring-expenses');
  return unwrapResponse(data);
}

export async function createRecurringExpense(
  expense: RecurringExpenseCreate,
): Promise<RecurringExpense> {
  const { data } = await apiClient.post<ApiResponse<RecurringExpense>>(
    '/api/recurring-expenses',
    expense,
  );
  return unwrapResponse(data);
}

export async function updateRecurringExpense(
  id: number,
  expense: RecurringExpenseUpdate,
): Promise<RecurringExpense> {
  const { data } = await apiClient.put<ApiResponse<RecurringExpense>>(
    `/api/recurring-expenses/${id}`,
    expense,
  );
  return unwrapResponse(data);
}

export async function markRecurringExpensePaid(id: number): Promise<RecurringExpense> {
  const { data } = await apiClient.post<ApiResponse<RecurringExpense>>(
    `/api/recurring-expenses/${id}/mark-paid`,
  );
  return unwrapResponse(data);
}

export async function deleteRecurringExpense(id: number): Promise<null> {
  const { data } = await apiClient.delete<ApiResponse<null>>(`/api/recurring-expenses/${id}`);
  return unwrapResponse(data);
}
