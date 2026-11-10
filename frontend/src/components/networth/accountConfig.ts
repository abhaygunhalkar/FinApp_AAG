import type { AccountType, FinancialAccount } from '../../types';
import { staleDays } from './format';

export const ASSET_TYPES: AccountType[] = [
  'checking',
  'savings',
  'investment',
  'real_estate',
  'vehicle',
  'crypto',
  'other_asset',
];

export const LIABILITY_TYPES: AccountType[] = [
  'credit_card',
  'loan',
  'mortgage',
  'other_liability',
];

export const LIQUID_TYPES: AccountType[] = ['checking', 'savings'];

export const ACCOUNT_TYPE_LABELS: Record<AccountType, string> = {
  checking: 'Checking',
  savings: 'Savings',
  investment: 'Investment',
  real_estate: 'Real Estate',
  vehicle: 'Vehicle',
  crypto: 'Crypto',
  other_asset: 'Other Asset',
  credit_card: 'Credit Card',
  loan: 'Loan',
  mortgage: 'Mortgage',
  other_liability: 'Other Liability',
};

export interface CategoryConfig {
  key: string;
  label: string;
  types: AccountType[];
}

/**
 * Breakdown palettes, applied by rank (largest category first). Dark and light
 * shades alternate so neighbouring segments always stay distinguishable.
 */
export const ASSET_PALETTE = [
  'var(--color-accent-700)',
  'var(--color-accent-300)',
  'var(--color-accent-500)',
  'var(--color-accent-200)',
  'var(--color-accent-900)',
  'var(--color-accent-400)',
];
export const LIABILITY_PALETTE = ['#C2410C', '#FDBA74', '#F97316', '#FED7AA'];

/** Categories for the breakdown bars and the account list grouping. */
export const ASSET_CATEGORIES: CategoryConfig[] = [
  { key: 'investments', label: 'Investments', types: ['investment'] },
  { key: 'cash', label: 'Cash', types: ['checking', 'savings'] },
  { key: 'real_estate', label: 'Real estate', types: ['real_estate'] },
  { key: 'vehicles', label: 'Vehicles', types: ['vehicle'] },
  { key: 'crypto', label: 'Crypto', types: ['crypto'] },
  { key: 'other_assets', label: 'Other', types: ['other_asset'] },
];

export const LIABILITY_CATEGORIES: CategoryConfig[] = [
  { key: 'mortgages', label: 'Mortgage', types: ['mortgage'] },
  { key: 'loans', label: 'Loans', types: ['loan'] },
  { key: 'credit_cards', label: 'Credit cards', types: ['credit_card'] },
  { key: 'other_liabilities', label: 'Other', types: ['other_liability'] },
];

/** Days before a balance counts as out of date. Cash and cards move daily;
    loans slowly; a home or car value hardly at all. */
export const STALE_AFTER_DAYS: Record<AccountType, number> = {
  checking: 7,
  savings: 7,
  credit_card: 7,
  crypto: 7,
  investment: 30,
  loan: 30,
  mortgage: 30,
  other_asset: 30,
  other_liability: 30,
  real_estate: 90,
  vehicle: 90,
};

/** Days since the account was updated, when that's past its type's limit; else null. */
export function accountStaleDays(account: FinancialAccount, now = Date.now()): number | null {
  return staleDays(account.last_synced, STALE_AFTER_DAYS[account.account_type], now);
}

export const isCreditType = (t: AccountType) => t === 'credit_card';
export const isLoanType = (t: AccountType) => t === 'loan' || t === 'mortgage';
