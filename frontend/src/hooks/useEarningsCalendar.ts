import { useQuery } from '@tanstack/react-query';
import { getEarningsCalendar } from '../api/earnings';

export function useEarningsCalendar() {
  return useQuery({
    queryKey: ['earnings', 'calendar'],
    queryFn: getEarningsCalendar,
  });
}
