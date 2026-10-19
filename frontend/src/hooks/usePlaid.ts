import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { disconnectPlaidItem, exchangePublicToken, getPlaidItems, syncPlaid } from '../api/plaid';

export function usePlaidItems() {
  return useQuery({
    queryKey: ['plaid', 'items'],
    queryFn: getPlaidItems,
  });
}

export function useConnectPlaid(onSuccess?: () => void) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (publicToken: string) => exchangePublicToken(publicToken),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['net-worth'] });
      queryClient.invalidateQueries({ queryKey: ['plaid'] });
      onSuccess?.();
    },
  });
}

export function useSyncPlaid() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: syncPlaid,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['net-worth'] });
      queryClient.invalidateQueries({ queryKey: ['plaid'] });
    },
  });
}

export function useDisconnectPlaid() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (itemId: string) => disconnectPlaidItem(itemId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['net-worth'] });
      queryClient.invalidateQueries({ queryKey: ['plaid'] });
    },
  });
}
