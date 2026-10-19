import type { AccountType } from '../../types';

export const ASSET_TYPES: AccountType[] = [
  'checking',
  'savings',
  'investment',
  'real_estate',
  'vehicle',
  'other_asset',
];

export const LIABILITY_TYPES: AccountType[] = [
  'credit_card',
  'loan',
  'mortgage',
  'other_liability',
];

export const ACCOUNT_TYPE_LABELS: Record<AccountType, string> = {
  checking: 'Checking',
  savings: 'Savings',
  investment: 'Investment',
  real_estate: 'Real Estate',
  vehicle: 'Vehicle',
  other_asset: 'Other Asset',
  credit_card: 'Credit Card',
  loan: 'Loan',
  mortgage: 'Mortgage',
  other_liability: 'Other Liability',
};

export interface AccountGroupConfig {
  key: string;
  label: string;
  types: AccountType[];
  color: string;
  dotClass: string;
}

export const ACCOUNT_GROUPS: { assets: AccountGroupConfig[]; liabilities: AccountGroupConfig[] } =
  {
    assets: [
      {
        key: 'cash',
        label: 'Cash',
        types: ['checking', 'savings'],
        color: 'emerald',
        dotClass: 'bg-emerald-500',
      },
      {
        key: 'investments',
        label: 'Investments',
        types: ['investment'],
        color: 'blue',
        dotClass: 'bg-blue-500',
      },
      {
        key: 'real_estate',
        label: 'Real Estate',
        types: ['real_estate'],
        color: 'violet',
        dotClass: 'bg-violet-500',
      },
      {
        key: 'vehicles',
        label: 'Vehicles',
        types: ['vehicle'],
        color: 'orange',
        dotClass: 'bg-orange-500',
      },
      {
        key: 'other_assets',
        label: 'Other Assets',
        types: ['other_asset'],
        color: 'slate',
        dotClass: 'bg-slate-400',
      },
    ],
    liabilities: [
      {
        key: 'credit_cards',
        label: 'Credit Cards',
        types: ['credit_card'],
        color: 'red',
        dotClass: 'bg-red-500',
      },
      {
        key: 'loans',
        label: 'Loans',
        types: ['loan'],
        color: 'amber',
        dotClass: 'bg-amber-500',
      },
      {
        key: 'mortgages',
        label: 'Mortgages',
        types: ['mortgage'],
        color: 'rose',
        dotClass: 'bg-rose-500',
      },
      {
        key: 'other_liabilities',
        label: 'Other Liabilities',
        types: ['other_liability'],
        color: 'slate',
        dotClass: 'bg-slate-400',
      },
    ],
  };
