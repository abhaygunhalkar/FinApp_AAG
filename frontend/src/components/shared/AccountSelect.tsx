import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useAccounts } from '../../hooks';
import type { AccountType } from '../../types';

interface AccountSelectProps {
  id: string;
  /** Linked Net Worth account, or null. */
  accountId: number | null;
  /** Free text saved before linking existed (or a deleted account's name); '' for none. */
  legacyText: string;
  /** Picking an account clears the text; "Not specified" clears both. */
  onChange: (accountId: number | null, legacyText: string) => void;
  /** Net Worth account types to offer. */
  accountTypes: AccountType[];
  /** Shown when no matching accounts exist, e.g. "No checking or savings accounts yet." */
  emptyMessage: string;
  className?: string;
  /** Called when the Net Worth link is followed (e.g. to close a modal). */
  onNavigate?: () => void;
}

const GROUPS: { label: string; types: AccountType[] }[] = [
  { label: 'Bank accounts', types: ['checking', 'savings'] },
  { label: 'Credit cards', types: ['credit_card'] },
];

const LEGACY = 'legacy';

/** "Name (Bank)", or just the name when no institution is set. */
function accountLabel(a: { name: string; institution: string | null }): string {
  return a.institution ? `${a.name} (${a.institution})` : a.name;
}

/**
 * Dropdown of the user's Net Worth accounts, saved as a link to the account so
 * renames show up everywhere. Unlinked free text (typed before linking existed,
 * or left behind when an account was deleted) stays selectable so editing a
 * record doesn't silently clear it.
 */
export default function AccountSelect({
  id,
  accountId,
  legacyText,
  onChange,
  accountTypes,
  emptyMessage,
  className,
  onNavigate,
}: AccountSelectProps) {
  const { data: accounts } = useAccounts();

  const groups = useMemo(() => {
    const matching = (accounts ?? []).filter((a) => accountTypes.includes(a.account_type));
    return GROUPS.map((g) => ({
      label: g.label,
      options: matching
        .filter((a) => g.types.includes(a.account_type))
        .map((a) => ({ id: a.id, label: accountLabel(a) })),
    })).filter((g) => g.options.length > 0);
  }, [accounts, accountTypes]);

  const hasAccounts = groups.length > 0;
  const hintId = `${id}-hint`;
  // Group headings only help when more than one kind of account is listed.
  const grouped = groups.length > 1;
  const value = accountId !== null ? String(accountId) : legacyText ? LEGACY : '';

  const handleChange = (v: string) => {
    if (v === '') onChange(null, '');
    else if (v === LEGACY) onChange(null, legacyText);
    else onChange(Number(v), '');
  };

  return (
    <>
      <select
        id={id}
        value={value}
        onChange={(e) => handleChange(e.target.value)}
        aria-describedby={hasAccounts ? undefined : hintId}
        className={className}
      >
        <option value="">Not specified</option>
        {groups.map((g) => {
          const options = g.options.map((o) => (
            <option key={o.id} value={String(o.id)}>
              {o.label}
            </option>
          ));
          return grouped ? (
            <optgroup key={g.label} label={g.label}>
              {options}
            </optgroup>
          ) : (
            options
          );
        })}
        {legacyText && <option value={LEGACY}>{legacyText} (not on Net Worth)</option>}
      </select>
      {!hasAccounts && (
        <p id={hintId} className="mt-1 text-xs text-slate-500">
          {emptyMessage}{' '}
          <Link to="/net-worth" className="underline" onClick={onNavigate}>
            Add them on Net Worth
          </Link>
        </p>
      )}
    </>
  );
}
