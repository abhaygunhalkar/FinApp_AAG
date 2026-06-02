import apiClient, { unwrapResponse } from './client';
import type { ApiResponse, DashboardSummary, ActivityEvent, PortfolioSnapshot } from '../types';

type SellTransaction = {
  transaction_date: string;
  realized_gain: number;
};

export async function getSummary(): Promise<DashboardSummary> {
  const { data } = await apiClient.get<ApiResponse<DashboardSummary>>('/api/dashboard/summary');
  return unwrapResponse(data);
}

export async function getActivity(): Promise<ActivityEvent[]> {
  const { data } = await apiClient.get<ApiResponse<ActivityEvent[]>>('/api/dashboard/activity');
  return unwrapResponse(data);
}

export async function getHistory(days: number = 30): Promise<PortfolioSnapshot[]> {
  const { data } = await apiClient.get<ApiResponse<PortfolioSnapshot[]>>('/api/dashboard/history', {
    params: { days },
  });
  return unwrapResponse(data);
}

export async function getSellHistory(): Promise<SellTransaction[]> {
  const { data } = await apiClient.get<ApiResponse<SellTransaction[]>>('/api/transactions/sells');
  return unwrapResponse(data);
}
