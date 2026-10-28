import type { FinancialAccount } from '../../types';
import IssuerBadge from '../shared/IssuerBadge';
import { findIssuer } from '../shared/issuers';
import { ACCOUNT_TYPE_LABELS, isCreditType, isLoanType } from './accountConfig';
import { fmtMoney, fmtMonthYear, fmtPct, fmtShortDate, initials, staleDays } from './format';
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
  /** Tag this credit card as the one with the highest APR. */
  highestApr?: boolean;
}

export default function AccountRow({
  account,
  columnTotal,
  hidden,
  onEdit,
  subtitleOverride,
  highestApr = false,
}: AccountRowProps) {
  const isAsset = account.is_asset;
  const credit = isCreditType(account.account_type);
  const loan = isLoanType(account.account_type);

  // Freshness is in the page header; a row only says so when it's stale.
  const stale = subtitleOverride ? null : staleDays(account.last_synced);

  if (credit && onEdit) {
    return (
      <CreditCardRow
        account={account}
        hidden={hidden}
        onEdit={onEdit}
        stale={stale}
        highestApr={highestApr}
      />
    );
  }

  const subtitle =
    subtitleOverride ??
    [
      ACCOUNT_TYPE_LABELS[account.account_type],
      !isAsset && account.apr != null ? `${account.apr}% APR` : null,
    ]
      .filter(Boolean)
      .join(' · ');

  const main = (
    <>
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
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[15px] font-semibold text-slate-900 dark:text-slate-100">
          {account.name}
        </span>
        <span className="block truncate text-[13px] text-slate-500 dark:text-slate-400">
          {subtitle}
          {stale !== null && <StaleNote days={stale} />}
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

      {loan && onEdit && <LiabilityDetail account={account} onEdit={onEdit} />}
    </li>
  );
}

function StaleNote({ days }: { days: number }) {
  return (
    <>
      {' · '}
      <span className="text-[#B45309] dark:text-amber-400">updated {days} days ago</span>
    </>
  );
}

/** A credit card on one line: badge, name, APR and due date, utilization, balance. */
function CreditCardRow({
  account,
  hidden,
  onEdit,
  stale,
  highestApr,
}: {
  account: FinancialAccount;
  hidden: boolean;
  onEdit: (account: FinancialAccount, focus?: DetailField) => void;
  stale: number | null;
  highestApr: boolean;
}) {
  const issuer = findIssuer(account.name, account.institution);
  const used = account.credit_limit ? share(account.balance, account.credit_limit) : null;
  const meta = [
    account.apr != null ? `${account.apr}% APR` : null,
    account.due_date ? `due ${fmtShortDate(account.due_date)}` : null,
  ]
    .filter(Boolean)
    .join(' · ');
  const missing: [DetailField, string][] = [];
  if (!account.credit_limit) missing.push(['credit_limit', 'Add credit limit']);
  if (account.apr == null) missing.push(['apr', 'Add APR']);

  return (
    <li className="px-4 sm:px-5 py-1">
      <button
        type="button"
        onClick={() => onEdit(account)}
        aria-label={`Edit ${account.name}`}
        className="-mx-2 px-2 py-1 w-[calc(100%+1rem)] min-h-11 flex items-center gap-3 rounded-xl text-left hover:bg-slate-50 dark:hover:bg-slate-700/40 transition-colors focus-visible:outline-2 focus-visible:outline-[#1D4ED8]"
      >
        {issuer ? (
          <IssuerBadge issuer={issuer} className="h-8 w-8 rounded-lg" />
        ) : (
          <span
            className="h-8 w-8 shrink-0 rounded-lg flex items-center justify-center text-xs font-bold bg-orange-50 text-[#C2410C] dark:bg-orange-900/30 dark:text-orange-200"
            aria-hidden="true"
          >
            {initials(account.institution || account.name)}
          </span>
        )}
        <span className="min-w-0 flex-1 flex flex-col sm:flex-row sm:items-center sm:gap-2">
          <span
            title={account.name}
            className="min-w-0 truncate text-[15px] font-semibold text-slate-900 dark:text-slate-100"
          >
            {account.name}
          </span>
          {(meta || stale !== null || highestApr) && (
            <span className="min-w-0 flex items-center gap-2 sm:shrink-0">
              {(meta || stale !== null) && (
                <span className="min-w-0 truncate text-[13px] text-slate-500 dark:text-slate-400">
                  {meta}
                  {stale !== null &&
                    (meta ? (
                      <StaleNote days={stale} />
                    ) : (
                      <span className="text-[#B45309] dark:text-amber-400">
                        updated {stale} days ago
                      </span>
                    ))}
                </span>
              )}
              {highestApr && (
                <span className="shrink-0 rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-800 dark:bg-amber-900/40 dark:text-amber-300">
                  highest APR
                </span>
              )}
            </span>
          )}
        </span>
        <span className="shrink-0 flex flex-col items-end gap-1 sm:flex-row sm:items-center sm:gap-3">
          <span className="text-[15px] font-semibold text-[#C2410C] dark:text-orange-300 sm:order-2 sm:min-w-[72px] sm:text-right">
            {fmtMoney(account.balance, hidden)}
          </span>
          {used !== null && (
            <span className="flex items-center gap-1.5 sm:order-1">
              <span
                className="h-1.5 w-[60px] overflow-hidden rounded-full bg-[#F2F4F7] dark:bg-slate-700"
                role="progressbar"
                aria-label="Credit utilization"
                aria-valuenow={Math.round(used)}
                aria-valuemin={0}
                aria-valuemax={100}
              >
                <span
                  className="block h-full rounded-full bg-[#F97316]"
                  style={{ width: `${used}%` }}
                />
              </span>
              <span className="w-8 text-right text-[12px] text-slate-500 dark:text-slate-400">
                {fmtPct(used)}
              </span>
            </span>
          )}
        </span>
      </button>
      {missing.length > 0 && (
        <div className="pl-11 flex flex-wrap gap-x-3">
          {missing.map(([field, label]) => (
            <button
              key={field}
              type="button"
              onClick={() => onEdit(account, field)}
              className="py-1 text-[13px] font-medium text-[#1D4ED8] dark:text-blue-300 hover:underline focus-visible:outline-2 focus-visible:outline-[#1D4ED8] rounded"
            >
              {label}
            </button>
          ))}
        </div>
      )}
    </li>
  );
}

/** Loans and mortgages: how much is paid off, or a prompt for the missing details. */
function LiabilityDetail({
  account,
  onEdit,
}: {
  account: FinancialAccount;
  onEdit: (account: FinancialAccount, focus?: DetailField) => void;
}) {
  const addLink = (field: DetailField, label: string) => (
    <button
      type="button"
      onClick={() => onEdit(account, field)}
      className="-my-3 py-3 text-[13px] font-medium text-[#1D4ED8] dark:text-blue-300 hover:underline focus-visible:outline-2 focus-visible:outline-[#1D4ED8] rounded"
    >
      {label}
    </button>
  );

  const paid = account.original_amount
    ? 100 - share(account.balance, account.original_amount)
    : null;
  const text =
    paid === null
      ? null
      : [
          `${fmtPct(paid)} paid off`,
          account.payoff_date ? `payoff ${fmtMonthYear(account.payoff_date)}` : null,
        ]
          .filter(Boolean)
          .join(' · ');

  return (
    <div className="mt-2 pl-[58px]">
      {paid !== null && (
        <div
          className="h-1.5 w-full overflow-hidden rounded-full bg-[#F2F4F7] dark:bg-slate-700"
          role="progressbar"
          aria-label="Paid off"
          aria-valuenow={Math.round(paid)}
          aria-valuemin={0}
          aria-valuemax={100}
        >
          <div
            className="h-full rounded-full bg-[#C2410C] transition-[width] duration-700"
            style={{ width: `${paid}%` }}
          />
        </div>
      )}
      <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1">
        {text && <span className="text-[13px] text-slate-500 dark:text-slate-400">{text}</span>}
        {paid === null && addLink('original_amount', 'Add original amount')}
        {account.apr == null && addLink('apr', 'Add APR')}
      </div>
    </div>
  );
}
