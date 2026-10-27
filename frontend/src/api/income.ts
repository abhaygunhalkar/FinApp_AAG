import apiClient, { unwrapResponse } from './client';
import type {
  AccountForecastResponse,
  ApiResponse,
  CashFlowSummary,
  IncomeSource,
  IncomeSourceCreate,
  IncomeSourceUpdate,
} from '../types';

export async function getIncomeSources(): Promise<IncomeSource[]> {
  const { data } = await apiClient.get<ApiResponse<IncomeSource[]>>('/api/income');
  return unwrapResponse(data);
}

export async function createIncomeSource(income: IncomeSourceCreate): Promise<IncomeSource> {
  const { data } = await apiClient.post<ApiResponse<IncomeSource>>('/api/income', income);
  return unwrapResponse(data);
}

export async function updateIncomeSource(
  id: number,
  income: IncomeSourceUpdate,
): Promise<IncomeSource> {
  const { data } = await apiClient.put<ApiResponse<IncomeSource>>(`/api/income/${id}`, income);
  return unwrapResponse(data);
}

export async function deleteIncomeSource(id: number): Promise<null> {
  const { data } = await apiClient.delete<ApiResponse<null>>(`/api/income/${id}`);
  return unwrapResponse(data);
}

export async function getCashFlowSummary(): Promise<CashFlowSummary> {
  const { data } = await apiClient.get<ApiResponse<CashFlowSummary>>('/api/cash-flow/summary');
  return unwrapResponse(data);
}

/** Each bank account's balance through the bills and paydays of the next `days` days. */
export async function getAccountForecast(days: number): Promise<AccountForecastResponse> {
  const { data } = await apiClient.get<ApiResponse<AccountForecastResponse>>(
    '/api/cash-flow/forecast',
    { params: { days } },
  );
  return unwrapResponse(data);
}
