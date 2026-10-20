import { useEffect, useRef, useState } from 'react';
import { useCreateAccount, useUpdateAccount } from '../../hooks/useNetWorth';
import type { AccountType, FinancialAccount, FinancialAccountCreate } from '../../types';
import {
  ACCOUNT_TYPE_LABELS,
  ASSET_TYPES,
  LIABILITY_TYPES,
  isCreditType,
  isLoanType,
} from './accountConfig';
import type { DetailField } from './AccountRow';

export interface AccountFormDefaults {
  account_type: AccountType;
  name?: string;
}

interface AccountFormProps {
  account?: FinancialAccount | null;
  defaults?: AccountFormDefaults;
  /** Field to focus on open, e.g. when coming from an "Add credit limit" link. */
  focusField?: DetailField;
  onClose: () => void;
  onDelete?: (account: FinancialAccount) => void;
}

interface FormData {
  name: string;
  institution: string;
  account_type: AccountType;
  balance: string;
  notes: string;
  credit_limit: string;
  original_amount: string;
  apr: string;
  due_date: string;
  payoff_date: string;
}

const numStr = (v: number | null | undefined) => (v == null ? '' : String(v));

function initialForm(account?: FinancialAccount | null, defaults?: AccountFormDefaults): FormData {
  return {
    name: account?.name ?? defaults?.name ?? '',
    institution: account?.institution ?? '',
    account_type: account?.account_type ?? defaults?.account_type ?? 'checking',
    balance: numStr(account?.balance),
    notes: account?.notes ?? '',
    credit_limit: numStr(account?.credit_limit),
    original_amount: numStr(account?.original_amount),
    apr: numStr(account?.apr),
    due_date: account?.due_date ?? '',
    payoff_date: account?.payoff_date ?? '',
  };
}

const inputClass =
  'w-full h-11 px-3 rounded-xl border border-[#D0D5DD] dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-900 dark:text-white text-sm placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-[#1D4ED8]/40 focus:border-[#1D4ED8] transition';

const labelClass = 'block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5';

export default function AccountForm({
  account,
  defaults,
  focusField,
  onClose,
  onDelete,
}: AccountFormProps) {
  const isEditing = !!account;
  const createMutation = useCreateAccount();
  const updateMutation = useUpdateAccount();

  const [formData, setFormData] = useState<FormData>(() => initialForm(account, defaults));
  const [error, setError] = useState<string | null>(null);
  const fieldRefs = useRef<Partial<Record<keyof FormData, HTMLInputElement | null>>>({});

  useEffect(() => {
    const target = (focusField && fieldRefs.current[focusField]) || fieldRefs.current.name;
    target?.focus();
  }, [focusField]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  const type = formData.account_type;
  const credit = isCreditType(type);
  const loan = isLoanType(type);

  function handleChange(field: keyof FormData, value: string) {
    setFormData((prev) => ({ ...prev, [field]: value }));
    setError(null);
  }

  function optionalNumber(value: string, label: string, allowZero = false): number | null | Error {
    if (value.trim() === '') return null;
    const n = parseFloat(value);
    if (isNaN(n) || n < 0 || (!allowZero && n === 0))
      return new Error(`${label} must be greater than 0`);
    return n;
  }

  async function handleSubmit(e?: React.FormEvent) {
    e?.preventDefault();
    const name = formData.name.trim();
    const balance = parseFloat(formData.balance);
    if (!name) return setError('Name is required');
    if (isNaN(balance) || balance < 0) return setError('Balance must be 0 or greater');

    const creditLimit = credit ? optionalNumber(formData.credit_limit, 'Credit limit') : null;
    const original = loan ? optionalNumber(formData.original_amount, 'Original amount') : null;
    const apr = credit || loan ? optionalNumber(formData.apr, 'APR', true) : null;
    for (const v of [creditLimit, original, apr])
      if (v instanceof Error) return setError(v.message);
    if (typeof apr === 'number' && apr > 100) return setError('APR must be 100% or less');

    const payload: FinancialAccountCreate = {
      name,
      institution: formData.institution.trim() || null,
      account_type: type,
      balance,
      notes: formData.notes.trim() || null,
      credit_limit: creditLimit as number | null,
      original_amount: original as number | null,
      apr: apr as number | null,
      due_date: credit && formData.due_date ? formData.due_date : null,
      payoff_date: loan && formData.payoff_date ? formData.payoff_date : null,
    };

    try {
      if (isEditing && account) {
        await updateMutation.mutateAsync({ id: account.id, data: payload });
      } else {
        await createMutation.mutateAsync(payload);
      }
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
    }
  }

  const isSubmitting = createMutation.isPending || updateMutation.isPending;
  const title = isEditing
    ? `Edit ${account.name}`
    : defaults && defaults.account_type !== 'checking'
      ? `Add ${ACCOUNT_TYPE_LABELS[defaults.account_type].toLowerCase()}`
      : 'Add account';

  const field = (
    key: keyof FormData,
    label: string,
    props: React.InputHTMLAttributes<HTMLInputElement> & { prefix?: string; suffix?: string } = {},
  ) => {
    const { prefix, suffix, ...inputProps } = props;
    return (
      <div>
        <label htmlFor={`acct-${key}`} className={labelClass}>
          {label}
        </label>
        <div className="relative">
          {prefix && (
            <span
              className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 text-sm"
              aria-hidden="true"
            >
              {prefix}
            </span>
          )}
          <input
            id={`acct-${key}`}
            ref={(el) => {
              fieldRefs.current[key] = el;
            }}
            value={formData[key]}
            onChange={(e) => handleChange(key, e.target.value)}
            className={`${inputClass} ${prefix ? 'pl-7' : ''} ${suffix ? 'pr-8' : ''}`}
            {...inputProps}
          />
          {suffix && (
            <span
              className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 text-sm"
              aria-hidden="true"
            >
              {suffix}
            </span>
          )}
        </div>
      </div>
    );
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center"
      role="dialog"
      aria-modal="true"
      aria-labelledby="account-form-title"
    >
      <div className="absolute inset-0 bg-[#0C1322]/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative z-10 w-full sm:max-w-md sm:mx-4 max-h-[92vh] flex flex-col bg-white dark:bg-slate-800 rounded-t-[24px] sm:rounded-[24px] shadow-2xl overflow-hidden">
        <div className="px-6 pt-6 pb-4 flex items-start justify-between gap-4">
          <div className="min-w-0">
            <h2
              id="account-form-title"
              className="text-lg font-bold text-slate-900 dark:text-white truncate"
            >
              {title}
            </h2>
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
              {account?.is_linked
                ? 'Balance syncs from your bank; you can add details it doesn’t provide.'
                : isEditing
                  ? 'Update the details below'
                  : 'Enter a balance to include it in your net worth'}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="-mr-2 -mt-1 h-11 w-11 shrink-0 flex items-center justify-center rounded-full text-slate-500 hover:text-slate-900 hover:bg-slate-100 dark:hover:bg-slate-700 dark:hover:text-white transition-colors"
          >
            <svg viewBox="0 0 16 16" fill="currentColor" className="w-4 h-4" aria-hidden="true">
              <path d="M5.28 4.22a.75.75 0 0 0-1.06 1.06L6.94 8l-2.72 2.72a.75.75 0 1 0 1.06 1.06L8 9.06l2.72 2.72a.75.75 0 1 0 1.06-1.06L9.06 8l2.72-2.72a.75.75 0 0 0-1.06-1.06L8 6.94 5.28 4.22Z" />
            </svg>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="px-6 pb-4 space-y-4 overflow-y-auto">
          {error && (
            <div
              role="alert"
              className="px-3 py-2.5 rounded-xl bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-sm text-red-700 dark:text-red-400"
            >
              {error}
            </div>
          )}

          {field('name', 'Name', {
            type: 'text',
            placeholder: 'e.g. Chase Checking',
            required: true,
          })}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label htmlFor="acct-type" className={labelClass}>
                Type
              </label>
              <select
                id="acct-type"
                value={type}
                onChange={(e) => handleChange('account_type', e.target.value)}
                disabled={isEditing}
                className={`${inputClass} ${isEditing ? 'opacity-60 cursor-not-allowed' : ''}`}
              >
                <optgroup label="Assets">
                  {ASSET_TYPES.map((t) => (
                    <option key={t} value={t}>
                      {ACCOUNT_TYPE_LABELS[t]}
                    </option>
                  ))}
                </optgroup>
                <optgroup label="Liabilities">
                  {LIABILITY_TYPES.map((t) => (
                    <option key={t} value={t}>
                      {ACCOUNT_TYPE_LABELS[t]}
                    </option>
                  ))}
                </optgroup>
              </select>
            </div>
            {field('balance', credit || loan ? 'Balance owed' : 'Value', {
              type: 'number',
              step: '0.01',
              min: '0',
              inputMode: 'decimal',
              placeholder: '0.00',
              prefix: '$',
              required: true,
            })}
          </div>

          {field('institution', 'Institution', {
            type: 'text',
            placeholder: 'e.g. Chase, Ally, Coinbase',
          })}

          {credit && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {field('credit_limit', 'Credit limit', {
                type: 'number',
                step: '0.01',
                min: '0',
                inputMode: 'decimal',
                prefix: '$',
                placeholder: 'Optional',
              })}
              {field('due_date', 'Payment due', { type: 'date' })}
            </div>
          )}
          {loan && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {field('original_amount', 'Original amount', {
                type: 'number',
                step: '0.01',
                min: '0',
                inputMode: 'decimal',
                prefix: '$',
                placeholder: 'Optional',
              })}
              {field('payoff_date', 'Payoff date', { type: 'date' })}
            </div>
          )}
          {(credit || loan) &&
            field('apr', 'APR', {
              type: 'number',
              step: '0.01',
              min: '0',
              max: '100',
              inputMode: 'decimal',
              suffix: '%',
              placeholder: 'Optional',
            })}

          <div>
            <label htmlFor="acct-notes" className={labelClass}>
              Notes
            </label>
            <textarea
              id="acct-notes"
              value={formData.notes}
              onChange={(e) => handleChange('notes', e.target.value)}
              placeholder="Optional"
              rows={2}
              className={`${inputClass} h-auto py-2.5 resize-none`}
            />
          </div>
          {/* Lets Enter submit; the visible Save button lives in the footer. */}
          <button type="submit" className="sr-only" aria-hidden="true" tabIndex={-1} />
        </form>

        <div className="px-6 py-4 border-t border-[#E4E7EC] dark:border-slate-700 flex gap-3">
          {isEditing && onDelete && (
            <button
              type="button"
              onClick={() => onDelete(account)}
              disabled={isSubmitting}
              className="h-11 px-4 rounded-full text-sm font-semibold text-red-700 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors disabled:opacity-50"
            >
              Delete
            </button>
          )}
          <span className="flex-1" />
          <button
            type="button"
            onClick={onClose}
            disabled={isSubmitting}
            className="h-11 px-4 rounded-full border border-[#D0D5DD] dark:border-slate-600 text-sm font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => handleSubmit()}
            disabled={isSubmitting}
            className="h-11 px-5 rounded-full bg-[#0C1322] dark:bg-white text-white dark:text-[#0C1322] text-sm font-semibold hover:bg-[#1F2A3F] dark:hover:bg-slate-100 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isSubmitting ? 'Saving…' : isEditing ? 'Save' : 'Add'}
          </button>
        </div>
      </div>
    </div>
  );
}
