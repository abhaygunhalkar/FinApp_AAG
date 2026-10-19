import apiClient, { unwrapResponse } from './client';
import type {
  ApiResponse,
  FinancialAccount,
  FinancialAccountCreate,
  FinancialAccountUpdate,
  NetWorthSnapshot,
  NetWorthSummary,
} from '../types';

export async function getAccounts(): Promise<FinancialAccount[]> {
  const { data } = await apiClient.get<ApiResponse<FinancialAccount[]>>('/api/net-worth/accounts');
  return unwrapResponse(data);
}

export async function createAccount(payload: FinancialAccountCreate): Promise<FinancialAccount> {
  const { data } = await apiClient.post<ApiResponse<FinancialAccount>>(
    '/api/net-worth/accounts',
    payload,
  );
  return unwrapResponse(data);
}

export async function updateAccount(
  id: number,
  payload: FinancialAccountUpdate,
): Promise<FinancialAccount> {
  const { data } = await apiClient.put<ApiResponse<FinancialAccount>>(
    `/api/net-worth/accounts/${id}`,
    payload,
  );
  return unwrapResponse(data);
}

export async function deleteAccount(id: number): Promise<null> {
  const { data } = await apiClient.delete<ApiResponse<null>>(`/api/net-worth/accounts/${id}`);
  return unwrapResponse(data);
}

export async function getNetWorthSummary(): Promise<NetWorthSummary> {
  const { data } = await apiClient.get<ApiResponse<NetWorthSummary>>('/api/net-worth/summary');
  return unwrapResponse(data);
}

export async function getNetWorthSnapshots(): Promise<NetWorthSnapshot[]> {
  const { data } = await apiClient.get<ApiResponse<NetWorthSnapshot[]>>('/api/net-worth/snapshots');
  return unwrapResponse(data);
}
