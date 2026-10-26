import { useEffect, useRef, useState } from 'react';
import { useCreateRecurringExpense, useUpdateRecurringExpense } from '../../hooks';
import type {
  AccountType,
  ExpenseCategory,
  ExpenseFrequency,
  RecurringExpense,
  RecurringExpenseCreate,
} from '../../types';
import AccountSelect from '../shared/AccountSelect';
import { CATEGORIES, FREQUENCIES, MONTHLY_FACTOR, fmtUSD } from './constants';

interface ExpenseFormProps {
  /** The expense being edited; omit to add a new one. */
  expense?: RecurringExpense | null;
  defaultCategory?: ExpenseCategory;
  onClose: () => void;
}

interface FormData {
  name: string;
  category: ExpenseCategory;
  amount: string;
  frequency: ExpenseFrequency;
  next_due_date: string;
  paid_from: string;
  autopay: boolean;
  notes: string;
}

function initialForm(expense?: RecurringExpense | null, category?: ExpenseCategory): FormData {
  return {
    name: expense?.name ?? '',
    category: expense?.category ?? category ?? 'Utilities',
    amount: expense ? String(expense.amount) : '',
    frequency: expense?.frequency ?? 'monthly',
    next_due_date: expense?.next_due_date ?? '',
    paid_from: expense?.paid_from ?? '',
    autopay: expense?.autopay ?? false,
    notes: expense?.notes ?? '',
  };
}

const inputClass =
  'w-full h-11 px-3 rounded-xl border border-[#D0D5DD] dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-900 dark:text-white text-sm placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-[#1D4ED8]/40 focus:border-[#1D4ED8] transition';

/** Bills are paid from a bank account or charged to a card. */
const PAYMENT_TYPES: AccountType[] = ['checking', 'savings', 'credit_card'];

const labelClass = 'block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5';

export default function ExpenseForm({ expense, defaultCategory, onClose }: ExpenseFormProps) {
  const isEditing = !!expense;
  const createMutation = useCreateRecurringExpense();
  const updateMutation = useUpdateRecurringExpense();

  const [formData, setFormData] = useState<FormData>(() => initialForm(expense, defaultCategory));
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
    if (!name) return setError('Enter a name for this expense.');
    if (isNaN(amount) || amount <= 0) return setError('Enter an amount greater than $0.');

    const payload: RecurringExpenseCreate = {
      name,
      category: formData.category,
      amount,
      frequency: formData.frequency,
      next_due_date: formData.next_due_date || null,
      paid_from: formData.paid_from.trim() || null,
      autopay: formData.autopay,
      notes: formData.notes.trim() || null,
    };

    try {
      if (isEditing && expense) {
        await updateMutation.mutateAsync({ id: expense.id, expense: payload });
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
      aria-labelledby="expense-form-title"
    >
      <div className="absolute inset-0 bg-[#0C1322]/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative z-10 w-full sm:max-w-lg sm:mx-4 max-h-[92vh] flex flex-col bg-white dark:bg-slate-800 rounded-t-[24px] sm:rounded-[24px] shadow-2xl overflow-hidden">
        <div className="px-6 pt-6 pb-4 flex items-start justify-between gap-4">
          <div className="min-w-0">
            <h2
              id="expense-form-title"
              className="text-lg font-bold text-slate-900 dark:text-white truncate"
            >
              {isEditing ? `Edit ${expense.name}` : 'Add expense'}
            </h2>
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
              A bill you pay on a fixed schedule
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
            <label htmlFor="expense-name" className={labelClass}>
              Name
            </label>
            <input
              id="expense-name"
              ref={nameRef}
              type="text"
              value={formData.name}
              onChange={(e) => update('name', e.target.value)}
              placeholder="e.g. Electricity"
              maxLength={200}
              className={inputClass}
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label htmlFor="expense-category" className={labelClass}>
                Category
              </label>
              <select
                id="expense-category"
                value={formData.category}
                onChange={(e) => update('category', e.target.value as ExpenseCategory)}
                className={inputClass}
              >
                {CATEGORIES.map((c) => (
                  <option key={c.name} value={c.name}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="expense-amount" className={labelClass}>
                Amount
              </label>
              <div className="relative">
                <span
                  className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 text-sm"
                  aria-hidden="true"
                >
                  $
                </span>
                <input
                  id="expense-amount"
                  type="number"
                  step="0.01"
                  min="0"
                  inputMode="decimal"
                  value={formData.amount}
                  onChange={(e) => update('amount', e.target.value)}
                  placeholder="0.00"
                  className={`${inputClass} pl-7`}
                />
              </div>
            </div>
            <div>
              <label htmlFor="expense-frequency" className={labelClass}>
                How often
              </label>
              <select
                id="expense-frequency"
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
              <label htmlFor="expense-due" className={labelClass}>
                Next due date
              </label>
              <input
                id="expense-due"
                type="date"
                value={formData.next_due_date}
                onChange={(e) => update('next_due_date', e.target.value)}
                className={inputClass}
              />
            </div>
            <div>
              <label htmlFor="expense-paid-from" className={labelClass}>
                Paid from
              </label>
              <AccountSelect
                id="expense-paid-from"
                value={formData.paid_from}
                onChange={(v) => update('paid_from', v)}
                accountTypes={PAYMENT_TYPES}
                emptyMessage="No bank accounts or credit cards yet."
                className={inputClass}
                onNavigate={onClose}
              />
            </div>
            <label
              htmlFor="expense-autopay"
              className="flex items-center gap-3 min-h-11 sm:mt-7 text-sm text-slate-800 dark:text-slate-200"
            >
              <input
                id="expense-autopay"
                type="checkbox"
                checked={formData.autopay}
                onChange={(e) => update('autopay', e.target.checked)}
                className="h-4 w-4 rounded border-slate-300"
              />
              Paid automatically (autopay)
            </label>
          </div>

          <div>
            <label htmlFor="expense-notes" className={labelClass}>
              Notes <span className="font-normal text-slate-500">(optional)</span>
            </label>
            <input
              id="expense-notes"
              type="text"
              value={formData.notes}
              onChange={(e) => update('notes', e.target.value)}
              placeholder="e.g. Average bill, rate locked until 2027"
              maxLength={500}
              className={inputClass}
            />
          </div>

          <p className="text-sm text-slate-600 dark:text-slate-300 bg-slate-50 dark:bg-slate-700/50 rounded-xl px-3 py-2.5">
            {monthly === null
              ? 'Enter an amount to see the monthly and yearly cost.'
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
            {isSubmitting ? 'Saving…' : isEditing ? 'Save changes' : 'Add expense'}
          </button>
        </div>
      </div>
    </div>
  );
}
