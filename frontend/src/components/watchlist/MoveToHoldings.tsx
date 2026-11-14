import { useState } from 'react';
import { useCreateHolding } from '../../hooks/useHoldings';
import { useDeleteWatchlistItem } from '../../hooks/useWatchlist';
import type { WatchlistItem, HoldingCreate } from '../../types';
import { AxiosError } from 'axios';

interface MoveToHoldingsProps {
  item: WatchlistItem;
  onClose: () => void;
  onSuccess: () => void;
}

interface FormErrors {
  ticker?: string;
  quantity?: string;
  buy_price?: string;
  general?: string;
}

interface FormData {
  ticker: string;
  quantity: string;
  buy_price: string;
}

export default function MoveToHoldings({ item, onClose, onSuccess }: MoveToHoldingsProps) {
  const createHoldingMutation = useCreateHolding();
  const deleteWatchlistMutation = useDeleteWatchlistItem();

  const [formData, setFormData] = useState<FormData>({
    ticker: item.ticker,
    quantity: '',
    buy_price: item.target_buy_price?.toString() ?? '',
  });

  const [errors, setErrors] = useState<FormErrors>({});
  const [moveError, setMoveError] = useState<string | null>(null);

  function validate(): FormErrors {
    const newErrors: FormErrors = {};

    // Ticker validation (pre-populated, but validate anyway)
    const ticker = formData.ticker.trim().toUpperCase();
    if (!ticker) {
      newErrors.ticker = 'Ticker is required';
    } else if (!/^[A-Z]{1,5}$/.test(ticker)) {
      newErrors.ticker = 'Ticker must be 1-5 uppercase letters';
    }

    // Quantity validation
    const quantity = parseFloat(formData.quantity);
    if (!formData.quantity.trim()) {
      newErrors.quantity = 'Quantity is required';
    } else if (isNaN(quantity) || quantity <= 0) {
      newErrors.quantity = 'Quantity must be greater than 0';
    }

    // Buy price validation
    const buyPrice = parseFloat(formData.buy_price);
    if (!formData.buy_price.trim()) {
      newErrors.buy_price = 'Buy price is required';
    } else if (isNaN(buyPrice) || buyPrice < 0.01) {
      newErrors.buy_price = 'Buy price must be at least $0.01';
    }

    return newErrors;
  }

  function parseBackendErrors(error: unknown): string {
    if (error instanceof AxiosError && error.response) {
      const data = error.response.data;
      if (data?.error) {
        return data.error;
      }
      if (data?.detail && Array.isArray(data.detail)) {
        return data.detail.map((err: { msg?: string }) => err.msg).join(', ');
      }
      if (typeof data?.detail === 'string') {
        return data.detail;
      }
    }

    if (error instanceof Error) {
      return error.message;
    }

    return 'An unexpected error occurred';
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    const validationErrors = validate();
    if (Object.keys(validationErrors).length > 0) {
      setErrors(validationErrors);
      return;
    }

    setErrors({});
    setMoveError(null);

    const holdingPayload: HoldingCreate = {
      ticker: formData.ticker.trim().toUpperCase(),
      quantity: parseFloat(formData.quantity),
      buy_price: parseFloat(formData.buy_price),
    };

    try {
      // Step 1: Create the holding
      await createHoldingMutation.mutateAsync(holdingPayload);

      // Step 2: On success, remove from watchlist
      try {
        await deleteWatchlistMutation.mutateAsync(item.id);
      } catch {
        // If delete fails, the holding was still created successfully
        // This is acceptable - the user can manually remove the watchlist item
      }

      onSuccess();
    } catch (error: unknown) {
      // Holding creation failed - retain watchlist item, show error
      const errorMessage = parseBackendErrors(error);
      setMoveError(errorMessage);
    }
  }

  function handleChange(field: keyof FormData, value: string) {
    setFormData((prev) => ({ ...prev, [field]: value }));
    if (errors[field]) {
      setErrors((prev) => {
        const next = { ...prev };
        delete next[field];
        return next;
      });
    }
    if (moveError) {
      setMoveError(null);
    }
  }

  const isSubmitting = createHoldingMutation.isPending || deleteWatchlistMutation.isPending;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      role="dialog"
      aria-modal="true"
      aria-labelledby="move-to-holdings-title"
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/50 dark:bg-black/70" onClick={onClose} />

      {/* Modal */}
      <div className="relative z-10 w-full max-w-lg mx-4 bg-white dark:bg-gray-800 rounded-xl shadow-xl overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700">
          <h2
            id="move-to-holdings-title"
            className="text-lg font-semibold text-gray-900 dark:text-gray-100"
          >
            Move to Holdings
          </h2>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            Create a holding from watchlist item{' '}
            <span className="font-medium text-gray-700 dark:text-gray-300">{item.ticker}</span>
          </p>
        </div>

        <form onSubmit={handleSubmit} className="px-6 py-4 space-y-4 max-h-[70vh] overflow-y-auto">
          {moveError && (
            <div className="p-3 text-sm text-red-700 dark:text-red-400 bg-red-50 dark:bg-red-900/20 rounded-lg">
              <p className="font-medium">Failed to create holding</p>
              <p className="mt-1">{moveError}</p>
              <p className="mt-1 text-xs text-red-600 dark:text-red-500">
                The watchlist item has been retained.
              </p>
            </div>
          )}

          {/* Ticker (pre-populated, disabled) */}
          <div>
            <label
              htmlFor="move-ticker"
              className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
            >
              Ticker
            </label>
            <input
              id="move-ticker"
              type="text"
              value={formData.ticker}
              disabled
              className="w-full px-3 py-2 text-sm rounded-lg border border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 text-gray-900 dark:text-gray-100 opacity-70 cursor-not-allowed"
            />
            {errors.ticker && (
              <p className="mt-1 text-xs text-red-600 dark:text-red-400">{errors.ticker}</p>
            )}
          </div>

          {/* Quantity */}
          <div>
            <label
              htmlFor="move-quantity"
              className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
            >
              Quantity <span className="text-red-500">*</span>
            </label>
            <input
              id="move-quantity"
              type="number"
              step="any"
              value={formData.quantity}
              onChange={(e) => handleChange('quantity', e.target.value)}
              placeholder="e.g. 10"
              className={`w-full px-3 py-2 text-sm rounded-lg border ${
                errors.quantity
                  ? 'border-red-500 dark:border-red-400'
                  : 'border-gray-300 dark:border-gray-600'
              } bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400`}
            />
            {errors.quantity && (
              <p className="mt-1 text-xs text-red-600 dark:text-red-400">{errors.quantity}</p>
            )}
          </div>

          {/* Buy Price */}
          <div>
            <label
              htmlFor="move-buy-price"
              className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
            >
              Buy Price <span className="text-red-500">*</span>
            </label>
            <input
              id="move-buy-price"
              type="number"
              step="0.01"
              value={formData.buy_price}
              onChange={(e) => handleChange('buy_price', e.target.value)}
              placeholder="e.g. 150.00"
              className={`w-full px-3 py-2 text-sm rounded-lg border ${
                errors.buy_price
                  ? 'border-red-500 dark:border-red-400'
                  : 'border-gray-300 dark:border-gray-600'
              } bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400`}
            />
            {errors.buy_price && (
              <p className="mt-1 text-xs text-red-600 dark:text-red-400">{errors.buy_price}</p>
            )}
            {item.target_buy_price && (
              <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                Pre-filled with target buy price from watchlist
              </p>
            )}
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
            className="px-4 py-2 text-sm font-medium text-white bg-green-600 rounded-lg hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-offset-2 dark:focus:ring-offset-gray-800 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isSubmitting ? 'Moving...' : 'Move to Holdings'}
          </button>
        </div>
      </div>
    </div>
  );
}
