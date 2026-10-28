import { useMemo, useState } from 'react';
import {
  useAccounts,
  useDeleteAccount,
  useNetWorthSnapshots,
  useNetWorthSummary,
  usePlaidConnectFlow,
  usePlaidItems,
} from '../hooks';
import {
  ASSET_CATEGORIES,
  ASSET_PALETTE,
  LIABILITY_CATEGORIES,
  LIABILITY_PALETTE,
  LIQUID_TYPES,
  AccountForm,
  AccountsCard,
  BreakdownCard,
  ConnectCard,
  HomeEquityCard,
  NetWorthHeader,
  NetWorthHero,
  breakdown,
  timeAgo,
  type AccountFormDefaults,
  type AddAction,
  type DetailField,
} from '../components/networth';
import { LoadingSpinner } from '../components/shared';
import { useUIStore } from '../store/uiStore';
import type { FinancialAccount } from '../types';

interface FormState {
  account: FinancialAccount | null;
  defaults?: AccountFormDefaults;
  focus?: DetailField;
}

const ADD_DEFAULTS: Record<Exclude<AddAction, 'connect'>, AccountFormDefaults> = {
  manual: { account_type: 'checking' },
  property: { account_type: 'real_estate', name: 'Home' },
  vehicle: { account_type: 'vehicle' },
  crypto: { account_type: 'crypto' },
};

const PORTFOLIO_ID = -1;

export default function NetWorth() {
  const { data: accounts, isLoading: accountsLoading } = useAccounts();
  const { data: summary, isLoading: summaryLoading } = useNetWorthSummary();
  const { data: snapshots } = useNetWorthSnapshots();
  const { data: plaidItems } = usePlaidItems();
  const deleteMutation = useDeleteAccount();
  const plaid = usePlaidConnectFlow();
  const hidden = useUIStore((s) => s.hideBalances);
  const toggleHidden = useUIStore((s) => s.toggleHideBalances);

  const [form, setForm] = useState<FormState | null>(null);

  const accountList = useMemo(() => accounts ?? [], [accounts]);
  const portfolioValue = summary?.portfolio_value ?? 0;

  // Holdings from the Stocks/ETFs pages, shown as a read-only investment row.
  const portfolioAccount = useMemo<FinancialAccount | null>(
    () =>
      portfolioValue > 0
        ? {
            id: PORTFOLIO_ID,
            name: 'Stock & ETF portfolio',
            institution: 'Portfolio',
            account_type: 'investment',
            balance: portfolioValue,
            is_asset: true,
            is_linked: true,
            last_synced: null,
            notes: null,
            created_at: '',
            updated_at: '',
          }
        : null,
    [portfolioValue],
  );

  const assetAccounts = useMemo(
    () => [
      ...(portfolioAccount ? [portfolioAccount] : []),
      ...accountList.filter((a) => a.is_asset),
    ],
    [accountList, portfolioAccount],
  );
  const liabilityAccounts = useMemo(() => accountList.filter((a) => !a.is_asset), [accountList]);

  const totalAssets = summary?.total_assets ?? 0;
  const totalLiabilities = summary?.total_liabilities ?? 0;
  const netWorth = summary?.net_worth ?? 0;
  const liquidCash = accountList
    .filter((a) => LIQUID_TYPES.includes(a.account_type))
    .reduce((s, a) => s + a.balance, 0);

  const showHomeEquity =
    accountList.some((a) => a.account_type === 'mortgage') &&
    !accountList.some((a) => a.account_type === 'real_estate');

  const subtitle = useMemo(() => {
    const count = accountList.length + (portfolioAccount ? 1 : 0);
    if (count === 0) return 'No accounts yet';
    const syncTimes = (plaidItems ?? []).map((i) => i.last_synced).filter((t): t is string => !!t);
    const latest = (times: string[]) => times.reduce((a, b) => (a > b ? a : b));
    const freshness = syncTimes.length
      ? `last synced ${timeAgo(latest(syncTimes))}`
      : accountList.length
        ? `updated ${timeAgo(latest(accountList.map((a) => a.updated_at)))}`
        : 'prices update automatically';
    return `${count} account${count === 1 ? '' : 's'} · ${freshness}`;
  }, [accountList, portfolioAccount, plaidItems]);

  function handleAdd(action: AddAction) {
    if (action === 'connect') {
      void plaid.start();
    } else {
      setForm({ account: null, defaults: ADD_DEFAULTS[action] });
    }
  }

  function handleEdit(account: FinancialAccount, focus?: DetailField) {
    setForm({ account, focus });
  }

  async function handleDelete(account: FinancialAccount) {
    if (!window.confirm(`Delete "${account.name}"? This cannot be undone.`)) return;
    await deleteMutation.mutateAsync(account.id);
    setForm(null);
  }

  if (accountsLoading || summaryLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <LoadingSpinner size="lg" />
      </div>
    );
  }

  return (
    <div
      className="-m-6 min-h-[calc(100%+3rem)] bg-[#F4F5F7] dark:bg-slate-900 px-4 py-6 sm:p-6 lg:p-8"
      style={{
        fontFamily: "'Inter', ui-sans-serif, system-ui, -apple-system, 'Segoe UI', sans-serif",
        fontFeatureSettings: "'tnum'",
      }}
    >
      <div className="mx-auto max-w-[1240px] space-y-6">
        <NetWorthHeader
          subtitle={subtitle}
          hidden={hidden}
          onToggleHidden={toggleHidden}
          onAdd={handleAdd}
          connectBusy={plaid.isBusy}
        />

        <NetWorthHero
          netWorth={netWorth}
          totalAssets={totalAssets}
          totalLiabilities={totalLiabilities}
          liquidCash={liquidCash}
          snapshots={snapshots ?? []}
          accounts={accountList}
          hidden={hidden}
          ready={!!summary}
        />

        <div
          className={`grid grid-cols-1 gap-6 md:grid-cols-2 ${showHomeEquity ? 'xl:grid-cols-3' : ''}`}
        >
          <BreakdownCard
            title="What you own"
            total={totalAssets}
            segments={breakdown(assetAccounts, ASSET_CATEGORIES, ASSET_PALETTE)}
            hidden={hidden}
            emptyText="Add an account to see how your assets break down."
          />
          <BreakdownCard
            title="What you owe"
            total={totalLiabilities}
            segments={breakdown(liabilityAccounts, LIABILITY_CATEGORIES, LIABILITY_PALETTE)}
            hidden={hidden}
            emptyText="No debts tracked — nice."
          />
          {showHomeEquity && (
            <HomeEquityCard
              onAddProperty={() => setForm({ account: null, defaults: ADD_DEFAULTS.property })}
            />
          )}
        </div>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2 lg:items-start">
          <AccountsCard
            title="Assets"
            dotColor="#1D4ED8"
            total={totalAssets}
            categories={ASSET_CATEGORIES}
            accounts={accountList.filter((a) => a.is_asset)}
            extraRows={
              portfolioAccount
                ? [
                    {
                      categoryKey: 'investments',
                      account: portfolioAccount,
                      subtitle: 'Stocks & ETFs · live prices',
                    },
                  ]
                : []
            }
            hidden={hidden}
            onEdit={handleEdit}
            emptyText="No assets yet."
            footer={
              <button
                type="button"
                onClick={() =>
                  setForm({ account: null, defaults: { account_type: 'real_estate' } })
                }
                className="w-full min-h-14 px-4 sm:px-5 flex items-center gap-3.5 border-t border-[#E4E7EC] dark:border-slate-700 text-left text-sm font-semibold text-[#1D4ED8] dark:text-blue-300 hover:bg-slate-50 dark:hover:bg-slate-700/40 transition-colors focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[#1D4ED8]"
              >
                <span
                  className="h-11 w-11 shrink-0 rounded-xl border-2 border-dashed border-[#BFD3F5] dark:border-blue-800 flex items-center justify-center"
                  aria-hidden="true"
                >
                  +
                </span>
                Add property, vehicle or crypto
              </button>
            }
          />
          <AccountsCard
            title="Liabilities"
            dotColor="#C2410C"
            total={totalLiabilities}
            categories={LIABILITY_CATEGORIES}
            accounts={liabilityAccounts}
            hidden={hidden}
            onEdit={handleEdit}
            emptyText="No liabilities tracked."
          />
        </div>

        <ConnectCard plaid={plaid} />
      </div>

      {form && (
        <AccountForm
          key={form.account?.id ?? `new-${form.defaults?.account_type}`}
          account={form.account}
          defaults={form.defaults}
          focusField={form.focus}
          onClose={() => setForm(null)}
          onDelete={handleDelete}
        />
      )}
    </div>
  );
}
