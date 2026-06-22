import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import * as api from '../api/options';

export function useOptions() {
  return useQuery({ queryKey: ['options', 'list'], queryFn: api.getOptions });
}

export function useOptionsSummary() {
  return useQuery({ queryKey: ['options', 'summary'], queryFn: api.getOptionsSummary });
}

export function useOpenTradeQuotes() {
  return useQuery({ queryKey: ['options', 'quotes'], queryFn: api.getOpenTradeQuotes });
}

export function useCreateOption() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: api.createOption,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['options'] }),
  });
}

export function useUpdateOption() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, payload }: { id: number; payload: any }) => api.updateOption(id, payload),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['options'] }),
  });
}

export function useDeleteOption() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => api.deleteOption(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['options'] }),
  });
}
