import React, { useEffect, useState } from 'react';
import { useCreateOption, useUpdateOption } from '../../hooks';

function getStatusOptions(tradeType: string): { value: string; label: string }[] {
  const isCredit = tradeType.startsWith('sell_');
  if (isCredit) {
    return [
      { value: 'open', label: 'Open' },
      { value: 'closed', label: 'Closed — bought back early' },
      { value: 'expired_worthless', label: 'Expired worthless — full premium kept' },
      {
        value: 'assigned',
        label:
          tradeType === 'sell_put'
            ? 'Assigned — bought shares at strike'
            : 'Assigned — shares called away at strike',
      },
    ];
  }
  return [
    { value: 'open', label: 'Open' },
    { value: 'closed', label: 'Closed — sold to close' },
    { value: 'expired_worthless', label: 'Expired worthless — full premium lost' },
  ];
}

const inputClass =
  'w-full px-3 py-2.5 rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-900 dark:text-white text-sm placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-400 dark:focus:ring-slate-500 focus:border-transparent transition';

const labelClass =
  'block text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1.5';

export default function OptionsLogForm({
  editing,
  onClose,
}: {
  editing?: any;
  onClose: () => void;
}) {
  const create = useCreateOption();
  const update = useUpdateOption();
  const [tradeType, setTradeType] = useState<string>(editing?.trade_type ?? 'sell_put');
  const [status, setStatus] = useState<string>(editing?.status ?? 'open');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const statusOptions = getStatusOptions(tradeType);

  useEffect(() => {
    setTradeType(editing?.trade_type ?? 'sell_put');
    setStatus(editing?.status ?? 'open');
  }, [editing]);

  function handleTradeTypeChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const next = e.target.value;
    setTradeType(next);
    const valid = getStatusOptions(next).map((o) => o.value);
    if (!valid.includes(status)) setStatus('open');
  }

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const payload: any = {
      ticker: fd.get('ticker')?.toString().toUpperCase(),
      trade_type: fd.get('trade_type'),
      strike_price: Number(fd.get('strike_price')),
      premium: Number(fd.get('premium')),
      contracts: Number(fd.get('contracts')),
      open_date: fd.get('open_date'),
      expiry_date: fd.get('expiry_date'),
      status: fd.get('status'),
      close_price: fd.get('close_price') ? Number(fd.get('close_price')) : null,
      notes: fd.get('notes')?.toString() || null,
    };

    setErrorMsg(null);
    if (!payload.ticker) return setErrorMsg('Ticker is required');
    if (!(payload.strike_price > 0)) return setErrorMsg('Strike price must be greater than 0');
    if (!(payload.premium > 0)) return setErrorMsg('Premium must be greater than 0');
    if (!(payload.contracts >= 1)) return setErrorMsg('Contracts must be at least 1');
    if (new Date(payload.expiry_date) <= new Date(payload.open_date))
      return setErrorMsg('Expiry date must be after open date');
    if (payload.status === 'closed' && !(payload.close_price > 0))
      return setErrorMsg('Close price is required when status is Closed');

    try {
      if (editing) await update.mutateAsync({ id: editing.id, payload });
      else await create.mutateAsync(payload);
      setSuccessMsg(editing ? 'Trade updated' : 'Trade logged');
      setTimeout(onClose, 500);
    } catch (err: any) {
      setErrorMsg(err?.message || 'Save failed. Please try again.');
    }
  }

  return (
    <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl overflow-hidden">
      {/* header */}
      <div className="bg-slate-900 dark:bg-slate-950 px-6 py-5 flex items-center justify-between">
        <div>
          <h2 className="text-base font-bold text-white">
            {editing ? 'Edit trade' : 'Log a trade'}
          </h2>
          <p className="text-xs text-slate-400 mt-0.5">
            {editing ? 'Update the details below' : 'Record a new options position'}
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

      <form onSubmit={submit} className="p-6 space-y-5">
        {errorMsg && (
          <div className="flex items-center gap-2 px-3 py-2.5 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 16 16"
              fill="currentColor"
              className="w-4 h-4 text-red-500 flex-shrink-0"
            >
              <path
                fillRule="evenodd"
                d="M8 15A7 7 0 1 0 8 1a7 7 0 0 0 0 14Zm0-4a.75.75 0 0 1-.75-.75v-3.5a.75.75 0 0 1 1.5 0v3.5A.75.75 0 0 1 8 11Zm0 3a1 1 0 1 1 0-2 1 1 0 0 1 0 2Z"
                clipRule="evenodd"
              />
            </svg>
            <span className="text-sm text-red-700 dark:text-red-400">{errorMsg}</span>
          </div>
        )}
        {successMsg && (
          <div className="flex items-center gap-2 px-3 py-2.5 rounded-lg bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 16 16"
              fill="currentColor"
              className="w-4 h-4 text-emerald-500 flex-shrink-0"
            >
              <path
                fillRule="evenodd"
                d="M8 15A7 7 0 1 0 8 1a7 7 0 0 0 0 14Zm3.844-8.791a.75.75 0 0 0-1.188-.918l-3.7 4.79-1.649-1.833a.75.75 0 1 0-1.114 1.004l2.25 2.5a.75.75 0 0 0 1.15-.043l4.25-5.5Z"
                clipRule="evenodd"
              />
            </svg>
            <span className="text-sm text-emerald-700 dark:text-emerald-400">{successMsg}</span>
          </div>
        )}

        {/* row 1: ticker + trade type */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label htmlFor="ticker" className={labelClass}>
              Ticker
            </label>
            <input
              id="ticker"
              name="ticker"
              defaultValue={editing?.ticker ?? ''}
              placeholder="AAPL"
              className={`${inputClass} uppercase`}
              required
            />
          </div>
          <div>
            <label htmlFor="trade_type" className={labelClass}>
              Strategy
            </label>
            <select
              id="trade_type"
              name="trade_type"
              value={tradeType}
              onChange={handleTradeTypeChange}
              className={inputClass}
            >
              <option value="sell_put">Sell Put — Cash-Secured</option>
              <option value="sell_call">Sell Call — Covered</option>
              <option value="buy_call">Buy Call</option>
              <option value="buy_put">Buy Put</option>
            </select>
          </div>
        </div>

        {/* row 2: strike + premium + contracts */}
        <div className="grid grid-cols-3 gap-4">
          <div>
            <label htmlFor="strike_price" className={labelClass}>
              Strike Price
            </label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm">
                $
              </span>
              <input
                id="strike_price"
                name="strike_price"
                type="number"
                step="0.01"
                defaultValue={editing?.strike_price ?? ''}
                placeholder="0.00"
                className={`${inputClass} pl-7`}
                required
              />
            </div>
          </div>
          <div>
            <label htmlFor="premium" className={labelClass}>
              Premium <span className="font-normal normal-case text-slate-400">(per share)</span>
            </label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm">
                $
              </span>
              <input
                id="premium"
                name="premium"
                type="number"
                step="0.01"
                defaultValue={editing?.premium ?? ''}
                placeholder="0.00"
                className={`${inputClass} pl-7`}
                required
              />
            </div>
          </div>
          <div>
            <label htmlFor="contracts" className={labelClass}>
              Contracts
            </label>
            <input
              id="contracts"
              name="contracts"
              type="number"
              defaultValue={editing?.contracts ?? 1}
              className={inputClass}
              required
            />
          </div>
        </div>

        {/* row 3: dates */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label htmlFor="open_date" className={labelClass}>
              Open Date
            </label>
            <input
              id="open_date"
              name="open_date"
              type="date"
              defaultValue={editing?.open_date ?? ''}
              className={inputClass}
              required
            />
          </div>
          <div>
            <label htmlFor="expiry_date" className={labelClass}>
              Expiration Date
            </label>
            <input
              id="expiry_date"
              name="expiry_date"
              type="date"
              defaultValue={editing?.expiry_date ?? ''}
              className={inputClass}
              required
            />
          </div>
        </div>

        {/* status */}
        <div>
          <label htmlFor="status" className={labelClass}>
            Status
          </label>
          <select
            id="status"
            name="status"
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            className={inputClass}
          >
            {statusOptions.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>

        {/* conditional: close price */}
        {status === 'closed' && (
          <div>
            <label htmlFor="close_price" className={labelClass}>
              Close Price
            </label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm">
                $
              </span>
              <input
                id="close_price"
                name="close_price"
                type="number"
                step="0.01"
                defaultValue={editing?.close_price ?? ''}
                placeholder="0.00"
                className={`${inputClass} pl-7`}
                required
              />
            </div>
            <p className="mt-1.5 text-xs text-slate-400">
              {tradeType.startsWith('sell_')
                ? 'P&L = (premium − close price) × contracts × 100'
                : 'P&L = (close price − premium) × contracts × 100'}
            </p>
          </div>
        )}
        {status !== 'closed' && <input name="close_price" type="hidden" />}

        {status === 'expired_worthless' && (
          <div className="px-4 py-3 rounded-lg bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800 text-sm text-emerald-700 dark:text-emerald-400">
            {tradeType.startsWith('sell_')
              ? 'Full premium will be recorded as gain. No close price needed.'
              : 'Full premium will be recorded as a loss. No close price needed.'}
          </div>
        )}

        {status === 'assigned' && (
          <div className="px-4 py-3 rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 text-sm text-amber-700 dark:text-amber-400">
            Premium will be recorded as gain. Remember to update cost basis in the Holdings page for
            the assigned shares.
          </div>
        )}

        {/* notes */}
        <div>
          <label htmlFor="notes" className={labelClass}>
            Notes <span className="font-normal normal-case text-slate-400">(optional)</span>
          </label>
          <textarea
            id="notes"
            name="notes"
            defaultValue={editing?.notes ?? ''}
            placeholder="Thesis, IV at entry, market conditions…"
            rows={2}
            className={inputClass}
          />
        </div>

        {/* actions */}
        <div className="flex gap-3 pt-1">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 px-4 py-2.5 rounded-lg border border-slate-200 dark:border-slate-600 text-sm font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors"
          >
            Cancel
          </button>
          <button
            type="submit"
            className="flex-1 px-4 py-2.5 rounded-lg bg-slate-900 dark:bg-white text-white dark:text-slate-900 text-sm font-semibold hover:bg-slate-700 dark:hover:bg-slate-100 transition-colors"
          >
            {editing ? 'Update trade' : 'Log trade'}
          </button>
        </div>
      </form>
    </div>
  );
}
