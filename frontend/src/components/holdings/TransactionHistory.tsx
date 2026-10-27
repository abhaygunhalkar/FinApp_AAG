import { useState } from 'react';
import { AxiosError } from 'axios';
import { useTransactions, useCreateTransaction, useDeleteTransaction } from '../../hooks/useTransactions';
import { LoadingSpinner, DeleteConfirmation } from '../shared';
import { parseLocalDateString } from '../../utils/date';
import { MASK } from '../networth/format';
import { useUIStore } from '../../store/uiStore';
import { EPSILON, fillLots, openLots, round, type LotOrder } from './lots';
import type { LotSelection, Transaction, TransactionCreate } from '../../types';

interface TransactionHistoryProps {
  holdingId: number;
  ticker: string;
  /** The brokerage account of this holding; sells only use its lots. */
  broker?: string | null;
}

/** How a sell picks its lots: automatically in an order, or by hand. */
type LotMode = LotOrder | 'choose';

const LOT_MODES: { mode: LotMode; label: string }[] = [
  { mode: 'oldest', label: 'Oldest first' },
  { mode: 'highest', label: 'Highest cost' },
  { mode: 'choose', label: 'Choose lots' },
];

/** The API's error message, e.g. "The lot bought on … has only 2 shares left". */
function apiError(error: unknown, fallback: string): string {
  if (error instanceof AxiosError) {
    const message = (error.response?.data as { error?: string } | undefined)?.error;
    if (message) return message;
  }
  return fallback;
}

interface TransactionFormData {
  transaction_type: 'buy' | 'sell';
  quantity: string;
  price: string;
  fees: string;
  transaction_date: string;
  notes: string;
}

const pad = (n: number) => n.toString().padStart(2, '0');
const todayLocal = (() => {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
})();

const initialFormData: TransactionFormData = {
  transaction_type: 'buy',
  quantity: '',
  price: '',
  fees: '0',
  transaction_date: todayLocal,
  notes: '',
};

export default function TransactionHistory({ holdingId, ticker, broker }: TransactionHistoryProps) {
  const { data: transactions, isLoading } = useTransactions(holdingId);
  const createTransaction = useCreateTransaction();
  const deleteTransactionMutation = useDeleteTransaction();

  const [showForm, setShowForm] = useState(false);
  const [formData, setFormData] = useState<TransactionFormData>(initialFormData);
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});
  const [deleteTarget, setDeleteTarget] = useState<Transaction | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [lotMode, setLotMode] = useState<LotMode>('oldest');
  const [lotQty, setLotQty] = useState<Record<number, string>>({});
  const hidden = useUIStore((s) => s.hideBalances);

  const isSell = formData.transaction_type === 'sell';
  // Lots are this holding's buys, so they're all in the same brokerage account.
  const anyOpenLots = openLots(transactions ?? []).length > 0;
  const saleLots = openLots(transactions ?? [], formData.transaction_date);
  const pickLots = isSell && anyOpenLots;
  const typedQuantity = parseFloat(formData.quantity);
  const picks: LotSelection[] = !pickLots
    ? []
    : lotMode === 'choose'
      ? saleLots
          .map((lot) => ({
            buy_transaction_id: lot.id,
            quantity: parseFloat(lotQty[lot.id] ?? ''),
          }))
          .filter((p) => p.quantity > 0)
      : typedQuantity > 0
        ? fillLots(saleLots, typedQuantity, lotMode)
        : [];
  const pickedShares = round(picks.reduce((sum, p) => sum + p.quantity, 0));
  const sellQuantity = pickLots && lotMode === 'choose' ? pickedShares : typedQuantity;
  const salePrice = parseFloat(formData.price);
  const estGain =
    salePrice > 0
      ? picks.reduce((sum, p) => {
          const lot = saleLots.find((l) => l.id === p.buy_transaction_id);
          return sum + (lot ? (salePrice - lot.price) * p.quantity : 0);
        }, 0)
      : null;

  const formatCurrency = (value: number) =>
    value.toLocaleString('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2,
    });

  const formatDate = (dateStr: string) =>
    parseLocalDateString(dateStr).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });

  const validateForm = (): boolean => {
    const errors: Record<string, string> = {};
    const quantity = sellQuantity;
    const price = parseFloat(formData.price);
    const fees = parseFloat(formData.fees);

    if (pickLots && lotMode === 'choose') {
      const over = saleLots.find(
        (lot) => parseFloat(lotQty[lot.id] ?? '') > lot.remaining + EPSILON,
      );
      if (over) {
        errors.lots = `The lot bought on ${formatDate(over.date)} has only ${over.remaining} shares left`;
      } else if (quantity <= 0) {
        errors.lots = 'Enter how many shares to sell from at least one lot';
      }
    } else if (!formData.quantity || isNaN(quantity) || quantity <= 0) {
      errors.quantity = 'Quantity must be greater than 0';
    } else if (pickLots && pickedShares < quantity - EPSILON) {
      errors.quantity = `Only ${pickedShares} shares are in lots bought on or before this date`;
    }
    if (!formData.price || isNaN(price) || price < 0.01) {
      errors.price = 'Price must be at least $0.01';
    }
    if (formData.fees && (isNaN(fees) || fees < 0)) {
      errors.fees = 'Fees must be 0 or greater';
    }
    if (!formData.transaction_date) {
      errors.transaction_date = 'Date is required';
    }

    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!validateForm()) return;

    const payload: TransactionCreate = {
      ticker,
      holding_id: holdingId,
      transaction_type: formData.transaction_type,
      quantity: sellQuantity,
      price: parseFloat(formData.price),
      fees: parseFloat(formData.fees) || 0,
      transaction_date: formData.transaction_date,
      notes: formData.notes || undefined,
      lots: pickLots ? picks : undefined,
    };

    createTransaction.mutate(payload, {
      onSuccess: () => {
        setShowForm(false);
        setFormData(initialFormData);
        setFormErrors({});
        setLotQty({});
      },
    });
  };

  const openForm = () => {
    setFormData(initialFormData);
    setLotMode('oldest');
    setLotQty({});
    setFormErrors({});
    setShowForm(true);
  };

  /** Sell from one lot: the form opens with all of that lot's shares picked. */
  const openSellForLot = (lot: Transaction) => {
    const left = lot.remaining_quantity ?? 0;
    setFormData({ ...initialFormData, transaction_type: 'sell', quantity: String(left) });
    setLotMode('choose');
    setLotQty({ [lot.id]: String(left) });
    setFormErrors({});
    setShowForm(true);
  };

  const handleDelete = () => {
    if (!deleteTarget) return;
    deleteTransactionMutation.mutate(deleteTarget.id, {
      onSuccess: () => {
        setDeleteTarget(null);
        setDeleteError(null);
      },
      onError: (error) => {
        setDeleteTarget(null);
        setDeleteError(apiError(error, 'Failed to delete transaction. Please try again.'));
      },
    });
  };

  /** "3 of 10 left" for a buy; "5 from Jan 2, 2025 @ $100.00" for a sell. */
  const lotSummary = (tx: Transaction) => {
    if (tx.transaction_type === 'buy') {
      const left = tx.remaining_quantity;
      if (left == null) return '—';
      if (left <= EPSILON) return 'Sold';
      if (hidden) return `${MASK} left`;
      return left >= tx.quantity - EPSILON ? 'All open' : `${left} of ${tx.quantity} left`;
    }
    if (!tx.lots?.length) return '—';
    return tx.lots
      .map(
        (lot) =>
          `${hidden ? MASK : lot.quantity} from ${formatDate(lot.transaction_date)} @ ${formatCurrency(lot.price)}`,
      )
      .join(', ');
  };

  if (isLoading) {
    return <LoadingSpinner size="sm" />;
  }

  return (
    <div className="ml-6">
      <div className="flex items-center justify-between mb-3">
        <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300">
          Transaction History
          {broker && (
            <>
              {' '}
              <span className="whitespace-nowrap font-normal text-gray-500 dark:text-gray-400">
                · {broker}
              </span>
            </>
          )}
        </h4>
        <button
          onClick={openForm}
          className="px-3 py-1.5 text-xs font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 dark:focus:ring-offset-gray-800 transition-colors"
        >
          Record Transaction
        </button>
      </div>

      {/* Transaction Form Modal */}
      {showForm && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center"
          role="dialog"
          aria-modal="true"
          aria-labelledby="transaction-form-title"
        >
          <div
            className="absolute inset-0 bg-black/50 dark:bg-black/70"
            onClick={() => {
              setShowForm(false);
              setFormErrors({});
            }}
          />
          <div className="relative z-10 w-full max-w-md mx-4 p-6 bg-white dark:bg-gray-800 rounded-xl shadow-xl">
            <h2
              id="transaction-form-title"
              className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4"
            >
              Record Transaction — {ticker}
              {broker && (
                <>
                  {' '}
                  <span className="whitespace-nowrap font-normal text-gray-500 dark:text-gray-400">
                    · {broker}
                  </span>
                </>
              )}
            </h2>
            <form onSubmit={handleSubmit} className="space-y-4">
              {/* Type Selector */}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Type
                </label>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setFormData({ ...formData, transaction_type: 'buy' })}
                    className={`flex-1 px-3 py-2 text-sm font-medium rounded-lg border transition-colors ${
                      formData.transaction_type === 'buy'
                        ? 'bg-green-100 dark:bg-green-900/30 border-green-500 text-green-700 dark:text-green-400'
                        : 'bg-white dark:bg-gray-700 border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-600'
                    }`}
                  >
                    Buy
                  </button>
                  <button
                    type="button"
                    onClick={() => setFormData({ ...formData, transaction_type: 'sell' })}
                    className={`flex-1 px-3 py-2 text-sm font-medium rounded-lg border transition-colors ${
                      formData.transaction_type === 'sell'
                        ? 'bg-red-100 dark:bg-red-900/30 border-red-500 text-red-700 dark:text-red-400'
                        : 'bg-white dark:bg-gray-700 border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-600'
                    }`}
                  >
                    Sell
                  </button>
                </div>
              </div>

              {/* Quantity */}
              <div>
                <label htmlFor="tx-quantity" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Quantity
                </label>
                <input
                  id="tx-quantity"
                  type="number"
                  step="any"
                  min="0.01"
                  value={
                    pickLots && lotMode === 'choose' ? String(pickedShares) : formData.quantity
                  }
                  readOnly={pickLots && lotMode === 'choose'}
                  onChange={(e) => setFormData({ ...formData, quantity: e.target.value })}
                  className={`w-full px-3 py-2 text-sm border rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500 read-only:bg-gray-50 read-only:text-gray-500 dark:read-only:bg-gray-800 ${
                    formErrors.quantity ? 'border-red-500' : 'border-gray-300 dark:border-gray-600'
                  }`}
                  placeholder="e.g. 10"
                />
                {pickLots && lotMode === 'choose' && (
                  <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                    Total of the shares chosen from each lot below
                  </p>
                )}
                {formErrors.quantity && (
                  <p className="mt-1 text-xs text-red-600 dark:text-red-400">{formErrors.quantity}</p>
                )}
              </div>

              {/* Price */}
              <div>
                <label htmlFor="tx-price" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Price per Share
                </label>
                <input
                  id="tx-price"
                  type="number"
                  step="0.01"
                  min="0.01"
                  value={formData.price}
                  onChange={(e) => setFormData({ ...formData, price: e.target.value })}
                  className={`w-full px-3 py-2 text-sm border rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                    formErrors.price ? 'border-red-500' : 'border-gray-300 dark:border-gray-600'
                  }`}
                  placeholder="e.g. 150.00"
                />
                {formErrors.price && (
                  <p className="mt-1 text-xs text-red-600 dark:text-red-400">{formErrors.price}</p>
                )}
              </div>

              {/* Lots to sell from */}
              {pickLots && (
                <fieldset>
                  <legend className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Sell from{broker ? ` (${broker} lots)` : ''}
                  </legend>
                  <div className="flex gap-1 mb-2" role="group" aria-label="How to pick lots">
                    {LOT_MODES.map(({ mode, label }) => (
                      <button
                        key={mode}
                        type="button"
                        aria-pressed={lotMode === mode}
                        onClick={() => {
                          if (mode === 'choose' && lotMode !== 'choose') {
                            // Start from what the automatic order picked.
                            setLotQty(
                              Object.fromEntries(
                                picks.map((p) => [p.buy_transaction_id, String(p.quantity)]),
                              ),
                            );
                          }
                          if (mode !== 'choose' && lotMode === 'choose') {
                            setFormData({
                              ...formData,
                              quantity: pickedShares ? String(pickedShares) : '',
                            });
                          }
                          setLotMode(mode);
                        }}
                        className={`flex-1 px-2 py-1 text-xs font-medium rounded-md border transition-colors ${
                          lotMode === mode
                            ? 'bg-blue-50 dark:bg-blue-900/30 border-blue-500 text-blue-700 dark:text-blue-300'
                            : 'bg-white dark:bg-gray-700 border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-600'
                        }`}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                  {saleLots.length === 0 ? (
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                      No lots bought on or before this date have shares left.
                    </p>
                  ) : (
                    <div className="max-h-48 overflow-y-auto rounded-lg border border-gray-200 dark:border-gray-700">
                      <table className="w-full text-xs tabular-nums">
                        <thead className="sticky top-0 bg-gray-50 dark:bg-gray-900 text-gray-500 dark:text-gray-400">
                          <tr className="text-left">
                            <th className="px-2 py-1 font-medium">Bought</th>
                            <th className="px-2 py-1 font-medium text-right">Cost</th>
                            <th className="px-2 py-1 font-medium text-right">Left</th>
                            <th className="px-2 py-1 font-medium text-right">Sell</th>
                          </tr>
                        </thead>
                        <tbody>
                          {saleLots.map((lot) => {
                            const picked =
                              picks.find((p) => p.buy_transaction_id === lot.id)?.quantity ?? 0;
                            return (
                              <tr
                                key={lot.id}
                                className="border-t border-gray-100 dark:border-gray-700/50 text-gray-900 dark:text-gray-100"
                              >
                                <td className="px-2 py-1">{formatDate(lot.date)}</td>
                                <td className="px-2 py-1 text-right">
                                  {formatCurrency(lot.price)}
                                </td>
                                <td className="px-2 py-1 text-right">
                                  {hidden ? MASK : lot.remaining}
                                </td>
                                <td className="px-2 py-1 text-right">
                                  {lotMode === 'choose' ? (
                                    <input
                                      type="number"
                                      step="any"
                                      min="0"
                                      aria-label={`Shares to sell from the lot bought ${formatDate(lot.date)}`}
                                      value={lotQty[lot.id] ?? ''}
                                      onChange={(e) =>
                                        setLotQty({ ...lotQty, [lot.id]: e.target.value })
                                      }
                                      className="w-20 px-1.5 py-0.5 text-right border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
                                      placeholder="0"
                                    />
                                  ) : (
                                    <span className={picked ? 'font-semibold' : 'text-gray-400'}>
                                      {hidden ? MASK : picked}
                                    </span>
                                  )}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                  {formErrors.lots && (
                    <p className="mt-1 text-xs text-red-600 dark:text-red-400">{formErrors.lots}</p>
                  )}
                  {estGain !== null && picks.length > 0 && (
                    <p className="mt-1 text-xs text-gray-600 dark:text-gray-400">
                      Est. realized gain on these lots:{' '}
                      <span
                        className={`font-semibold ${
                          estGain >= 0
                            ? 'text-green-600 dark:text-green-400'
                            : 'text-red-600 dark:text-red-400'
                        }`}
                      >
                        {hidden
                          ? MASK
                          : `${estGain >= 0 ? '+' : '−'}${formatCurrency(Math.abs(estGain))}`}
                      </span>
                    </p>
                  )}
                </fieldset>
              )}

              {/* Fees */}
              <div>
                <label htmlFor="tx-fees" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Fees
                </label>
                <input
                  id="tx-fees"
                  type="number"
                  step="0.01"
                  min="0"
                  value={formData.fees}
                  onChange={(e) => setFormData({ ...formData, fees: e.target.value })}
                  className={`w-full px-3 py-2 text-sm border rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                    formErrors.fees ? 'border-red-500' : 'border-gray-300 dark:border-gray-600'
                  }`}
                  placeholder="0.00"
                />
                {formErrors.fees && (
                  <p className="mt-1 text-xs text-red-600 dark:text-red-400">{formErrors.fees}</p>
                )}
              </div>

              {/* Date */}
              <div>
                <label htmlFor="tx-date" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Transaction Date
                </label>
                <input
                  id="tx-date"
                  type="date"
                  value={formData.transaction_date}
                  onChange={(e) => setFormData({ ...formData, transaction_date: e.target.value })}
                  className={`w-full px-3 py-2 text-sm border rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                    formErrors.transaction_date ? 'border-red-500' : 'border-gray-300 dark:border-gray-600'
                  }`}
                />
                {formErrors.transaction_date && (
                  <p className="mt-1 text-xs text-red-600 dark:text-red-400">{formErrors.transaction_date}</p>
                )}
              </div>

              {/* Notes */}
              <div>
                <label htmlFor="tx-notes" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Notes (optional)
                </label>
                <textarea
                  id="tx-notes"
                  value={formData.notes}
                  onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                  rows={2}
                  className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="Optional notes about this transaction"
                />
              </div>

              {/* Error from API */}
              {createTransaction.isError && (
                <p className="text-xs text-red-600 dark:text-red-400">
                  {apiError(
                    createTransaction.error,
                    'Failed to record transaction. Please try again.',
                  )}
                </p>
              )}

              {/* Actions */}
              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => {
                    setShowForm(false);
                    setFormErrors({});
                  }}
                  className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 focus:outline-none focus:ring-2 focus:ring-gray-400 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={createTransaction.isPending}
                  className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 dark:focus:ring-offset-gray-800 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {createTransaction.isPending ? 'Saving...' : 'Save Transaction'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {deleteError && (
        <p role="alert" className="mb-2 text-xs text-red-600 dark:text-red-400">
          {deleteError}
        </p>
      )}

      {/* Transaction Table */}
      {transactions && transactions.length > 0 ? (
        <table className="w-auto text-sm">
          <thead>
            <tr className="text-left text-gray-500 dark:text-gray-400 border-b border-gray-200 dark:border-gray-700">
              <th className="pb-1 pr-4">Type</th>
              <th className="pb-1 pr-4">Quantity</th>
              <th className="pb-1 pr-4">Price</th>
              <th className="pb-1 pr-4">Fees</th>
              <th className="pb-1 pr-4">Date</th>
              <th className="pb-1 pr-4">Lot</th>
              <th className="pb-1 pr-4">Notes</th>
              <th className="pb-1">Actions</th>
            </tr>
          </thead>
          <tbody>
            {transactions.map((tx) => (
              <tr
                key={tx.id}
                className="border-b border-gray-100 dark:border-gray-700/50"
              >
                <td className="py-1.5 pr-4">
                  <span
                    className={
                      tx.transaction_type === 'buy'
                        ? 'text-green-600 dark:text-green-400 capitalize font-medium'
                        : 'text-red-600 dark:text-red-400 capitalize font-medium'
                    }
                  >
                    {tx.transaction_type}
                  </span>
                </td>
                <td className="py-1.5 pr-4 text-gray-900 dark:text-gray-100">
                  {hidden ? MASK : tx.quantity}
                </td>
                <td className="py-1.5 pr-4 text-gray-900 dark:text-gray-100">
                  {formatCurrency(tx.price)}
                </td>
                <td className="py-1.5 pr-4 text-gray-900 dark:text-gray-100">
                  {formatCurrency(tx.fees)}
                </td>
                <td className="py-1.5 pr-4 text-gray-900 dark:text-gray-100">
                  {formatDate(tx.transaction_date)}
                </td>
                <td className="py-1.5 pr-4 text-gray-500 dark:text-gray-400 text-xs">
                  {lotSummary(tx)}
                </td>
                <td className="py-1.5 pr-4 text-gray-500 dark:text-gray-400 max-w-[150px] truncate">
                  {tx.notes ?? '—'}
                </td>
                <td className="py-1.5 whitespace-nowrap">
                  {tx.transaction_type === 'buy' && (tx.remaining_quantity ?? 0) > EPSILON && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        openSellForLot(tx);
                      }}
                      className="mr-2 px-2 py-0.5 text-xs font-medium text-red-700 dark:text-red-300 border border-red-300 dark:border-red-700 rounded hover:bg-red-50 dark:hover:bg-red-900/30 focus:outline-none focus:ring-2 focus:ring-red-400 transition-colors"
                      aria-label={`Sell from the lot bought ${formatDate(tx.transaction_date)}`}
                    >
                      Sell
                    </button>
                  )}
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setDeleteTarget(tx);
                    }}
                    className="text-red-500 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300 focus:outline-none focus:ring-2 focus:ring-red-400 rounded p-0.5 transition-colors"
                    aria-label={`Delete transaction from ${formatDate(tx.transaction_date)}`}
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <p className="text-sm text-gray-500 dark:text-gray-400">
          No transactions recorded.
        </p>
      )}

      {/* Delete Confirmation Dialog */}
      {deleteTarget && (
        <DeleteConfirmation
          title="Delete Transaction"
          message={`Are you sure you want to delete this ${deleteTarget.transaction_type} transaction for ${deleteTarget.quantity} shares at ${formatCurrency(deleteTarget.price)}? The holding will be recalculated.`}
          onConfirm={handleDelete}
          onCancel={() => setDeleteTarget(null)}
        />
      )}
    </div>
  );
}
