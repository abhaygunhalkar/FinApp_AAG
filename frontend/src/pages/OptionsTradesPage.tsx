import { useEffect, useMemo, useRef, useState } from 'react';
import { useOptions, useCreateOption, useUpdateOption, useDeleteOption, useOptionsSummary, useOpenTradeQuotes } from '../hooks';
import { parseLocalDateString } from '../utils/date';
import OptionsLogForm from '../components/options/OptionsLogForm';

const TYPE_COLORS: Record<string, string> = {
  sell_put: 'bg-sky-100 text-sky-800', // cash-secured put -> blue
  sell_call: 'bg-teal-100 text-teal-800', // covered call -> teal
  buy_call: 'bg-amber-100 text-amber-800', // buy call -> amber
  buy_put: 'bg-red-100 text-red-800',
};

const TRADE_LABELS: Record<string, string> = {
  sell_call: 'Covered call',
  sell_put: 'Cash-secured put',
  buy_call: 'Buy call',
  buy_put: 'Buy put',
};

const STATUS_COLORS: Record<string, string> = {
  open: 'bg-sky-100 text-sky-700',
  closed: 'bg-gray-100 text-gray-700',
  expired_worthless: 'bg-emerald-100 text-emerald-700',
  assigned: 'bg-amber-100 text-amber-700',
};

export default function OptionsTradesPage() {
  const { data: trades } = useOptions();
  const summary = useOptionsSummary();
  const quotes = useOpenTradeQuotes();
  const create = useCreateOption();
  const update = useUpdateOption();
  const remove = useDeleteOption();

  const [filter, setFilter] = useState<'all' | 'open' | 'closed' | 'expired_worthless' | 'assigned'>('open');
  const [editing, setEditing] = useState<any | null>(null);
  const formRef = useRef<HTMLFormElement | null>(null);
  const [status, setStatus] = useState<string>('open');
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [modalEditing, setModalEditing] = useState<any | null>(null);

  type SortKey = 'ticker' | 'type' | 'strike' | 'premium' | 'current_price' | 'contracts' | 'expiry' | 'status' | 'pnl';
  const [sortKey, setSortKey] = useState<SortKey>('expiry');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');

  function toggleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDir('asc');
    }
  }

  function sortIndicator(key: SortKey) {
    if (sortKey !== key) return null;
    return <span className="ml-1">{sortDir === 'asc' ? '▲' : '▼'}</span>;
  }

  const filtered = useMemo(() => {
    if (!trades) return [];
    if (filter === 'all') return trades;
    return trades.filter((t: any) => t.status === filter);
  }, [trades, filter]);

  function formatCurrency(v: number) {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2 }).format(v);
  }

  const rows = useMemo(() => {
    return filtered.map((t: any) => {
      const expiryDate = parseLocalDateString(t.expiry_date);
      const daysLeft = Math.ceil((expiryDate.getTime() - Date.now()) / (24 * 3600 * 1000));
      const expired = daysLeft < 0;
      const countdownClass = expired ? 'text-red-600' : daysLeft <= 7 ? 'text-red-600' : daysLeft <= 30 ? 'text-amber-600' : 'text-gray-500';
      const isCredit = t.trade_type.startsWith('sell_');
      const amount = (t.premium || 0) * (t.contracts || 0) * 100;
      const signedAmount = isCredit ? amount : -amount;
      const quote = quotes.data?.[String(t.id)];
      const displayPnl = t.status === 'open' ? quote?.unrealized_pnl : t.pnl;
      return { trade: t, expiryDate, daysLeft, expired, countdownClass, isCredit, amount, signedAmount, quote, displayPnl };
    });
  }, [filtered, quotes.data]);

  const sortedRows = useMemo(() => {
    const dir = sortDir === 'asc' ? 1 : -1;
    const getValue = (r: (typeof rows)[number]): string | number => {
      switch (sortKey) {
        case 'ticker':
          return r.trade.ticker;
        case 'type':
          return TRADE_LABELS[r.trade.trade_type] ?? r.trade.trade_type;
        case 'strike':
          return r.trade.strike_price;
        case 'premium':
          return r.signedAmount;
        case 'current_price':
          return r.quote?.current_price ?? -Infinity;
        case 'contracts':
          return r.trade.contracts;
        case 'expiry':
          return r.expiryDate.getTime();
        case 'status':
          return r.trade.status;
        case 'pnl':
          return r.displayPnl ?? -Infinity;
        default:
          return 0;
      }
    };
    return [...rows].sort((a, b) => {
      const va = getValue(a);
      const vb = getValue(b);
      if (typeof va === 'string' && typeof vb === 'string') {
        return va.localeCompare(vb) * dir;
      }
      return ((va as number) - (vb as number)) * dir;
    });
  }, [rows, sortKey, sortDir]);

  function startEdit(trade: any) {
    // open modal in edit mode
    setModalEditing(trade);
    setModalOpen(true);
  }

  function clearForm() {
    setEditing(null);
    setStatus('open');
    setErrorMsg(null);
    setModalEditing(null);
  }

  useEffect(() => {
    if (modalEditing) {
      setStatus(modalEditing.status ?? 'open');
    }
  }, [modalEditing]);

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

    // client-side validation
    setErrorMsg(null);
    if (!payload.ticker) return setErrorMsg('Ticker is required');
    if (!(payload.strike_price > 0)) return setErrorMsg('Strike price must be greater than 0');
    if (!(payload.premium > 0)) return setErrorMsg('Premium must be greater than 0');
    if (!(payload.contracts >= 1)) return setErrorMsg('Contracts must be at least 1');
    if (parseLocalDateString(payload.expiry_date) <= parseLocalDateString(payload.open_date)) return setErrorMsg('Expiry date must be after open date');
    if (payload.status === 'closed' && !(payload.close_price > 0)) return setErrorMsg('Close price is required when status is Closed');

    try {
      if (editing) {
        await update.mutateAsync({ id: editing.id, payload });
      } else {
        await create.mutateAsync(payload);
      }
      clearForm();
      (e.target as HTMLFormElement).reset();
      setSuccessMsg(editing ? 'Trade updated' : 'Trade logged');
      setTimeout(() => setSuccessMsg(null), 3000);
    } catch (err) {
      setErrorMsg('Save failed');
    }
  }

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold">Options Trades</h1>
        <div className="text-sm text-gray-500">
          Total P&L: {summary.data ? `$${summary.data.total_pnl}` : '—'} • Open: {summary.data?.open_positions ?? '—'} • Win Rate: {summary.data?.win_rate ?? '—'}%
        </div>
      </div>

      <div className="mb-4 flex items-center gap-3">
        <div className="flex flex-wrap items-center gap-2">
          {['all','open','closed','expired_worthless','assigned'].map((k) => {
            const labels: Record<string, string> = { all: 'All', open: 'Open', closed: 'Closed', expired_worthless: 'Expired worthless', assigned: 'Assigned' };
            return (
              <button
                key={k}
                onClick={() => setFilter(k as any)}
                className={`inline-flex items-center px-4 py-2 text-sm font-medium rounded-full transition-all focus:outline-none focus:ring-2 focus:ring-offset-1 ${
                  filter === k
                    ? 'bg-blue-600 text-white shadow-md'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                {labels[k] ?? k}
              </button>
            );
          })}
        </div>
        <div className="ml-auto">
          <button onClick={() => { setModalEditing(null); setModalOpen(true); }} className="px-4 py-2 bg-green-600 text-white rounded-full text-sm font-medium hover:bg-green-700">Log a trade</button>
        </div>
      </div>

      <div className="overflow-x-auto bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4 mb-4">
        <table className="min-w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-gray-500">
              <th className="px-3 py-2 cursor-pointer select-none hover:text-gray-700" onClick={() => toggleSort('ticker')}>Ticker{sortIndicator('ticker')}</th>
              <th className="cursor-pointer select-none hover:text-gray-700" onClick={() => toggleSort('type')}>Type{sortIndicator('type')}</th>
              <th className="cursor-pointer select-none hover:text-gray-700" onClick={() => toggleSort('strike')}>Strike{sortIndicator('strike')}</th>
              <th className="cursor-pointer select-none hover:text-gray-700" onClick={() => toggleSort('premium')}>Premium{sortIndicator('premium')}</th>
              <th className="cursor-pointer select-none hover:text-gray-700" onClick={() => toggleSort('current_price')}>Current Price{sortIndicator('current_price')}</th>
              <th className="cursor-pointer select-none hover:text-gray-700" onClick={() => toggleSort('contracts')}>Contracts{sortIndicator('contracts')}</th>
              <th className="cursor-pointer select-none hover:text-gray-700" onClick={() => toggleSort('expiry')}>Expiry{sortIndicator('expiry')}</th>
              <th className="cursor-pointer select-none hover:text-gray-700" onClick={() => toggleSort('status')}>Status{sortIndicator('status')}</th>
              <th className="text-right cursor-pointer select-none hover:text-gray-700" onClick={() => toggleSort('pnl')}>P&L{sortIndicator('pnl')}</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {sortedRows.map(({ trade: t, expiryDate, daysLeft, expired, countdownClass, isCredit, amount, quote, displayPnl }) => (
              <tr key={t.id} className="border-t border-gray-100 dark:border-gray-700">
                <td className="px-3 py-3 font-medium">{t.ticker}</td>
                <td>
                  <span className={`px-2 py-1 rounded text-xs font-semibold ${TYPE_COLORS[t.trade_type] || 'bg-gray-100'}`}>
                    {TRADE_LABELS[t.trade_type] ?? t.trade_type}
                  </span>
                </td>
                <td>{t.strike_price}</td>
                <td>
                  <span className={isCredit ? 'text-emerald-700 font-medium' : 'text-red-700 font-medium'}>
                    {isCredit ? '+' : '-'}{formatCurrency(amount)}
                  </span>
                </td>
                <td>
                  {t.status === 'open' && quote?.current_price != null ? (
                    <span title={`Bid: ${quote.bid != null ? formatCurrency(quote.bid) : '—'}  /  Ask: ${quote.ask != null ? formatCurrency(quote.ask) : '—'}`}>
                      {formatCurrency(quote.current_price)}
                    </span>
                  ) : (
                    <span className="text-gray-400">—</span>
                  )}
                </td>
                <td>{t.contracts}</td>
                <td>
                  <div>{expiryDate.toISOString().slice(0,10)}</div>
                  <div className={`text-xs mt-1 ${countdownClass}`}>{expired ? 'Expired' : `${daysLeft} days left`}</div>
                </td>
                <td><span className={`px-2 py-1 rounded text-xs ${STATUS_COLORS[t.status] || 'bg-gray-100'}`}>{t.status}</span></td>
                <td className="text-right font-medium">
                  {displayPnl == null ? (
                    '—'
                  ) : (
                    <span className={displayPnl >= 0 ? 'text-emerald-600' : 'text-red-600'}>
                      {formatCurrency(displayPnl)}
                      {t.status === 'open' && <span className="text-gray-400 font-normal text-xs"> (unrl.)</span>}
                    </span>
                  )}
                </td>
                <td className="pl-4">
                  <button onClick={() => startEdit(t)} className="text-sm text-sky-600">Edit</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="mt-3 text-xs text-gray-500">* Premium kept as gain. Update cost basis in holdings page.</p>
      </div>

      {/* Inline form removed — now using modal-based separate form page */}
      {/* Modal form component will be shown when modalOpen is true */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center" role="dialog" aria-modal="true">
          <div className="absolute inset-0 bg-black/50 dark:bg-black/70" onClick={() => { setModalOpen(false); setModalEditing(null); }} />
          <div className="relative z-10 w-full max-w-2xl mx-4 p-6 bg-white dark:bg-gray-800 rounded-xl shadow-xl">
            {/* lazy load: render local form component */}
            <OptionsLogForm editing={modalEditing ?? undefined} onClose={() => { setModalOpen(false); setModalEditing(null); }} />
          </div>
        </div>
      )}
    </div>
  );
}
