export interface EarningsCalendarEntry {
  ticker: string;
  company: string;
  date: string;
  hour: 'bmo' | 'amc' | string;
  epsEstimate: number | null;
  revenueEstimate: number | null;
}
