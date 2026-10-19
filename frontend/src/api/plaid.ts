import type { ApiResponse, PlaidItemInfo } from '../types';
import apiClient, { unwrapResponse } from './client';

export async function createLinkToken(): Promise<string> {
  const { data } =
    await apiClient.post<ApiResponse<{ link_token: string }>>('/api/plaid/link-token');
  const result = unwrapResponse(data);
  return result.link_token;
}

export async function exchangePublicToken(
  publicToken: string,
): Promise<{ item_id: string; institution_name: string; accounts_synced: number }> {
  const { data } = await apiClient.post<
    ApiResponse<{ item_id: string; institution_name: string; accounts_synced: number }>
  >('/api/plaid/exchange-token', { public_token: publicToken });
  return unwrapResponse(data);
}

export async function getPlaidItems(): Promise<PlaidItemInfo[]> {
  const { data } = await apiClient.get<ApiResponse<PlaidItemInfo[]>>('/api/plaid/items');
  return unwrapResponse(data);
}

export async function syncPlaid(): Promise<{ items_synced: number; accounts_updated: number }> {
  const { data } =
    await apiClient.post<ApiResponse<{ items_synced: number; accounts_updated: number }>>(
      '/api/plaid/sync',
    );
  return unwrapResponse(data);
}

export async function disconnectPlaidItem(itemId: string): Promise<null> {
  const { data } = await apiClient.delete<ApiResponse<null>>(`/api/plaid/items/${itemId}`);
  return unwrapResponse(data);
}
