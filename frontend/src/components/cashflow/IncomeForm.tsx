import { useEffect, useRef, useState } from 'react';
import { useCreateIncomeSource, useUpdateIncomeSource } from '../../hooks';
import type {
  AccountType,
  ExpenseFrequency,
  IncomeCategory,
  IncomeSource,
  IncomeSourceCreate,
} from '../../types';
import { FREQUENCIES, MONTHLY_FACTOR, fmtUSD } from '../fixedcosts/constants';
import AccountSelect from '../shared/AccountSelect';
import { INCOME_CATEGORIES } from './constants';

interface IncomeFormProps {
  /** The income source being edited; omit to add a new one. */
  income?: IncomeSource | null;
  onClose: () => void;
}

interface FormData {
  name: string;
  category: IncomeCategory;
  amount: string;
  frequency: ExpenseFrequency;
  deposited_to: string;
  notes: string;
}

function initialForm(income?: IncomeSource | null): FormData {
  return {
    name: income?.name ?? '',
    category: income?.category ?? 'Salary',
    amount: income ? String(income.amount) : '',
    frequency: income?.frequency ?? 'biweekly',
    deposited_to: income?.deposited_to ?? '',
    notes: income?.notes ?? '',
  };
}

const inputClass =
  'w-full h-11 px-3 rounded-xl border border-[#D0D5DD] dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-900 dark:text-white text-sm placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-[#1D4ED8]/40 focus:border-[#1D4ED8] transition';

/** Income lands in a bank account. */
const DEPOSIT_TYPES: AccountType[] = ['checking', 'savings'];

const labelClass = 'block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5';

export default function IncomeForm({ income, onClose }: IncomeFormProps) {
  const isEditing = !!income;
  const createMutation = useCreateIncomeSource();
  const updateMutation = useUpdateIncomeSource();

  const [formData, setFormData] = useState<FormData>(() => initialForm(income));
  const [error, setError] = useState<string | null>(null);
  const nameRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    nameRef.current?.focus();
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  function update<K extends keyof FormData>(field: K, value: FormData[K]) {
    setFormData((prev) => ({ ...prev, [field]: value }));
    setError(null);
  }

  async function handleSubmit(e?: React.FormEvent) {
    e?.preventDefault();
    const name = formData.name.trim();
    const amount = parseFloat(formData.amount);
    if (!name) return setError('Enter a name for this income.');
    if (isNaN(amount) || amount <= 0) return setError('Enter an amount greater than $0.');

    const payload: IncomeSourceCreate = {
      name,
      category: formData.category,
      amount,
      frequency: formData.frequency,
      deposited_to: formData.deposited_to.trim() || null,
      notes: formData.notes.trim() || null,
    };

    try {
      if (isEditing && income) {
        await updateMutation.mutateAsync({ id: income.id, income: payload });
      } else {
        await createMutation.mutateAsync(payload);
      }
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
    }
  }

  const isSubmitting = createMutation.isPending || updateMutation.isPending;
  const amount = parseFloat(formData.amount);
  const monthly = !isNaN(amount) && amount > 0 ? amount * MONTHLY_FACTOR[formData.frequency] : null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center"
      role="dialog"
      aria-modal="true"
      aria-labelledby="income-form-title"
    >
      <div className="absolute inset-0 bg-[#0C1322]/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative z-10 w-full sm:max-w-lg sm:mx-4 max-h-[92vh] flex flex-col bg-white dark:bg-slate-800 rounded-t-[24px] sm:rounded-[24px] shadow-2xl overflow-hidden">
        <div className="px-6 pt-6 pb-4 flex items-start justify-between gap-4">
          <div className="min-w-0">
            <h2
              id="income-form-title"
              className="text-lg font-bold text-slate-900 dark:text-white truncate"
            >
              {isEditing ? `Edit ${income.name}` : 'Add income'}
            </h2>
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
              Money that comes in on a regular schedule
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

          <div>
            <label htmlFor="income-name" className={labelClass}>
              Name
            </label>
            <input
              id="income-name"
              ref={nameRef}
              type="text"
              value={formData.name}
              onChange={(e) => update('name', e.target.value)}
              placeholder="e.g. Paycheck"
              maxLength={200}
              className={inputClass}
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label htmlFor="income-category" className={labelClass}>
                Category
              </label>
              <select
                id="income-category"
                value={formData.category}
                onChange={(e) => update('category', e.target.value as IncomeCategory)}
                className={inputClass}
              >
                {INCOME_CATEGORIES.map((c) => (
                  <option key={c.name} value={c.name}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="income-amount" className={labelClass}>
                Take-home amount
              </label>
              <div className="relative">
                <span
                  className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 text-sm"
                  aria-hidden="true"
                >
                  $
                </span>
                <input
                  id="income-amount"
                  type="number"
                  step="0.01"
                  min="0"
                  inputMode="decimal"
                  value={formData.amount}
                  onChange={(e) => update('amount', e.target.value)}
                  placeholder="0.00"
                  aria-describedby="income-amount-hint"
                  className={`${inputClass} pl-7`}
                />
              </div>
              <p id="income-amount-hint" className="mt-1 text-xs text-slate-500">
                After tax and deductions, as it lands in your account
              </p>
            </div>
            <div>
              <label htmlFor="income-frequency" className={labelClass}>
                How often
              </label>
              <select
                id="income-frequency"
                value={formData.frequency}
                onChange={(e) => update('frequency', e.target.value as ExpenseFrequency)}
                className={inputClass}
              >
                {FREQUENCIES.map((f) => (
                  <option key={f.value} value={f.value}>
                    {f.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="income-deposited-to" className={labelClass}>
                Deposited to
              </label>
              <AccountSelect
                id="income-deposited-to"
                value={formData.deposited_to}
                onChange={(v) => update('deposited_to', v)}
                accountTypes={DEPOSIT_TYPES}
                emptyMessage="No checking or savings accounts yet."
                className={inputClass}
                onNavigate={onClose}
              />
            </div>
          </div>

          <div>
            <label htmlFor="income-notes" className={labelClass}>
              Notes <span className="font-normal text-slate-500">(optional)</span>
            </label>
            <input
              id="income-notes"
              type="text"
              value={formData.notes}
              onChange={(e) => update('notes', e.target.value)}
              placeholder="e.g. Raise effective in March"
              maxLength={500}
              className={inputClass}
            />
          </div>

          <p className="text-sm text-slate-600 dark:text-slate-300 bg-slate-50 dark:bg-slate-700/50 rounded-xl px-3 py-2.5">
            {monthly === null
              ? 'Enter an amount to see the monthly and yearly total.'
              : `Works out to ${fmtUSD(monthly)} per month and ${fmtUSD(monthly * 12)} per year.`}
          </p>
        </form>

        <div className="px-6 py-4 flex justify-end gap-3 border-t border-slate-100 dark:border-slate-700">
          <button
            type="button"
            onClick={onClose}
            className="h-11 px-5 rounded-xl border border-[#D0D5DD] dark:border-slate-600 text-sm font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => handleSubmit()}
            disabled={isSubmitting}
            className="h-11 px-5 rounded-xl bg-slate-900 dark:bg-white text-white dark:text-slate-900 text-sm font-semibold hover:bg-slate-700 dark:hover:bg-slate-100 transition-colors disabled:opacity-50"
          >
            {isSubmitting ? 'Saving…' : isEditing ? 'Save changes' : 'Add income'}
          </button>
        </div>
      </div>
    </div>
  );
}
