import { useState } from 'react';
import { useCreateWatchlistItem, useUpdateWatchlistItem } from '../../hooks/useWatchlist';
import type { WatchlistItem, WatchlistCreate, WatchlistUpdate } from '../../types';
import { AxiosError } from 'axios';

interface WatchlistFormProps {
  item?: WatchlistItem | null;
  onClose: () => void;
}

interface FormErrors {
  ticker?: string;
  target_buy_price?: string;
  priority?: string;
  notes?: string;
  general?: string;
}

interface FormData {
  ticker: string;
  target_buy_price: string;
  priority: string;
  notes: string;
}

export default function WatchlistForm({ item, onClose }: WatchlistFormProps) {
  const isEditing = !!item;
  const createMutation = useCreateWatchlistItem();
  const updateMutation = useUpdateWatchlistItem();

  const [formData, setFormData] = useState<FormData>({
    ticker: item?.ticker ?? '',
    target_buy_price: item?.target_buy_price?.toString() ?? '',
    priority: item?.priority?.toString() ?? '3',
    notes: item?.notes ?? '',
  });

  const [errors, setErrors] = useState<FormErrors>({});

  function validate(): FormErrors {
    const newErrors: FormErrors = {};

    // Ticker validation
    const ticker = formData.ticker.trim().toUpperCase();
    if (!isEditing) {
      if (!ticker) {
        newErrors.ticker = 'Ticker is required';
      } else if (!/^[A-Z]{1,5}$/.test(ticker)) {
        newErrors.ticker = 'Ticker must be 1-5 uppercase letters';
      }
    }

    // Target buy price validation (optional)
    if (formData.target_buy_price.trim()) {
      const price = parseFloat(formData.target_buy_price);
      if (isNaN(price)) {
        newErrors.target_buy_price = 'Target buy price must be a valid number';
      } else if (price < 0.01) {
        newErrors.target_buy_price = 'Target buy price must be at least $0.01';
      } else if (price > 999999.99) {
        newErrors.target_buy_price = 'Target buy price must be at most $999,999.99';
      }
    }

    // Priority validation (optional, defaults to 3)
    if (formData.priority.trim()) {
      const priority = parseInt(formData.priority, 10);
      if (isNaN(priority)) {
        newErrors.priority = 'Priority must be a valid number';
      } else if (priority < 1 || priority > 5) {
        newErrors.priority = 'Priority must be between 1 and 5';
      }
    }

    // Notes validation (optional, max 500 chars)
    if (formData.notes.length > 500) {
      newErrors.notes = 'Notes must be at most 500 characters';
    }

    return newErrors;
  }

  function parseBackendErrors(error: unknown): FormErrors {
    if (error instanceof AxiosError && error.response) {
      const status = error.response.status;
      const data = error.response.data;

      if (status === 422) {
        // FastAPI validation error format
        if (data?.detail && Array.isArray(data.detail)) {
          const fieldErrors: FormErrors = {};
          for (const err of data.detail) {
            const field = err.loc?.[err.loc.length - 1];
            if (field && typeof field === 'string') {
              fieldErrors[field as keyof FormErrors] = err.msg;
            }
          }
          return fieldErrors;
        }
        // Envelope format error
        if (data?.error) {
          return { general: data.error };
        }
      }

      if (data?.error) {
        return { general: data.error };
      }
    }

    if (error instanceof Error) {
      return { general: error.message };
    }

    return { general: 'An unexpected error occurred' };
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    const validationErrors = validate();
    if (Object.keys(validationErrors).length > 0) {
      setErrors(validationErrors);
      return;
    }

    setErrors({});

    try {
      if (isEditing && item) {
        const updatePayload: WatchlistUpdate = {};
        if (formData.target_buy_price.trim()) {
          updatePayload.target_buy_price = parseFloat(formData.target_buy_price);
        }
        if (formData.priority.trim()) {
          updatePayload.priority = parseInt(formData.priority, 10);
        }
        if (formData.notes.trim()) {
          updatePayload.notes = formData.notes.trim();
        }

        await updateMutation.mutateAsync({ id: item.id, item: updatePayload });
      } else {
        const createPayload: WatchlistCreate = {
          ticker: formData.ticker.trim().toUpperCase(),
        };
        if (formData.target_buy_price.trim()) {
          createPayload.target_buy_price = parseFloat(formData.target_buy_price);
        }
        if (formData.priority.trim() && formData.priority.trim() !== '3') {
          createPayload.priority = parseInt(formData.priority, 10);
        }
        if (formData.notes.trim()) {
          createPayload.notes = formData.notes.trim();
        }

        await createMutation.mutateAsync(createPayload);
      }
      onClose();
    } catch (error: unknown) {
      const backendErrors = parseBackendErrors(error);
      setErrors(backendErrors);
    }
  }

  function handleChange(field: keyof FormData, value: string) {
    setFormData((prev) => ({ ...prev, [field]: value }));
    // Clear field error on change
    if (errors[field]) {
      setErrors((prev) => {
        const next = { ...prev };
        delete next[field];
        return next;
      });
    }
  }

  const isSubmitting = createMutation.isPending || updateMutation.isPending;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      role="dialog"
      aria-modal="true"
      aria-labelledby="watchlist-form-title"
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/50 dark:bg-black/70" onClick={onClose} />

      {/* Modal */}
      <div className="relative z-10 w-full max-w-lg mx-4 bg-white dark:bg-gray-800 rounded-xl shadow-xl overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700">
          <h2
            id="watchlist-form-title"
            className="text-lg font-semibold text-gray-900 dark:text-gray-100"
          >
            {isEditing ? 'Edit Watchlist Item' : 'Add to Watchlist'}
          </h2>
        </div>

        <form onSubmit={handleSubmit} className="px-6 py-4 space-y-4 max-h-[70vh] overflow-y-auto">
          {errors.general && (
            <div className="p-3 text-sm text-red-700 dark:text-red-400 bg-red-50 dark:bg-red-900/20 rounded-lg">
              {errors.general}
            </div>
          )}

          {/* Ticker */}
          <div>
            <label
              htmlFor="watchlist-ticker"
              className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
            >
              Ticker <span className="text-red-500">*</span>
            </label>
            <input
              id="watchlist-ticker"
              type="text"
              value={formData.ticker}
              onChange={(e) => handleChange('ticker', e.target.value.toUpperCase())}
              disabled={isEditing}
              maxLength={5}
              placeholder="e.g. AAPL"
              className={`w-full px-3 py-2 text-sm rounded-lg border ${
                errors.ticker
                  ? 'border-red-500 dark:border-red-400'
                  : 'border-gray-300 dark:border-gray-600'
              } bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400 disabled:opacity-50 disabled:cursor-not-allowed`}
            />
            {errors.ticker && (
              <p className="mt-1 text-xs text-red-600 dark:text-red-400">{errors.ticker}</p>
            )}
          </div>

          {/* Target Buy Price */}
          <div>
            <label
              htmlFor="watchlist-target-buy-price"
              className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
            >
              Target Buy Price
            </label>
            <input
              id="watchlist-target-buy-price"
              type="number"
              step="0.01"
              min="0.01"
              max="999999.99"
              value={formData.target_buy_price}
              onChange={(e) => handleChange('target_buy_price', e.target.value)}
              placeholder="e.g. 150.00"
              className={`w-full px-3 py-2 text-sm rounded-lg border ${
                errors.target_buy_price
                  ? 'border-red-500 dark:border-red-400'
                  : 'border-gray-300 dark:border-gray-600'
              } bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400`}
            />
            {errors.target_buy_price && (
              <p className="mt-1 text-xs text-red-600 dark:text-red-400">
                {errors.target_buy_price}
              </p>
            )}
            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
              Optional. Range: $0.01 – $999,999.99
            </p>
          </div>

          {/* Priority */}
          <div>
            <label
              htmlFor="watchlist-priority"
              className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
            >
              Priority
            </label>
            <select
              id="watchlist-priority"
              value={formData.priority}
              onChange={(e) => handleChange('priority', e.target.value)}
              className={`w-full px-3 py-2 text-sm rounded-lg border ${
                errors.priority
                  ? 'border-red-500 dark:border-red-400'
                  : 'border-gray-300 dark:border-gray-600'
              } bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400`}
            >
              <option value="1">1 – Highest</option>
              <option value="2">2 – High</option>
              <option value="3">3 – Medium</option>
              <option value="4">4 – Low</option>
              <option value="5">5 – Lowest</option>
            </select>
            {errors.priority && (
              <p className="mt-1 text-xs text-red-600 dark:text-red-400">{errors.priority}</p>
            )}
          </div>

          {/* Notes */}
          <div>
            <label
              htmlFor="watchlist-notes"
              className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
            >
              Notes
            </label>
            <textarea
              id="watchlist-notes"
              value={formData.notes}
              onChange={(e) => handleChange('notes', e.target.value)}
              placeholder="Optional notes about this watchlist item..."
              rows={3}
              maxLength={500}
              className={`w-full px-3 py-2 text-sm rounded-lg border ${
                errors.notes
                  ? 'border-red-500 dark:border-red-400'
                  : 'border-gray-300 dark:border-gray-600'
              } bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400 resize-none`}
            />
            {errors.notes && (
              <p className="mt-1 text-xs text-red-600 dark:text-red-400">{errors.notes}</p>
            )}
            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
              {formData.notes.length}/500 characters
            </p>
          </div>
        </form>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-200 dark:border-gray-700 flex justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            disabled={isSubmitting}
            className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 focus:outline-none focus:ring-2 focus:ring-gray-400 transition-colors disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="submit"
            onClick={handleSubmit}
            disabled={isSubmitting}
            className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 dark:focus:ring-offset-gray-800 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isSubmitting ? 'Saving...' : isEditing ? 'Save Changes' : 'Add to Watchlist'}
          </button>
        </div>
      </div>
    </div>
  );
}
