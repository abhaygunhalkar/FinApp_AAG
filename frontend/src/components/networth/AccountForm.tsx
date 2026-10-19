import { useState, useEffect } from 'react';
import { useCreateAccount, useUpdateAccount } from '../../hooks/useNetWorth';
import type { FinancialAccount, FinancialAccountCreate, AccountType } from '../../types';
import { ACCOUNT_TYPE_LABELS, ASSET_TYPES, LIABILITY_TYPES } from './accountConfig';

interface AccountFormProps {
  account?: FinancialAccount | null;
  onClose: () => void;
}

interface FormData {
  name: string;
  institution: string;
  account_type: AccountType;
  balance: string;
  notes: string;
}

const inputClass =
  'w-full px-3 py-2.5 rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-900 dark:text-white text-sm placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-400 dark:focus:ring-slate-500 focus:border-transparent transition';

const labelClass =
  'block text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1.5';

export default function AccountForm({ account, onClose }: AccountFormProps) {
  const isEditing = !!account;
  const createMutation = useCreateAccount();
  const updateMutation = useUpdateAccount();

  const [formData, setFormData] = useState<FormData>({
    name: account?.name ?? '',
    institution: account?.institution ?? '',
    account_type: account?.account_type ?? 'checking',
    balance: account?.balance?.toString() ?? '',
    notes: account?.notes ?? '',
  });
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (account) {
      setFormData({
        name: account.name,
        institution: account.institution ?? '',
        account_type: account.account_type,
        balance: account.balance.toString(),
        notes: account.notes ?? '',
      });
    }
  }, [account]);

  function handleChange(field: keyof FormData, value: string) {
    setFormData((prev) => ({ ...prev, [field]: value }));
    setError(null);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const name = formData.name.trim();
    const balance = parseFloat(formData.balance);
    if (!name) {
      setError('Name is required');
      return;
    }
    if (isNaN(balance) || balance < 0) {
      setError('Balance must be 0 or greater');
      return;
    }

    const payload: FinancialAccountCreate = {
      name,
      institution: formData.institution.trim() || null,
      account_type: formData.account_type,
      balance,
      notes: formData.notes.trim() || null,
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

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      role="dialog"
      aria-modal="true"
    >
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative z-10 w-full max-w-md mx-4 bg-white dark:bg-slate-800 rounded-2xl shadow-2xl overflow-hidden">
        <div className="bg-slate-900 dark:bg-slate-950 px-6 py-5 flex items-center justify-between">
          <div>
            <h2 className="text-base font-bold text-white">
              {isEditing ? 'Edit Account' : 'Add Account'}
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">
              {isEditing
                ? 'Update the details below'
                : 'Add a bank account, credit card, or other account'}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-700 transition-colors"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 16 16"
              fill="currentColor"
              className="w-4 h-4"
            >
              <path d="M5.28 4.22a.75.75 0 0 0-1.06 1.06L6.94 8l-2.72 2.72a.75.75 0 1 0 1.06 1.06L8 9.06l2.72 2.72a.75.75 0 1 0 1.06-1.06L9.06 8l2.72-2.72a.75.75 0 0 0-1.06-1.06L8 6.94 5.28 4.22Z" />
            </svg>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="px-6 py-5 space-y-4">
          {error && (
            <div className="flex items-center gap-2 px-3 py-2.5 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800">
              <span className="text-sm text-red-700 dark:text-red-400">{error}</span>
            </div>
          )}

          <div>
            <label className={labelClass}>
              Account Name <span className="text-red-400 font-normal normal-case">*</span>
            </label>
            <input
              type="text"
              value={formData.name}
              onChange={(e) => handleChange('name', e.target.value)}
              placeholder="e.g. Chase Checking"
              className={inputClass}
            />
          </div>

          <div>
            <label className={labelClass}>Institution</label>
            <input
              type="text"
              value={formData.institution}
              onChange={(e) => handleChange('institution', e.target.value)}
              placeholder="e.g. Chase, Ally, Fidelity"
              className={inputClass}
            />
          </div>

          <div>
            <label className={labelClass}>
              Account Type <span className="text-red-400 font-normal normal-case">*</span>
            </label>
            <select
              value={formData.account_type}
              onChange={(e) => handleChange('account_type', e.target.value)}
              disabled={isEditing}
              className={`${inputClass} ${isEditing ? 'opacity-50 cursor-not-allowed' : ''}`}
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

          <div>
            <label className={labelClass}>
              Balance <span className="text-red-400 font-normal normal-case">*</span>
            </label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm">
                $
              </span>
              <input
                type="number"
                step="0.01"
                min="0"
                value={formData.balance}
                onChange={(e) => handleChange('balance', e.target.value)}
                placeholder="0.00"
                className={`${inputClass} pl-7`}
              />
            </div>
          </div>

          <div>
            <label className={labelClass}>Notes</label>
            <textarea
              value={formData.notes}
              onChange={(e) => handleChange('notes', e.target.value)}
              placeholder="Optional notes…"
              rows={2}
              className={`${inputClass} resize-none`}
            />
          </div>
        </form>

        <div className="px-6 py-4 border-t border-slate-100 dark:border-slate-700 flex gap-3">
          <button
            type="button"
            onClick={onClose}
            disabled={isSubmitting}
            className="flex-1 px-4 py-2.5 rounded-lg border border-slate-200 dark:border-slate-600 text-sm font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={isSubmitting}
            className="flex-1 px-4 py-2.5 rounded-lg bg-slate-900 dark:bg-white text-white dark:text-slate-900 text-sm font-semibold hover:bg-slate-700 dark:hover:bg-slate-100 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isSubmitting ? 'Saving…' : isEditing ? 'Save Changes' : 'Add Account'}
          </button>
        </div>
      </div>
    </div>
  );
}
