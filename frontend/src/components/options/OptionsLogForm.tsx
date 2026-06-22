import React, { useEffect, useState } from 'react';
import { useCreateOption, useUpdateOption } from '../../hooks';

// Backend only accepts these four status values (see OptionsTradeCreate schema).
// Which ones are meaningful depends on whether the trade is a credit (sell_*,
// premium collected up front) or debit (buy_*, premium paid up front) position.
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

export default function OptionsLogForm({ editing, onClose }: { editing?: any; onClose: () => void }) {
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
    const nextTradeType = e.target.value;
    setTradeType(nextTradeType);
    const validValues = getStatusOptions(nextTradeType).map((o) => o.value);
    if (!validValues.includes(status)) {
      setStatus('open');
    }
  }

  async function submit(e: any) {
    e.preventDefault();
    const fd = new FormData(e.target);
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
    if (new Date(payload.expiry_date) <= new Date(payload.open_date)) return setErrorMsg('Expiry date must be after open date');
    if (payload.status === 'closed' && !(payload.close_price > 0)) return setErrorMsg('Close price is required when status is Closed');

    try {
      if (editing) {
        await update.mutateAsync({ id: editing.id, payload });
      } else {
        await create.mutateAsync(payload);
      }
      setSuccessMsg(editing ? 'Trade updated' : 'Trade logged');
      // close modal after brief success message display
      setTimeout(() => {
        onClose();
      }, 500);
    } catch (err: any) {
      setErrorMsg(err?.message || 'Save failed. Please try again.');
    }
  }

  return (
    <div>
      <form onSubmit={submit} className="w-full">
        <h2 className="text-lg font-semibold mb-3">{editing ? 'Edit trade' : 'Log a trade'}</h2>
        {errorMsg && <div className="mb-3 text-sm text-red-700">{errorMsg}</div>}
        {successMsg && <div className="mb-3 text-sm text-emerald-700">{successMsg}</div>}

        <div className="grid grid-cols-2 gap-3">
          <input name="ticker" defaultValue={editing?.ticker ?? ''} placeholder="Ticker" className="p-2 border rounded" required />
          <select name="trade_type" value={tradeType} onChange={handleTradeTypeChange} className="p-2 border rounded">
            <option value="sell_put">sell_put</option>
            <option value="sell_call">sell_call</option>
            <option value="buy_call">buy_call</option>
            <option value="buy_put">buy_put</option>
          </select>

          <input name="strike_price" type="number" step="0.01" defaultValue={editing?.strike_price ?? ''} placeholder="Strike" className="p-2 border rounded" required />
          <input name="premium" type="number" step="0.01" defaultValue={editing?.premium ?? ''} placeholder="Premium" className="p-2 border rounded" required />

          <input name="contracts" type="number" defaultValue={editing?.contracts ?? 1} placeholder="Contracts" className="p-2 border rounded" required />
          <input name="open_date" type="date" defaultValue={editing?.open_date ?? ''} className="p-2 border rounded" required />

          <input name="expiry_date" type="date" defaultValue={editing?.expiry_date ?? ''} className="p-2 border rounded" required />
          <select name="status" value={status} onChange={(e) => setStatus(e.target.value)} className="p-2 border rounded">
            {statusOptions.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>

          {status === 'closed' && (
            <div className="col-span-2">
              <input name="close_price" type="number" step="0.01" defaultValue={editing?.close_price ?? ''} placeholder="Close Price" className="p-2 border rounded w-full" required />
              <p className="text-xs text-gray-500 mt-1">
                {tradeType.startsWith('sell_')
                  ? 'P&L = (premium − close price) × contracts × 100'
                  : 'P&L = (close price − premium) × contracts × 100'}
              </p>
            </div>
          )}
          {status === 'expired_worthless' && (
            <div className="col-span-2 p-3 rounded bg-emerald-50 text-emerald-700">
              {tradeType.startsWith('sell_')
                ? 'Full premium will be recorded as gain. No close price needed.'
                : 'Full premium will be recorded as a loss. No close price needed.'}
            </div>
          )}
          {status === 'assigned' && (
            <div className="col-span-2 p-3 rounded bg-amber-50 text-amber-700">Premium will be recorded as gain. Remember to update cost basis in holdings page for the assigned shares.</div>
          )}
          {status === 'open' && <div className="col-span-2" />}
          {status !== 'closed' && <input name="close_price" type="hidden" />}

          <textarea name="notes" defaultValue={editing?.notes ?? ''} placeholder="Notes" className="col-span-2 p-2 border rounded" />
        </div>

        <div className="mt-3 flex gap-2 justify-end">
          <button type="button" onClick={onClose} className="px-3 py-1 border rounded">Cancel</button>
          <button type="submit" className="px-3 py-1 bg-blue-600 text-white rounded">{editing ? 'Update trade' : 'Log trade'}</button>
        </div>
      </form>
    </div>
  );
}
