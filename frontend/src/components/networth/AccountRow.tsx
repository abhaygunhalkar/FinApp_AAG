import type { FinancialAccount } from '../../types';

const fmt = (v: number) =>
  new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(v);

interface AccountRowProps {
  account: FinancialAccount;
  onEdit: (account: FinancialAccount) => void;
  onDelete: (account: FinancialAccount) => void;
}

export default function AccountRow({ account, onEdit, onDelete }: AccountRowProps) {
  return (
    <div className="group flex items-center justify-between px-4 py-3 hover:bg-slate-50 dark:hover:bg-slate-700/40 rounded-lg transition-colors">
      <div className="min-w-0">
        <p className="text-sm font-medium text-slate-800 dark:text-slate-100 truncate">
          {account.name}
        </p>
        {account.institution && (
          <p className="text-xs text-slate-400 dark:text-slate-500 truncate">
            {account.institution}
          </p>
        )}
      </div>
      <div className="flex items-center gap-2 ml-4 shrink-0">
        <span
          className={`text-sm font-semibold tabular-nums ${
            account.is_asset
              ? 'text-slate-800 dark:text-slate-100'
              : 'text-red-600 dark:text-red-400'
          }`}
        >
          {account.is_asset ? fmt(account.balance) : `−${fmt(account.balance)}`}
        </span>
        <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          <button
            onClick={() => onEdit(account)}
            className="p-1 rounded text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-600 transition-colors"
            aria-label={`Edit ${account.name}`}
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="w-3.5 h-3.5">
              <path d="M13.488 2.513a1.75 1.75 0 0 0-2.475 0L6.75 6.774a2.75 2.75 0 0 0-.596.892l-.848 2.047a.75.75 0 0 0 .98.98l2.047-.848a2.75 2.75 0 0 0 .892-.596l4.261-4.263a1.75 1.75 0 0 0 0-2.474ZM4.75 13.25a.75.75 0 0 0 0 1.5h6.5a.75.75 0 0 0 0-1.5h-6.5Z" />
            </svg>
          </button>
          <button
            onClick={() => onDelete(account)}
            className="p-1 rounded text-slate-400 hover:text-red-500 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
            aria-label={`Delete ${account.name}`}
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="w-3.5 h-3.5">
              <path fillRule="evenodd" d="M5 3.25V4H2.75a.75.75 0 0 0 0 1.5h.3l.815 8.15A1.5 1.5 0 0 0 5.357 15h5.285a1.5 1.5 0 0 0 1.493-1.35l.815-8.15h.3a.75.75 0 0 0 0-1.5H11v-.75A2.25 2.25 0 0 0 8.75 1h-1.5A2.25 2.25 0 0 0 5 3.25Zm2.25-.75a.75.75 0 0 0-.75.75V4h3v-.75a.75.75 0 0 0-.75-.75h-1.5ZM6.05 6a.75.75 0 0 1 .787.713l.275 5.5a.75.75 0 0 1-1.498.075l-.275-5.5A.75.75 0 0 1 6.05 6Zm3.9 0a.75.75 0 0 1 .712.787l-.275 5.5a.75.75 0 0 1-1.498-.075l.275-5.5a.75.75 0 0 1 .786-.712Z" clipRule="evenodd" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
}
