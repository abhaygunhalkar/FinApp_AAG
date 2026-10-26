import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useAccounts } from '../../hooks';
import type { AccountType } from '../../types';

interface AccountSelectProps {
  id: string;
  /** Saved label, e.g. "Everyday Checking (Harbor Bank)"; '' for none. */
  value: string;
  onChange: (value: string) => void;
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

/** "Name (Bank)", or just the name when no institution is set. */
function accountLabel(a: { name: string; institution: string | null }): string {
  return a.institution ? `${a.name} (${a.institution})` : a.name;
}

/**
 * Dropdown of the user's Net Worth accounts, stored as their label. A saved value
 * that matches no account (typed before this existed, or the account was removed)
 * stays selectable so editing a record doesn't silently clear it.
 */
export default function AccountSelect({
  id,
  value,
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
      options: matching.filter((a) => g.types.includes(a.account_type)).map(accountLabel),
    })).filter((g) => g.options.length > 0);
  }, [accounts, accountTypes]);

  const allOptions = groups.flatMap((g) => g.options);
  const legacy = value && !allOptions.includes(value) ? value : null;
  const hintId = `${id}-hint`;
  // Group headings only help when more than one kind of account is listed.
  const grouped = groups.length > 1;

  return (
    <>
      <select
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-describedby={allOptions.length === 0 ? hintId : undefined}
        className={className}
      >
        <option value="">Not specified</option>
        {groups.map((g) => {
          const options = g.options.map((label) => (
            <option key={label} value={label}>
              {label}
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
        {legacy && <option value={legacy}>{legacy} (not on Net Worth)</option>}
      </select>
      {allOptions.length === 0 && (
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
