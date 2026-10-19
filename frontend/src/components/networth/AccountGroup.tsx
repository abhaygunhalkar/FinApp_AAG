import { useState } from 'react';
import type { FinancialAccount } from '../../types';
import type { AccountGroupConfig } from './accountConfig';
import AccountRow from './AccountRow';

const fmt = (v: number) =>
  new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(v);

const GROUP_ICONS: Record<string, React.ReactNode> = {
  cash: (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
      <path d="M1 4a1 1 0 0 1 1-1h16a1 1 0 0 1 1 1v8a1 1 0 0 1-1 1H2a1 1 0 0 1-1-1V4Zm12 4a3 3 0 1 1-6 0 3 3 0 0 1 6 0ZM4 9a1 1 0 1 0 0-2 1 1 0 0 0 0 2Zm13-1a1 1 0 1 1-2 0 1 1 0 0 1 2 0ZM1.5 14.5A2.5 2.5 0 0 1 4 12h12a2.5 2.5 0 0 1 2.5 2.5v.5H1.5v-.5Z" />
    </svg>
  ),
  investments: (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
      <path fillRule="evenodd" d="M12 7a1 1 0 1 1 0-2h5a1 1 0 0 1 1 1v5a1 1 0 1 1-2 0V8.414l-4.293 4.293a1 1 0 0 1-1.414 0L8 10.414l-4.293 4.293a1 1 0 0 1-1.414-1.414l5-5a1 1 0 0 1 1.414 0L11 10.586 14.586 7H12Z" clipRule="evenodd" />
    </svg>
  ),
  real_estate: (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
      <path d="M10.707 2.293a1 1 0 0 0-1.414 0l-7 7a1 1 0 0 0 1.414 1.414L4 10.414V17a1 1 0 0 0 1 1h2a1 1 0 0 0 1-1v-2a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1v2a1 1 0 0 0 1 1h2a1 1 0 0 0 1-1v-6.586l.293.293a1 1 0 0 0 1.414-1.414l-7-7Z" />
    </svg>
  ),
  vehicles: (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
      <path d="M6.5 3A1.5 1.5 0 0 0 5 4.5v.085A3.5 3.5 0 0 0 2 8v4.5A1.5 1.5 0 0 0 3.5 14H4v.5a1.5 1.5 0 0 0 3 0V14h6v.5a1.5 1.5 0 0 0 3 0V14h.5a1.5 1.5 0 0 0 1.5-1.5V8a3.5 3.5 0 0 0-3-3.465V4.5A1.5 1.5 0 0 0 13.5 3h-7ZM5 6h10a1.5 1.5 0 0 1 1.5 1.5v.5H3.5V7.5A1.5 1.5 0 0 1 5 6ZM4.5 10a1 1 0 1 1 0 2 1 1 0 0 1 0-2Zm11 0a1 1 0 1 1 0 2 1 1 0 0 1 0-2Z" />
    </svg>
  ),
  other_assets: (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
      <path d="M12.232 4.232a2.5 2.5 0 0 1 3.536 3.536l-1.225 1.224a.75.75 0 0 0 1.061 1.06l1.224-1.224a4 4 0 0 0-5.656-5.656l-3 3a4 4 0 0 0 .225 5.865.75.75 0 0 0 .977-1.138 2.5 2.5 0 0 1-.142-3.667l3-3Z" />
      <path d="M11.603 7.963a.75.75 0 0 0-.977 1.138 2.5 2.5 0 0 1 .142 3.667l-3 3a2.5 2.5 0 0 1-3.536-3.536l1.225-1.224a.75.75 0 0 0-1.061-1.06l-1.224 1.224a4 4 0 1 0 5.656 5.656l3-3a4 4 0 0 0-.225-5.865Z" />
    </svg>
  ),
  credit_cards: (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
      <path d="M2.5 4A1.5 1.5 0 0 0 1 5.5V6h18v-.5A1.5 1.5 0 0 0 17.5 4h-15ZM19 8.5H1v6A1.5 1.5 0 0 0 2.5 16h15a1.5 1.5 0 0 0 1.5-1.5v-6ZM3 13.25a.75.75 0 0 1 .75-.75h1.5a.75.75 0 0 1 0 1.5h-1.5a.75.75 0 0 1-.75-.75Zm4.75-.75a.75.75 0 0 0 0 1.5h3.5a.75.75 0 0 0 0-1.5h-3.5Z" />
    </svg>
  ),
  loans: (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
      <path fillRule="evenodd" d="M4.5 2A1.5 1.5 0 0 0 3 3.5v13A1.5 1.5 0 0 0 4.5 18h11a1.5 1.5 0 0 0 1.5-1.5V7.621a1.5 1.5 0 0 0-.44-1.06l-4.12-4.122A1.5 1.5 0 0 0 11.378 2H4.5Zm4.75 6.75a.75.75 0 0 1 1.5 0v2.546l.943-1.048a.75.75 0 1 1 1.114 1.004l-2.25 2.5a.75.75 0 0 1-1.114 0l-2.25-2.5a.75.75 0 1 1 1.114-1.004l.943 1.048V8.75Z" clipRule="evenodd" />
    </svg>
  ),
  mortgages: (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
      <path fillRule="evenodd" d="M9.293 2.293a1 1 0 0 1 1.414 0l7 7A1 1 0 0 1 17 11h-1v6a1 1 0 0 1-1 1h-2a1 1 0 0 1-1-1v-3a1 1 0 0 0-1-1H9a1 1 0 0 0-1 1v3a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1v-6H3a1 1 0 0 1-.707-1.707l7-7Z" clipRule="evenodd" />
    </svg>
  ),
  other_liabilities: (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
      <path fillRule="evenodd" d="M10 18a8 8 0 1 0 0-16 8 8 0 0 0 0 16ZM8.28 7.22a.75.75 0 0 0-1.06 1.06L8.94 10l-1.72 1.72a.75.75 0 1 0 1.06 1.06L10 11.06l1.72 1.72a.75.75 0 1 0 1.06-1.06L11.06 10l1.72-1.72a.75.75 0 0 0-1.06-1.06L10 8.94 8.28 7.22Z" clipRule="evenodd" />
    </svg>
  ),
};

const GROUP_ICON_COLORS: Record<string, string> = {
  cash: 'bg-emerald-100 text-emerald-600 dark:bg-emerald-900/40 dark:text-emerald-400',
  investments: 'bg-blue-100 text-blue-600 dark:bg-blue-900/40 dark:text-blue-400',
  real_estate: 'bg-violet-100 text-violet-600 dark:bg-violet-900/40 dark:text-violet-400',
  vehicles: 'bg-orange-100 text-orange-600 dark:bg-orange-900/40 dark:text-orange-400',
  other_assets: 'bg-slate-100 text-slate-500 dark:bg-slate-700 dark:text-slate-400',
  credit_cards: 'bg-red-100 text-red-600 dark:bg-red-900/40 dark:text-red-400',
  loans: 'bg-amber-100 text-amber-600 dark:bg-amber-900/40 dark:text-amber-400',
  mortgages: 'bg-rose-100 text-rose-600 dark:bg-rose-900/40 dark:text-rose-400',
  other_liabilities: 'bg-slate-100 text-slate-500 dark:bg-slate-700 dark:text-slate-400',
};

interface AccountGroupProps {
  group: AccountGroupConfig;
  accounts: FinancialAccount[];
  onEdit: (account: FinancialAccount) => void;
  onDelete: (account: FinancialAccount) => void;
}

export default function AccountGroup({ group, accounts, onEdit, onDelete }: AccountGroupProps) {
  const [expanded, setExpanded] = useState(true);

  if (accounts.length === 0) return null;

  const total = accounts.reduce((s, a) => s + a.balance, 0);
  const isLiability = !accounts[0]?.is_asset;
  const icon = GROUP_ICONS[group.key];
  const iconColor = GROUP_ICON_COLORS[group.key] ?? GROUP_ICON_COLORS.other_assets;

  return (
    <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 overflow-hidden shadow-sm">
      <button
        onClick={() => setExpanded((v) => !v)}
        className="w-full flex items-center justify-between px-4 py-3.5 hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors"
      >
        <div className="flex items-center gap-3">
          <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${iconColor}`}>
            {icon}
          </div>
          <div className="text-left">
            <span className="text-sm font-semibold text-slate-700 dark:text-slate-200">
              {group.label}
            </span>
            <span className="ml-2 text-xs text-slate-400 bg-slate-100 dark:bg-slate-700 px-1.5 py-0.5 rounded-full">
              {accounts.length}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-2.5">
          <span
            className={`text-sm font-bold tabular-nums ${
              isLiability
                ? 'text-red-600 dark:text-red-400'
                : 'text-slate-800 dark:text-slate-100'
            }`}
          >
            {isLiability ? `−${fmt(total)}` : fmt(total)}
          </span>
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 16 16"
            fill="currentColor"
            className={`w-4 h-4 text-slate-400 transition-transform ${expanded ? 'rotate-180' : ''}`}
          >
            <path
              fillRule="evenodd"
              d="M4.22 6.22a.75.75 0 0 1 1.06 0L8 8.94l2.72-2.72a.75.75 0 1 1 1.06 1.06l-3.25 3.25a.75.75 0 0 1-1.06 0L4.22 7.28a.75.75 0 0 1 0-1.06Z"
              clipRule="evenodd"
            />
          </svg>
        </div>
      </button>

      {expanded && (
        <div className="border-t border-slate-100 dark:border-slate-700/60 divide-y divide-slate-100 dark:divide-slate-700/40">
          {accounts.map((account) => (
            <AccountRow key={account.id} account={account} onEdit={onEdit} onDelete={onDelete} />
          ))}
        </div>
      )}
    </div>
  );
}
