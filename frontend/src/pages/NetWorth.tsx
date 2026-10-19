import { useState } from 'react';
import {
  useAccounts,
  useNetWorthSummary,
  useNetWorthSnapshots,
  useDeleteAccount,
} from '../hooks/useNetWorth';
import { AccountForm, AccountGroup, NetWorthChart, ACCOUNT_GROUPS } from '../components/networth';
import { LoadingSpinner } from '../components/shared';
import type { FinancialAccount } from '../types';

const fmt = (v: number) =>
  new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(v);

function StatTile({
  label,
  value,
  valueClass,
  bgClass,
}: {
  label: string;
  value: string;
  valueClass: string;
  bgClass: string;
}) {
  return (
    <div className={`${bgClass} rounded-xl border-2 px-5 py-4 flex flex-col gap-1 shadow-sm`}>
      <span className="text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-widest">
        {label}
      </span>
      <span className={`text-2xl font-bold tabular-nums ${valueClass}`}>{value}</span>
    </div>
  );
}

export default function NetWorth() {
  const { data: accounts, isLoading } = useAccounts();
  const { data: summary } = useNetWorthSummary();
  const { data: snapshots } = useNetWorthSnapshots();
  const deleteMutation = useDeleteAccount();

  const [showForm, setShowForm] = useState(false);
  const [editingAccount, setEditingAccount] = useState<FinancialAccount | null>(null);

  const accountList = accounts ?? [];
  const snapshotList = snapshots ?? [];

  function handleEdit(account: FinancialAccount) {
    setEditingAccount(account);
    setShowForm(true);
  }

  function handleCloseForm() {
    setShowForm(false);
    setEditingAccount(null);
  }

  async function handleDelete(account: FinancialAccount) {
    if (!window.confirm(`Delete "${account.name}"? This cannot be undone.`)) return;
    await deleteMutation.mutateAsync(account.id);
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <LoadingSpinner size="lg" />
      </div>
    );
  }

  const netWorth = summary?.net_worth ?? 0;
  const totalAssets = summary?.total_assets ?? 0;
  const totalLiabilities = summary?.total_liabilities ?? 0;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Net Worth</h1>
          <p className="text-sm text-slate-400 mt-0.5">Your complete financial picture</p>
        </div>
        <button
          onClick={() => {
            setEditingAccount(null);
            setShowForm(true);
          }}
          className="inline-flex items-center gap-2 px-4 py-2.5 bg-slate-900 dark:bg-white text-white dark:text-slate-900 text-sm font-semibold rounded-lg shadow-sm hover:bg-slate-700 dark:hover:bg-slate-100 transition-colors"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 16 16"
            fill="currentColor"
            className="w-4 h-4"
          >
            <path d="M8.75 3.75a.75.75 0 0 0-1.5 0v3.5h-3.5a.75.75 0 0 0 0 1.5h3.5v3.5a.75.75 0 0 0 1.5 0v-3.5h3.5a.75.75 0 0 0 0-1.5h-3.5v-3.5Z" />
          </svg>
          Add Account
        </button>
      </div>

      {/* Summary tiles */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <StatTile
          label="Net Worth"
          value={fmt(netWorth)}
          valueClass={
            netWorth >= 0
              ? 'text-violet-700 dark:text-violet-300'
              : 'text-red-600 dark:text-red-400'
          }
          bgClass="bg-violet-100 border-violet-300 dark:bg-violet-900/30 dark:border-violet-700"
        />
        <StatTile
          label="Total Assets"
          value={fmt(totalAssets)}
          valueClass="text-emerald-700 dark:text-emerald-300"
          bgClass="bg-emerald-100 border-emerald-300 dark:bg-emerald-900/30 dark:border-emerald-700"
        />
        <StatTile
          label="Total Liabilities"
          value={fmt(totalLiabilities)}
          valueClass="text-red-600 dark:text-red-400"
          bgClass="bg-red-100 border-red-300 dark:bg-red-900/30 dark:border-red-700"
        />
      </div>

      {/* Chart */}
      <NetWorthChart snapshots={snapshotList} />

      {/* Empty state */}
      {accountList.length === 0 && (
        <div className="rounded-xl border-2 border-dashed border-slate-200 dark:border-slate-700 p-12 flex flex-col items-center gap-4 text-center">
          <div className="w-14 h-14 rounded-full bg-slate-100 dark:bg-slate-700 flex items-center justify-center">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={1.5}
              className="w-7 h-7 text-slate-400"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M12 21v-8.25M15.75 21v-8.25M8.25 21v-8.25M3 9l9-6 9 6m-1.5 12V10.332A48.36 48.36 0 0 0 12 9.75c-2.551 0-5.056.2-7.5.582V21M3 21h18M12 6.75h.008v.008H12V6.75Z"
              />
            </svg>
          </div>
          <div>
            <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">
              No accounts yet
            </p>
            <p className="text-xs text-slate-400 mt-1">
              Add your bank accounts, credit cards, loans, and other assets to track your net worth.
            </p>
          </div>
          <button
            onClick={() => setShowForm(true)}
            className="px-4 py-2 bg-slate-900 dark:bg-white text-white dark:text-slate-900 text-sm font-semibold rounded-lg hover:bg-slate-700 transition-colors"
          >
            Add your first account
          </button>
        </div>
      )}

      {/* Accounts split */}
      {accountList.length > 0 && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Assets */}
          <div className="space-y-3">
            <h2 className="text-xs font-semibold text-slate-400 uppercase tracking-widest px-1">
              Assets
            </h2>
            {ACCOUNT_GROUPS.assets.map((group) => {
              const groupAccounts = accountList.filter((a) =>
                (group.types as string[]).includes(a.account_type),
              );
              return (
                <AccountGroup
                  key={group.key}
                  group={group}
                  accounts={groupAccounts}
                  onEdit={handleEdit}
                  onDelete={handleDelete}
                />
              );
            })}
          </div>

          {/* Liabilities */}
          <div className="space-y-3">
            <h2 className="text-xs font-semibold text-slate-400 uppercase tracking-widest px-1">
              Liabilities
            </h2>
            {ACCOUNT_GROUPS.liabilities.map((group) => {
              const groupAccounts = accountList.filter((a) =>
                (group.types as string[]).includes(a.account_type),
              );
              return (
                <AccountGroup
                  key={group.key}
                  group={group}
                  accounts={groupAccounts}
                  onEdit={handleEdit}
                  onDelete={handleDelete}
                />
              );
            })}
          </div>
        </div>
      )}

      {showForm && <AccountForm account={editingAccount} onClose={handleCloseForm} />}
    </div>
  );
}
