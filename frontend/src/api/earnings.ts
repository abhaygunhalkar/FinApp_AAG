import apiClient, { unwrapResponse } from './client';
import type { ApiResponse } from '../types';
import type { EarningsCalendarEntry } from '../types/earnings';

export async function getEarningsCalendar(): Promise<EarningsCalendarEntry[]> {
  const { data } = await apiClient.get<ApiResponse<EarningsCalendarEntry[]>>(
    '/api/earnings/calendar'
  );
  return unwrapResponse(data);
}
