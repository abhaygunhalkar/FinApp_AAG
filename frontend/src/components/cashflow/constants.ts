import type { IncomeCategory } from '../../types';

export const INCOME_CATEGORIES: { name: IncomeCategory; color: string }[] = [
  { name: 'Salary', color: '#047857' },
  { name: 'Bonus', color: '#0d9488' },
  { name: 'Rental income', color: '#1d4ed8' },
  { name: 'Side income', color: '#7c3aed' },
  { name: 'Dividends & interest', color: '#0891b2' },
  { name: 'Benefits & pension', color: '#b45309' },
  { name: 'Other', color: '#64748b' },
];

export function incomeColor(name: string): string {
  return INCOME_CATEGORIES.find((c) => c.name === name)?.color ?? '#64748b';
}

/** Common emergency-fund guidance: 3 to 6 months of essential costs. */
export const EMERGENCY_TARGET_MIN = 3;
export const EMERGENCY_TARGET_MAX = 6;
