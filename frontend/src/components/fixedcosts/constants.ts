import type { ExpenseCategory, ExpenseFrequency } from '../../types';
import { parseLocalDateString } from '../../utils/date';

/** Categories in display order, each with its chart/chip colour. */
export const CATEGORIES: { name: ExpenseCategory; color: string }[] = [
  { name: 'Housing', color: '#1d4ed8' },
  { name: 'Utilities', color: '#0891b2' },
  { name: 'Transportation', color: '#d97706' },
  { name: 'Auto loans', color: '#92400e' },
  { name: 'Insurance', color: '#7c3aed' },
  { name: 'Health & fitness', color: '#ea580c' },
  { name: 'Subscriptions', color: '#db2777' },
  { name: 'Debt payments', color: '#991b1b' },
  { name: 'Childcare & education', color: '#059669' },
  { name: 'Kids activities', color: '#65a30d' },
  { name: 'Savings & investing', color: '#0f766e' },
  { name: 'Charity & social service', color: '#4338ca' },
  { name: 'Other', color: '#64748b' },
];

export const FREQUENCIES: { value: ExpenseFrequency; label: string }[] = [
  { value: 'weekly', label: 'Weekly' },
  { value: 'biweekly', label: 'Every 2 weeks' },
  { value: 'monthly', label: 'Monthly' },
  { value: 'quarterly', label: 'Quarterly' },
  { value: 'semiannual', label: 'Every 6 months' },
  { value: 'annual', label: 'Yearly' },
];

/** Occurrences per month; mirrors MONTHLY_FACTOR in the backend service. */
export const MONTHLY_FACTOR: Record<ExpenseFrequency, number> = {
  weekly: 52 / 12,
  biweekly: 26 / 12,
  monthly: 1,
  quarterly: 1 / 3,
  semiannual: 1 / 6,
  annual: 1 / 12,
};

/** Bills due within this many days count as "coming up". */
export const DUE_SOON_DAYS = 14;

export function categoryColor(name: string): string {
  return CATEGORIES.find((c) => c.name === name)?.color ?? '#64748b';
}

export function frequencyLabel(value: string): string {
  return FREQUENCIES.find((f) => f.value === value)?.label ?? value;
}

export function fmtUSD(v: number): string {
  return v.toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
  });
}

/** Whole days from `today` (local midnight) to the ISO date; null when no date. */
export function daysUntil(iso: string | null, today: Date = new Date()): number | null {
  if (!iso) return null;
  const start = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  // parseLocalDateString returns local noon, so flooring gives whole days (DST-safe).
  return Math.floor((parseLocalDateString(iso).getTime() - start.getTime()) / 86_400_000);
}
