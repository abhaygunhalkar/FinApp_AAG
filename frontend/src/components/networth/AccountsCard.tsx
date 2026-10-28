import type { ReactNode } from 'react';
import type { FinancialAccount } from '../../types';
import type { CategoryConfig } from './accountConfig';
import AccountRow, { type DetailField } from './AccountRow';
import { isCreditType } from './accountConfig';
import { fmtMoney, fmtPct } from './format';
import { share } from './netWorthMath';

interface AccountsCardProps {
  title: string;
  dotColor: string;
  total: number;
  categories: CategoryConfig[];
  accounts: FinancialAccount[];
  hidden: boolean;
  onEdit: (account: FinancialAccount, focus?: DetailField) => void;
  /** Read-only rows (e.g. the auto-synced portfolio), keyed into a category. */
  extraRows?: { categoryKey: string; account: FinancialAccount; subtitle: string }[];
  emptyText: string;
  footer?: ReactNode;
}

/** One column of accounts; every category is always expanded. */
export default function AccountsCard({
  title,
  dotColor,
  total,
  categories,
  accounts,
  hidden,
  onEdit,
  extraRows = [],
  emptyText,
  footer,
}: AccountsCardProps) {
  const groups = categories
    .map((c) => ({
      category: c,
      extras: extraRows.filter((r) => r.categoryKey === c.key),
      accounts: accounts
        .filter((a) => c.types.includes(a.account_type))
        .sort((a, b) => b.balance - a.balance),
    }))
    .filter((g) => g.accounts.length + g.extras.length > 0);
  const showGroupLabels = groups.length > 1;

  // Tag the card with the highest APR when there are cards to compare.
  const cards = accounts.filter((a) => isCreditType(a.account_type) && a.apr != null);
  const topApr = cards.length > 1 ? cards.reduce((a, b) => (b.apr! > a.apr! ? b : a)) : null;
  const highestAprId = topApr && topApr.balance > 0 ? topApr.id : null;

  return (
    <section className="rounded-[20px] border border-[#E4E7EC] dark:border-slate-700 bg-white dark:bg-slate-800 overflow-hidden">
      <header className="flex items-center justify-between gap-3 px-4 sm:px-5 py-4 border-b border-[#E4E7EC] dark:border-slate-700">
        <h2 className="flex items-center gap-2.5 text-base font-semibold text-slate-900 dark:text-slate-100">
          <span
            className="h-2.5 w-2.5 rounded-full"
            style={{ backgroundColor: dotColor }}
            aria-hidden="true"
          />
          {title}
        </h2>
        <span className="text-base font-semibold text-slate-900 dark:text-slate-100">
          {fmtMoney(total, hidden)}
        </span>
      </header>

      {groups.length === 0 ? (
        <p className="px-5 py-6 text-sm text-slate-500 dark:text-slate-400">{emptyText}</p>
      ) : (
        groups.map((g) => (
          <div
            key={g.category.key}
            className="border-b border-[#F2F4F7] dark:border-slate-700/60 last:border-b-0"
          >
            {showGroupLabels && (
              <h3 className="px-4 sm:px-5 pt-3 text-xs font-semibold uppercase tracking-[0.1em] text-slate-500 dark:text-slate-400">
                {g.category.label}
              </h3>
            )}
            {g.category.key === 'credit_cards' && (
              <CreditSummary accounts={g.accounts} hidden={hidden} />
            )}
            <ul>
              {g.extras.map((r) => (
                <AccountRow
                  key={`extra-${r.account.id}`}
                  account={r.account}
                  columnTotal={total}
                  hidden={hidden}
                  subtitleOverride={r.subtitle}
                />
              ))}
              {g.accounts.map((a) => (
                <AccountRow
                  key={a.id}
                  account={a}
                  columnTotal={total}
                  hidden={hidden}
                  onEdit={onEdit}
                  highestApr={a.id === highestAprId}
                />
              ))}
            </ul>
          </div>
        ))
      )}

      {footer}
    </section>
  );
}

/** Balance against the combined limit of the cards that have one. */
function CreditSummary({ accounts, hidden }: { accounts: FinancialAccount[]; hidden: boolean }) {
  const withLimit = accounts.filter((a) => a.credit_limit);
  if (withLimit.length === 0) return null;
  const balance = withLimit.reduce((s, a) => s + a.balance, 0);
  const limit = withLimit.reduce((s, a) => s + (a.credit_limit ?? 0), 0);
  const used = share(balance, limit);
  return (
    <div className="px-4 sm:px-5 pt-1.5 pb-1">
      <p className="text-[13px] text-slate-500 dark:text-slate-400">
        {fmtMoney(balance, hidden)} of {fmtMoney(limit, hidden)} limit · {fmtPct(used)} utilization
      </p>
      <div
        className="mt-1.5 h-1 w-full overflow-hidden rounded-full bg-[#F2F4F7] dark:bg-slate-700"
        role="progressbar"
        aria-label="Total credit utilization"
        aria-valuenow={Math.round(used)}
        aria-valuemin={0}
        aria-valuemax={100}
      >
        <div className="h-full rounded-full bg-[#F97316]" style={{ width: `${used}%` }} />
      </div>
    </div>
  );
}
