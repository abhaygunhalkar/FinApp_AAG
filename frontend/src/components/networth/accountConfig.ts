import type { AccountType } from '../../types';

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
export const ASSET_PALETTE = ['#1D4ED8', '#93C5FD', '#3B82F6', '#BFDBFE', '#1E3A8A', '#60A5FA'];
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

export const isCreditType = (t: AccountType) => t === 'credit_card';
export const isLoanType = (t: AccountType) => t === 'loan' || t === 'mortgage';
