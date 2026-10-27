import type { FinancialAccount } from '../../types';
import IssuerBadge from '../shared/IssuerBadge';
import { findIssuer } from '../shared/issuers';
import { ACCOUNT_TYPE_LABELS, isCreditType, isLoanType } from './accountConfig';
import { fmtMoney, fmtMonthYear, fmtPct, fmtShortDate, initials, timeAgo } from './format';
import { share } from './netWorthMath';

export type DetailField = 'credit_limit' | 'original_amount' | 'apr';

interface AccountRowProps {
  account: FinancialAccount;
  /** Total of the column the row sits in (assets or liabilities). */
  columnTotal: number;
  hidden: boolean;
  /** Omit for read-only rows such as the auto-synced portfolio. */
  onEdit?: (account: FinancialAccount, focus?: DetailField) => void;
  subtitleOverride?: string;
}

export default function AccountRow({
  account,
  columnTotal,
  hidden,
  onEdit,
  subtitleOverride,
}: AccountRowProps) {
  const isAsset = account.is_asset;
  const credit = isCreditType(account.account_type);
  const loan = isLoanType(account.account_type);

  const subtitle =
    subtitleOverride ??
    [
      ACCOUNT_TYPE_LABELS[account.account_type],
      !isAsset && account.apr != null ? `${account.apr}% APR` : null,
      account.last_synced
        ? `${account.is_linked ? 'synced' : 'updated'} ${timeAgo(account.last_synced)}`
        : null,
    ]
      .filter(Boolean)
      .join(' · ');

  // Credit cards show their issuer's logo when it can be recognised.
  const issuer = credit ? findIssuer(account.name, account.institution) : null;

  const main = (
    <>
      {issuer ? (
        <IssuerBadge issuer={issuer} className="h-11 w-11 rounded-xl" />
      ) : (
        <span
          className={`h-11 w-11 shrink-0 rounded-xl flex items-center justify-center text-sm font-bold ${
            isAsset
              ? 'bg-blue-50 text-[#1D4ED8] dark:bg-blue-900/30 dark:text-blue-200'
              : 'bg-orange-50 text-[#C2410C] dark:bg-orange-900/30 dark:text-orange-200'
          }`}
          aria-hidden="true"
        >
          {initials(account.institution || account.name)}
        </span>
      )}
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[15px] font-semibold text-slate-900 dark:text-slate-100">
          {account.name}
        </span>
        <span className="block truncate text-[13px] text-slate-500 dark:text-slate-400">
          {subtitle}
        </span>
      </span>
      <span className="shrink-0 text-right">
        <span
          className={`block text-[15px] font-semibold ${
            isAsset ? 'text-slate-900 dark:text-slate-100' : 'text-[#C2410C] dark:text-orange-300'
          }`}
        >
          {fmtMoney(account.balance, hidden)}
        </span>
        <span className="block text-[13px] text-slate-500 dark:text-slate-400">
          {fmtPct(share(account.balance, columnTotal))} of {isAsset ? 'assets' : 'liabilities'}
        </span>
      </span>
    </>
  );

  return (
    <li className="px-4 sm:px-5 py-3">
      {onEdit ? (
        <button
          type="button"
          onClick={() => onEdit(account)}
          aria-label={`Edit ${account.name}`}
          className="-mx-2 px-2 py-1 w-[calc(100%+1rem)] min-h-11 flex items-center gap-3.5 rounded-xl text-left hover:bg-slate-50 dark:hover:bg-slate-700/40 transition-colors focus-visible:outline-2 focus-visible:outline-[#1D4ED8]"
        >
          {main}
        </button>
      ) : (
        <div className="py-1 flex items-center gap-3.5">{main}</div>
      )}

      {(credit || loan) && onEdit && (
        <LiabilityDetail account={account} hidden={hidden} onEdit={onEdit} />
      )}
    </li>
  );
}

function LiabilityDetail({
  account,
  hidden,
  onEdit,
}: {
  account: FinancialAccount;
  hidden: boolean;
  onEdit: (account: FinancialAccount, focus?: DetailField) => void;
}) {
  const credit = isCreditType(account.account_type);
  const addLink = (field: DetailField, label: string) => (
    <button
      type="button"
      onClick={() => onEdit(account, field)}
      className="-my-3 py-3 text-[13px] font-medium text-[#1D4ED8] dark:text-blue-300 hover:underline focus-visible:outline-2 focus-visible:outline-[#1D4ED8] rounded"
    >
      {label}
    </button>
  );

  let bar: { pct: number; text: string; label: string } | null = null;
  if (credit && account.credit_limit) {
    const used = share(account.balance, account.credit_limit);
    bar = {
      pct: used,
      label: 'Credit utilization',
      text: [
        `${fmtPct(used)} of ${fmtMoney(account.credit_limit, hidden)} used`,
        account.due_date ? `due ${fmtShortDate(account.due_date)}` : null,
      ]
        .filter(Boolean)
        .join(' · '),
    };
  } else if (!credit && account.original_amount) {
    const paid = 100 - share(account.balance, account.original_amount);
    bar = {
      pct: paid,
      label: 'Paid off',
      text: [
        `${fmtPct(paid)} paid off`,
        account.payoff_date ? `payoff ${fmtMonthYear(account.payoff_date)}` : null,
      ]
        .filter(Boolean)
        .join(' · '),
    };
  }

  return (
    <div className="mt-2 pl-[58px]">
      {bar && (
        <div
          className="h-1.5 w-full overflow-hidden rounded-full bg-[#F2F4F7] dark:bg-slate-700"
          role="progressbar"
          aria-label={bar.label}
          aria-valuenow={Math.round(bar.pct)}
          aria-valuemin={0}
          aria-valuemax={100}
        >
          <div
            className={`h-full rounded-full transition-[width] duration-700 ${
              credit ? 'bg-[#F97316]' : 'bg-[#C2410C]'
            }`}
            style={{ width: `${bar.pct}%` }}
          />
        </div>
      )}
      <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1">
        {bar && <span className="text-[13px] text-slate-500 dark:text-slate-400">{bar.text}</span>}
        {!bar && credit && addLink('credit_limit', 'Add credit limit')}
        {!bar && !credit && addLink('original_amount', 'Add original amount')}
        {account.apr == null && addLink('apr', 'Add APR')}
      </div>
    </div>
  );
}
