import { useQuery } from '@tanstack/react-query';
import { getSummary, getActivity, getHistory, getSellHistory } from '../api';

export function useDashboardSummary() {
  return useQuery({
    queryKey: ['dashboard', 'summary'],
    queryFn: getSummary,
  });
}

export function useActivity() {
  return useQuery({
    queryKey: ['dashboard', 'activity'],
    queryFn: getActivity,
  });
}

export function usePortfolioHistory(days: number = 30) {
  return useQuery({
    queryKey: ['dashboard', 'history', days],
    queryFn: () => getHistory(days),
  });
}

export function useMonthlyRealizedGain() {
  return useQuery({
    queryKey: ['dashboard', 'monthly_gain_loss'],
    queryFn: getSellHistory,
  });
}
