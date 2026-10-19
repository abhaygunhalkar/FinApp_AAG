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

  return (
    <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 overflow-hidden shadow-sm">
      <button
        onClick={() => setExpanded((v) => !v)}
        className="w-full flex items-center justify-between px-4 py-3 hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors"
      >
        <div className="flex items-center gap-2.5">
          <span className={`w-2.5 h-2.5 rounded-full ${group.dotClass} shrink-0`} />
          <span className="text-sm font-semibold text-slate-700 dark:text-slate-200">
            {group.label}
          </span>
          <span className="text-xs text-slate-400 bg-slate-100 dark:bg-slate-700 px-1.5 py-0.5 rounded-full">
            {accounts.length}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <span
            className={`text-sm font-bold tabular-nums ${
              isLiability ? 'text-red-600 dark:text-red-400' : 'text-slate-700 dark:text-slate-200'
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
