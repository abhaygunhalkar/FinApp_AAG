import apiClient, { unwrapResponse } from './client';
import type {
  ApiResponse,
  MonthlyPnlEntry,
  OptionPayload,
  OptionQuote,
  OptionsSummary,
  OptionsTrade,
} from '../types';

export async function getOptions() {
  const { data } = await apiClient.get<ApiResponse<OptionsTrade[]>>('/api/options');
  return unwrapResponse(data);
}

export async function getOption(id: number) {
  const { data } = await apiClient.get<ApiResponse<OptionsTrade>>(`/api/options/${id}`);
  return unwrapResponse(data);
}

export async function createOption(payload: OptionPayload) {
  const { data } = await apiClient.post<ApiResponse<OptionsTrade>>('/api/options', payload);
  return unwrapResponse(data);
}

export async function updateOption(id: number, payload: OptionPayload) {
  const { data } = await apiClient.put<ApiResponse<OptionsTrade>>(`/api/options/${id}`, payload);
  return unwrapResponse(data);
}

export async function deleteOption(id: number) {
  const { data } = await apiClient.delete<ApiResponse<null>>(`/api/options/${id}`);
  return unwrapResponse(data);
}

export async function getOptionsSummary() {
  const { data } = await apiClient.get<ApiResponse<OptionsSummary>>('/api/options/summary');
  return unwrapResponse(data);
}

export async function getOptionsMonthlyPnl(): Promise<MonthlyPnlEntry[]> {
  const { data } = await apiClient.get<ApiResponse<MonthlyPnlEntry[]>>('/api/options/monthly-pnl');
  return unwrapResponse(data);
}

export async function getOpenTradeQuotes() {
  const { data } =
    await apiClient.get<ApiResponse<Record<string, OptionQuote>>>('/api/options/quotes');
  return unwrapResponse(data);
}
