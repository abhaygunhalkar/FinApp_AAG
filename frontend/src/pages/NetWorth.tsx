import { useState } from 'react';
import {
  useAccounts,
  useNetWorthSummary,
  useNetWorthSnapshots,
  useDeleteAccount,
} from '../hooks/useNetWorth';
import { useDashboardSummary } from '../hooks';
import {
  AccountForm,
  AccountGroup,
  NetWorthChart,
  PlaidConnect,
  ACCOUNT_GROUPS,
} from '../components/networth';
import { LoadingSpinner } from '../components/shared';
import type { FinancialAccount } from '../types';

const fmt = (v: number) =>
  new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(v);

const fmtSigned = (v: number) =>
  (v >= 0 ? '+' : '') +
  new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(v);

export default function NetWorth() {
  const { data: accounts, isLoading } = useAccounts();
  const { data: summary } = useNetWorthSummary();
  const { data: snapshots } = useNetWorthSnapshots();
  const { data: dashboardSummary } = useDashboardSummary();
  const deleteMutation = useDeleteAccount();

  const [showForm, setShowForm] = useState(false);
  const [editingAccount, setEditingAccount] = useState<FinancialAccount | null>(null);

  const accountList = accounts ?? [];
  const snapshotList = snapshots ?? [];

  const portfolioValue = dashboardSummary?.total_portfolio_value ?? 0;
  const portfolioAccount: FinancialAccount | null =
    portfolioValue > 0
      ? {
          id: -1,
          name: 'Stock & ETF Portfolio',
          institution: 'FinApp Portfolio',
          account_type: 'investment',
          balance: portfolioValue,
          is_asset: true,
          notes: null,
          created_at: '',
          updated_at: '',
        }
      : null;

  const totalAssets = (summary?.total_assets ?? 0) + portfolioValue;
  const totalLiabilities = summary?.total_liabilities ?? 0;
  const netWorth = totalAssets - totalLiabilities;

  const prevSnapshot = snapshotList.length >= 2 ? snapshotList[snapshotList.length - 2] : null;
  const netWorthChange = prevSnapshot != null ? netWorth - prevSnapshot.net_worth : null;

  const assetsBarWidth =
    totalAssets + totalLiabilities > 0
      ? Math.max(4, Math.round((totalAssets / (totalAssets + totalLiabilities)) * 100))
      : 100;

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

  const hasAccounts = accountList.length > 0 || portfolioValue > 0;

  return (
    <div className="space-y-6">
      {/* Hero card */}
      <div className="rounded-2xl bg-gradient-to-br from-slate-800 via-slate-800 to-slate-900 p-7 text-white shadow-xl ring-1 ring-white/10">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-widest text-slate-400 mb-2">
              Net Worth
            </p>
            <p
              className={`text-5xl font-bold tabular-nums tracking-tight ${
                netWorth >= 0 ? 'text-white' : 'text-red-400'
              }`}
            >
              {fmt(netWorth)}
            </p>
            {netWorthChange !== null && (
              <p
                className={`text-sm mt-1.5 font-medium ${
                  netWorthChange >= 0 ? 'text-emerald-400' : 'text-red-400'
                }`}
              >
                {fmtSigned(netWorthChange)} since last update
              </p>
            )}
          </div>
          <button
            onClick={() => {
              setEditingAccount(null);
              setShowForm(true);
            }}
            className="shrink-0 flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold bg-white/10 hover:bg-white/20 text-white rounded-lg transition-colors"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 16 16"
              fill="currentColor"
              className="w-3.5 h-3.5"
            >
              <path d="M8.75 3.75a.75.75 0 0 0-1.5 0v3.5h-3.5a.75.75 0 0 0 0 1.5h3.5v3.5a.75.75 0 0 0 1.5 0v-3.5h3.5a.75.75 0 0 0 0-1.5h-3.5v-3.5Z" />
            </svg>
            Add Account
          </button>
        </div>

        {/* Assets vs liabilities ratio bar */}
        <div className="mt-7">
          <div className="h-2 bg-slate-700 rounded-full overflow-hidden flex gap-0.5">
            <div
              className="h-full bg-emerald-400 rounded-l-full transition-all duration-700"
              style={{ width: `${assetsBarWidth}%` }}
            />
            {totalLiabilities > 0 && (
              <div className="h-full bg-red-400 rounded-r-full flex-1" />
            )}
          </div>
          <div className="flex justify-between mt-3">
            <div>
              <p className="text-[11px] font-medium text-slate-400 uppercase tracking-wider">
                Assets
              </p>
              <p className="text-base font-bold text-emerald-400 tabular-nums mt-0.5">
                {fmt(totalAssets)}
              </p>
            </div>
            <div className="text-right">
              <p className="text-[11px] font-medium text-slate-400 uppercase tracking-wider">
                Liabilities
              </p>
              <p className="text-base font-bold text-red-400 tabular-nums mt-0.5">
                {fmt(totalLiabilities)}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Trend chart */}
      <NetWorthChart snapshots={snapshotList} />

      {/* Empty state */}
      {!hasAccounts && (
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
              Add accounts manually or connect your bank below.
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

      {/* Assets / Liabilities columns */}
      {hasAccounts && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="space-y-3">
            <h2 className="text-xs font-semibold text-slate-400 uppercase tracking-widest px-1 flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-emerald-500 inline-block" />
              Assets
              <span className="text-slate-300 dark:text-slate-500 font-bold">
                {fmt(totalAssets)}
              </span>
            </h2>
            {ACCOUNT_GROUPS.assets.map((group) => {
              const groupAccounts = accountList.filter((a) =>
                (group.types as string[]).includes(a.account_type),
              );
              const withVirtual =
                group.key === 'investments' && portfolioAccount
                  ? [portfolioAccount, ...groupAccounts]
                  : groupAccounts;
              return (
                <AccountGroup
                  key={group.key}
                  group={group}
                  accounts={withVirtual}
                  onEdit={handleEdit}
                  onDelete={handleDelete}
                />
              );
            })}
          </div>

          <div className="space-y-3">
            <h2 className="text-xs font-semibold text-slate-400 uppercase tracking-widest px-1 flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-red-500 inline-block" />
              Liabilities
              <span className="text-slate-300 dark:text-slate-500 font-bold">
                {fmt(totalLiabilities)}
              </span>
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

      {/* Connected accounts — bottom */}
      <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-5 shadow-sm">
        <div className="flex items-center gap-2 mb-4">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 20 20"
            fill="currentColor"
            className="w-4 h-4 text-slate-400"
          >
            <path
              fillRule="evenodd"
              d="M10 1a4.5 4.5 0 0 0-4.5 4.5V9H5a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-6a2 2 0 0 0-2-2h-.5V5.5A4.5 4.5 0 0 0 10 1Zm3 8V5.5a3 3 0 1 0-6 0V9h6Z"
              clipRule="evenodd"
            />
          </svg>
          <h2 className="text-xs font-semibold text-slate-400 uppercase tracking-widest">
            Connected Accounts
          </h2>
        </div>
        <PlaidConnect />
      </div>

      {showForm && <AccountForm account={editingAccount} onClose={handleCloseForm} />}
    </div>
  );
}
