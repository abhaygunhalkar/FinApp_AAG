import { useMemo, useState } from 'react';
import { useOptions, useDeleteOption, useOptionsSummary, useOpenTradeQuotes } from '../hooks';
import { parseLocalDateString } from '../utils/date';
import OptionsLogForm from '../components/options/OptionsLogForm';

// ── icons ─────────────────────────────────────────────────────────────────────

function PencilIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 16 16"
      fill="currentColor"
      className="w-3.5 h-3.5"
    >
      <path d="M13.488 2.513a1.75 1.75 0 0 0-2.475 0L6.75 6.774a2.75 2.75 0 0 0-.596.892l-.848 2.047a.75.75 0 0 0 .98.98l2.047-.848a2.75 2.75 0 0 0 .892-.596l4.261-4.263a1.75 1.75 0 0 0 0-2.474ZM4.75 13.5c-.69 0-1.25-.56-1.25-1.25V4.75c0-.69.56-1.25 1.25-1.25H8a.75.75 0 0 0 0-1.5H4.75A2.75 2.75 0 0 0 2 4.75v7.5A2.75 2.75 0 0 0 4.75 15h7.5A2.75 2.75 0 0 0 15 12.25V9a.75.75 0 0 0-1.5 0v3.25c0 .69-.56 1.25-1.25 1.25h-7.5Z" />
    </svg>
  );
}

function TrashIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 16 16"
      fill="currentColor"
      className="w-3.5 h-3.5"
    >
      <path
        fillRule="evenodd"
        d="M5 3.25V4H2.75a.75.75 0 0 0 0 1.5h.3l.815 8.15A1.5 1.5 0 0 0 5.357 15h5.285a1.5 1.5 0 0 0 1.493-1.35l.815-8.15h.3a.75.75 0 0 0 0-1.5H11v-.75A2.25 2.25 0 0 0 8.75 1h-1.5A2.25 2.25 0 0 0 5 3.25Zm2.25-.75a.75.75 0 0 0-.75.75V4h3v-.75a.75.75 0 0 0-.75-.75h-1.5ZM6.05 6a.75.75 0 0 1 .787.713l.275 5.5a.75.75 0 0 1-1.498.075l-.275-5.5A.75.75 0 0 1 6.05 6Zm3.9 0a.75.75 0 0 1 .712.787l-.275 5.5a.75.75 0 0 1-1.498-.075l.275-5.5a.75.75 0 0 1 .786-.711Z"
        clipRule="evenodd"
      />
    </svg>
  );
}

function SortIcon({ active, dir }: { active: boolean; dir: 'asc' | 'desc' }) {
  if (!active) {
    return (
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 16 16"
        fill="currentColor"
        className="w-3 h-3 opacity-30"
      >
        <path
          fillRule="evenodd"
          d="M8 1a.75.75 0 0 1 .75.75v10.638l1.96-2.158a.75.75 0 1 1 1.11 1.008l-3.25 3.578a.75.75 0 0 1-1.11 0L4.21 11.238a.75.75 0 1 1 1.11-1.008l1.93 2.127V1.75A.75.75 0 0 1 8 1Z"
          clipRule="evenodd"
        />
      </svg>
    );
  }
  return dir === 'asc' ? (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 16 16"
      fill="currentColor"
      className="w-3 h-3"
    >
      <path
        fillRule="evenodd"
        d="M8 15a.75.75 0 0 1-.75-.75V3.612L5.29 5.77a.75.75 0 0 1-1.08-1.04l3.25-3.5a.75.75 0 0 1 1.08 0l3.25 3.5a.75.75 0 1 1-1.08 1.04L8.75 3.612V14.25A.75.75 0 0 1 8 15Z"
        clipRule="evenodd"
      />
    </svg>
  ) : (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 16 16"
      fill="currentColor"
      className="w-3 h-3"
    >
      <path
        fillRule="evenodd"
        d="M8 1a.75.75 0 0 1 .75.75v10.638l1.96-2.158a.75.75 0 1 1 1.11 1.008l-3.25 3.578a.75.75 0 0 1-1.11 0L4.21 11.238a.75.75 0 1 1 1.11-1.008l1.93 2.127V1.75A.75.75 0 0 1 8 1Z"
        clipRule="evenodd"
      />
    </svg>
  );
}

// ── sort header ───────────────────────────────────────────────────────────────

function SortTh({
  col,
  label,
  className = '',
  sortKey,
  sortDir,
  onSort,
}: {
  col: SortKey;
  label: string;
  className?: string;
  sortKey: SortKey;
  sortDir: 'asc' | 'desc';
  onSort: (col: SortKey) => void;
}) {
  return (
    <th
      className={`px-4 py-3 font-semibold text-xs uppercase tracking-wider cursor-pointer select-none whitespace-nowrap group ${className}`}
      onClick={() => onSort(col)}
    >
      <span className="inline-flex items-center gap-1.5">
        {label}
        <SortIcon active={sortKey === col} dir={sortDir} />
      </span>
    </th>
  );
}

// ── config ────────────────────────────────────────────────────────────────────

const TYPE_CONFIG: Record<string, { label: string; dot: string; bg: string; text: string }> = {
  sell_put: { label: 'Cash-secured put', dot: 'bg-sky-500', bg: 'bg-sky-50', text: 'text-sky-800' },
  sell_call: { label: 'Covered call', dot: 'bg-teal-500', bg: 'bg-teal-50', text: 'text-teal-800' },
  buy_call: {
    label: 'Buy call',
    dot: 'bg-violet-500',
    bg: 'bg-violet-50',
    text: 'text-violet-800',
  },
  buy_put: { label: 'Buy put', dot: 'bg-rose-500', bg: 'bg-rose-50', text: 'text-rose-800' },
};

const STATUS_CONFIG: Record<string, { label: string; bg: string; text: string }> = {
  open: { label: 'Open', bg: 'bg-emerald-50', text: 'text-emerald-700' },
  closed: { label: 'Closed', bg: 'bg-slate-100', text: 'text-slate-600' },
  expired_worthless: { label: 'Expired', bg: 'bg-purple-50', text: 'text-purple-700' },
  assigned: { label: 'Assigned', bg: 'bg-amber-50', text: 'text-amber-700' },
};

const FILTERS = [
  { key: 'open', label: 'Open' },
  { key: 'closed', label: 'Closed' },
  { key: 'expired_worthless', label: 'Expired' },
  { key: 'assigned', label: 'Assigned' },
  { key: 'all', label: 'All trades' },
] as const;

type FilterKey = (typeof FILTERS)[number]['key'];
type SortKey =
  | 'ticker'
  | 'type'
  | 'strike'
  | 'premium'
  | 'current_price'
  | 'contracts'
  | 'expiry'
  | 'status'
  | 'pct_gain'
  | 'pnl';

function fmt(v: number) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
  }).format(v);
}

// ── stat card ─────────────────────────────────────────────────────────────────

function StatCard({
  label,
  value,
  valueClass = '',
  sub,
}: {
  label: string;
  value: string;
  valueClass?: string;
  sub?: string;
}) {
  return (
    <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 px-5 py-4 flex flex-col gap-1 shadow-sm">
      <span className="text-xs font-medium text-slate-400 uppercase tracking-widest">{label}</span>
      <span className={`text-2xl font-bold tabular-nums ${valueClass}`}>{value}</span>
      {sub && <span className="text-xs text-slate-400">{sub}</span>}
    </div>
  );
}

// ── main page ─────────────────────────────────────────────────────────────────

export default function OptionsTradesPage() {
  const { data: trades } = useOptions();
  const summary = useOptionsSummary();
  const quotes = useOpenTradeQuotes();
  const remove = useDeleteOption();

  const [filter, setFilter] = useState<FilterKey>('open');
  const [sortKey, setSortKey] = useState<SortKey>('expiry');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
  const [modalOpen, setModalOpen] = useState(false);
  const [modalEditing, setModalEditing] = useState<any | null>(null);

  function toggleSort(key: SortKey) {
    if (sortKey === key) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    else {
      setSortKey(key);
      setSortDir('asc');
    }
  }

  // per-filter counts for tab badges
  const counts = useMemo(() => {
    if (!trades) return {} as Record<string, number>;
    const c: Record<string, number> = { all: trades.length };
    for (const t of trades) c[t.status] = (c[t.status] ?? 0) + 1;
    return c;
  }, [trades]);

  const filtered = useMemo(() => {
    if (!trades) return [];
    if (filter === 'all') return trades;
    return trades.filter((t: any) => t.status === filter);
  }, [trades, filter]);

  // compute unrealized P&L from open-trade quotes
  const unrealizedPnl = useMemo(() => {
    if (!quotes.data) return null;
    let sum = 0;
    let hasAny = false;
    for (const q of Object.values(quotes.data) as any[]) {
      if (q.unrealized_pnl != null) {
        sum += q.unrealized_pnl;
        hasAny = true;
      }
    }
    return hasAny ? sum : null;
  }, [quotes.data]);

  const rows = useMemo(() => {
    return filtered.map((t: any) => {
      const expiryDate = parseLocalDateString(t.expiry_date);
      const daysLeft = Math.ceil((expiryDate.getTime() - Date.now()) / (24 * 3600 * 1000));
      const expired = daysLeft < 0;
      const isCredit = t.trade_type.startsWith('sell_');
      const amount = (t.premium || 0) * (t.contracts || 0) * 100;
      const signedAmount = isCredit ? amount : -amount;
      const quote = quotes.data?.[String(t.id)];
      const displayPnl = t.status === 'open' ? (quote?.unrealized_pnl ?? null) : t.pnl;
      const pctGain = displayPnl != null && amount > 0 ? (displayPnl / amount) * 100 : null;
      return {
        trade: t,
        expiryDate,
        daysLeft,
        expired,
        isCredit,
        amount,
        signedAmount,
        quote,
        displayPnl,
        pctGain,
      };
    });
  }, [filtered, quotes.data]);

  const sortedRows = useMemo(() => {
    const dir = sortDir === 'asc' ? 1 : -1;
    const getValue = (r: (typeof rows)[number]): string | number => {
      switch (sortKey) {
        case 'ticker':
          return r.trade.ticker;
        case 'type':
          return TYPE_CONFIG[r.trade.trade_type]?.label ?? r.trade.trade_type;
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
        case 'pct_gain':
          return r.pctGain ?? -Infinity;
        case 'pnl':
          return r.displayPnl ?? -Infinity;
        default:
          return 0;
      }
    };
    return [...rows].sort((a, b) => {
      const va = getValue(a),
        vb = getValue(b);
      if (typeof va === 'string' && typeof vb === 'string') return va.localeCompare(vb) * dir;
      return ((va as number) - (vb as number)) * dir;
    });
  }, [rows, sortKey, sortDir]);

  async function handleDelete(trade: any) {
    const label = TYPE_CONFIG[trade.trade_type]?.label ?? trade.trade_type;
    if (
      !window.confirm(
        `Delete ${trade.ticker} ${label} (strike ${trade.strike_price}, expiry ${trade.expiry_date})?\n\nThis cannot be undone.`,
      )
    )
      return;
    try {
      await remove.mutateAsync(trade.id);
    } catch {
      window.alert('Failed to delete trade. Please try again.');
    }
  }

  return (
    <div className="space-y-5">
      {/* ── page header ── */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Options Trades</h1>
          <p className="text-sm text-slate-400 mt-0.5">Track and manage your options positions</p>
        </div>
        <button
          onClick={() => {
            setModalEditing(null);
            setModalOpen(true);
          }}
          className="inline-flex items-center gap-2 px-4 py-2.5 bg-slate-900 dark:bg-white text-white dark:text-slate-900 text-sm font-semibold rounded-lg shadow-sm hover:bg-slate-700 dark:hover:bg-slate-100 transition-colors"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 16 16"
            fill="currentColor"
            className="w-4 h-4"
          >
            <path d="M8.75 3.75a.75.75 0 0 0-1.5 0v3.5h-3.5a.75.75 0 0 0 0 1.5h3.5v3.5a.75.75 0 0 0 1.5 0v-3.5h3.5a.75.75 0 0 0 0-1.5h-3.5v-3.5Z" />
          </svg>
          Log a trade
        </button>
      </div>

      {/* ── summary stat cards ── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatCard
          label="Open Positions"
          value={summary.data?.open_positions != null ? String(summary.data.open_positions) : '—'}
          valueClass="text-slate-800 dark:text-white"
        />
        <StatCard
          label="Unrealized P&L"
          value={unrealizedPnl != null ? fmt(unrealizedPnl) : '—'}
          valueClass={
            unrealizedPnl == null
              ? 'text-slate-400'
              : unrealizedPnl >= 0
                ? 'text-emerald-600'
                : 'text-red-500'
          }
          sub="Open trades only"
        />
        <StatCard
          label="Total Realized P&L"
          value={summary.data?.total_pnl != null ? fmt(summary.data.total_pnl) : '—'}
          valueClass={
            summary.data?.total_pnl == null
              ? 'text-slate-400'
              : summary.data.total_pnl >= 0
                ? 'text-emerald-600'
                : 'text-red-500'
          }
        />
        <StatCard
          label="Win Rate"
          value={summary.data?.win_rate != null ? `${summary.data.win_rate}%` : '—'}
          valueClass="text-slate-800 dark:text-white"
          sub="Closed & expired"
        />
      </div>

      {/* ── filter tabs ── */}
      <div className="flex items-center gap-1.5 flex-wrap">
        {FILTERS.map(({ key, label }) => {
          const active = filter === key;
          const count = counts[key] ?? 0;
          return (
            <button
              key={key}
              onClick={() => setFilter(key)}
              className={`inline-flex items-center gap-1.5 px-3.5 py-1.5 text-sm font-medium rounded-lg transition-all focus:outline-none ${
                active
                  ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-900 shadow-sm'
                  : 'bg-white dark:bg-slate-800 text-slate-500 dark:text-slate-400 border border-slate-200 dark:border-slate-700 hover:border-slate-300 hover:text-slate-700 dark:hover:text-slate-200'
              }`}
            >
              {label}
              {count > 0 && (
                <span
                  className={`text-xs px-1.5 py-0.5 rounded-full font-semibold ${
                    active
                      ? 'bg-white/20 text-white dark:bg-slate-900/20 dark:text-slate-900'
                      : 'bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-400'
                  }`}
                >
                  {count}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* ── table ── */}
      <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-finance-gradient text-slate-200 text-left border-b border-blue-900/40">
                <th className="px-4 py-3 font-semibold text-xs uppercase tracking-wider pl-5 whitespace-nowrap">
                  Brokerage
                </th>
                <SortTh
                  col="ticker"
                  label="Ticker"
                  sortKey={sortKey}
                  sortDir={sortDir}
                  onSort={toggleSort}
                />
                <SortTh
                  col="type"
                  label="Strategy"
                  sortKey={sortKey}
                  sortDir={sortDir}
                  onSort={toggleSort}
                />
                <SortTh
                  col="strike"
                  label="Strike"
                  className="text-right"
                  sortKey={sortKey}
                  sortDir={sortDir}
                  onSort={toggleSort}
                />
                <SortTh
                  col="premium"
                  label="Net Premium"
                  className="text-right"
                  sortKey={sortKey}
                  sortDir={sortDir}
                  onSort={toggleSort}
                />
                <SortTh
                  col="current_price"
                  label="Option Price"
                  className="text-right"
                  sortKey={sortKey}
                  sortDir={sortDir}
                  onSort={toggleSort}
                />
                <SortTh
                  col="contracts"
                  label="Qty"
                  className="text-center"
                  sortKey={sortKey}
                  sortDir={sortDir}
                  onSort={toggleSort}
                />
                <SortTh
                  col="expiry"
                  label="Expiry"
                  sortKey={sortKey}
                  sortDir={sortDir}
                  onSort={toggleSort}
                />
                {filter === 'all' && (
                  <SortTh
                    col="status"
                    label="Status"
                    sortKey={sortKey}
                    sortDir={sortDir}
                    onSort={toggleSort}
                  />
                )}
                <SortTh
                  col="pct_gain"
                  label="% Gain"
                  className="text-right"
                  sortKey={sortKey}
                  sortDir={sortDir}
                  onSort={toggleSort}
                />
                <SortTh
                  col="pnl"
                  label="P&L"
                  className="text-right pr-5"
                  sortKey={sortKey}
                  sortDir={sortDir}
                  onSort={toggleSort}
                />
                <th className="px-4 py-3 w-20" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
              {sortedRows.length === 0 && (
                <tr>
                  <td
                    colSpan={filter === 'all' ? 12 : 11}
                    className="px-5 py-12 text-center text-slate-400 text-sm"
                  >
                    No {filter === 'all' ? '' : filter.replace('_', ' ')} trades found
                  </td>
                </tr>
              )}
              {sortedRows.map(
                ({
                  trade: t,
                  expiryDate,
                  daysLeft,
                  expired,
                  isCredit,
                  amount,
                  quote,
                  displayPnl,
                  pctGain,
                }) => {
                  const typeConf = TYPE_CONFIG[t.trade_type];
                  const daysChipClass = expired
                    ? 'bg-slate-100 text-slate-500 dark:bg-slate-700 dark:text-slate-400'
                    : daysLeft <= 7
                      ? 'bg-red-50 text-red-700 dark:bg-red-900/30 dark:text-red-400'
                      : daysLeft <= 30
                        ? 'bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400'
                        : 'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400';

                  return (
                    <tr
                      key={t.id}
                      className="hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors"
                    >
                      {/* Brokerage */}
                      <td className="pl-5 pr-4 py-2 text-slate-500 dark:text-slate-400 text-xs whitespace-nowrap">
                        {t.broker ?? <span className="text-slate-300 dark:text-slate-600">—</span>}
                      </td>

                      {/* Ticker */}
                      <td className="px-4 py-2">
                        <span className="font-bold text-slate-900 dark:text-white tracking-wide">
                          {t.ticker}
                        </span>
                      </td>

                      {/* Strategy */}
                      <td className="px-4 py-2">
                        {typeConf ? (
                          <span
                            className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-semibold ${typeConf.bg} ${typeConf.text}`}
                          >
                            <span
                              className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${typeConf.dot}`}
                            />
                            {typeConf.label}
                          </span>
                        ) : (
                          <span className="text-xs text-slate-500">{t.trade_type}</span>
                        )}
                      </td>

                      {/* Strike */}
                      <td className="px-4 py-2 text-right font-medium tabular-nums text-slate-700 dark:text-slate-300">
                        ${t.strike_price}
                      </td>

                      {/* Net Premium */}
                      <td className="px-4 py-2 text-right tabular-nums">
                        <span
                          className={`font-semibold ${isCredit ? 'text-emerald-600' : 'text-red-500'}`}
                        >
                          {isCredit ? '+' : '−'}
                          {fmt(amount)}
                        </span>
                      </td>

                      {/* Option Price */}
                      <td className="px-4 py-2 text-right tabular-nums text-slate-600 dark:text-slate-400">
                        {t.status === 'open' && quote?.current_price != null ? (
                          <span
                            title={`Bid: ${quote.bid != null ? fmt(quote.bid) : '—'} / Ask: ${quote.ask != null ? fmt(quote.ask) : '—'}`}
                            className="cursor-default"
                          >
                            {fmt(quote.current_price)}
                          </span>
                        ) : (
                          <span className="text-slate-300 dark:text-slate-600">—</span>
                        )}
                      </td>

                      {/* Contracts */}
                      <td className="px-4 py-2 text-center tabular-nums text-slate-600 dark:text-slate-400">
                        {t.contracts}
                      </td>

                      {/* Expiry */}
                      <td className="px-4 py-2">
                        <div className="text-slate-700 dark:text-slate-300 font-medium tabular-nums">
                          {expiryDate.toISOString().slice(0, 10)}
                        </div>
                        <span
                          className={`inline-block mt-1 text-xs font-semibold px-2 py-0.5 rounded-full ${daysChipClass}`}
                        >
                          {expired ? 'Expired' : `${daysLeft}d left`}
                        </span>
                      </td>

                      {/* Status (All view only) */}
                      {filter === 'all' &&
                        (() => {
                          const sc = STATUS_CONFIG[t.status];
                          return (
                            <td className="px-4 py-2">
                              <span
                                className={`text-xs font-semibold px-2.5 py-1 rounded-full ${sc?.bg ?? 'bg-slate-100'} ${sc?.text ?? 'text-slate-600'}`}
                              >
                                {sc?.label ?? t.status}
                              </span>
                            </td>
                          );
                        })()}

                      {/* % Gain */}
                      <td className="px-4 py-2 text-right tabular-nums">
                        {pctGain == null ? (
                          <span className="text-slate-300 dark:text-slate-600">—</span>
                        ) : (
                          <span
                            className={`font-semibold ${pctGain >= 0 ? 'text-emerald-600' : 'text-red-500'}`}
                          >
                            {pctGain >= 0 ? '+' : ''}
                            {pctGain.toFixed(1)}%
                          </span>
                        )}
                      </td>

                      {/* P&L */}
                      <td className="px-4 py-2 pr-5 text-right tabular-nums">
                        {displayPnl == null ? (
                          <span className="text-slate-300 dark:text-slate-600">—</span>
                        ) : (
                          <div className="flex flex-col items-end">
                            <span
                              className={`font-bold text-base ${displayPnl >= 0 ? 'text-emerald-600' : 'text-red-500'}`}
                            >
                              {displayPnl >= 0 ? '+' : ''}
                              {fmt(displayPnl)}
                            </span>
                            {t.status === 'open' && (
                              <span className="text-xs text-slate-400 font-normal">unrealized</span>
                            )}
                          </div>
                        )}
                      </td>

                      {/* Actions */}
                      <td className="px-4 py-2">
                        <div className="flex items-center gap-1 justify-end">
                          <button
                            onClick={() => {
                              setModalEditing(t);
                              setModalOpen(true);
                            }}
                            title="Edit trade"
                            className="p-1.5 rounded-md text-slate-400 hover:text-slate-700 hover:bg-slate-100 dark:hover:text-slate-200 dark:hover:bg-slate-700 transition-colors"
                          >
                            <PencilIcon />
                          </button>
                          <button
                            onClick={() => handleDelete(t)}
                            title="Delete trade"
                            disabled={remove.isPending}
                            className="p-1.5 rounded-md text-slate-400 hover:text-red-600 hover:bg-red-50 dark:hover:text-red-400 dark:hover:bg-red-900/20 transition-colors disabled:opacity-40"
                          >
                            <TrashIcon />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                },
              )}
            </tbody>
          </table>
        </div>

        {/* table footer note */}
        <div className="px-5 py-3 border-t border-slate-100 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50">
          <p className="text-xs text-slate-400">
            Premium shown as net collected/paid per position (premium × contracts × 100). Option
            prices reflect mid-market; hover for bid/ask spread.
          </p>
        </div>
      </div>

      {/* ── modal ── */}
      {modalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center"
          role="dialog"
          aria-modal="true"
        >
          <div
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={() => {
              setModalOpen(false);
              setModalEditing(null);
            }}
          />
          <div className="relative z-10 w-full max-w-2xl mx-4">
            <OptionsLogForm
              editing={modalEditing ?? undefined}
              onClose={() => {
                setModalOpen(false);
                setModalEditing(null);
              }}
            />
          </div>
        </div>
      )}
    </div>
  );
}
