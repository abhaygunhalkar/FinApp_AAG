import { useState, useMemo } from 'react';
import { useDeleteWatchlistItem } from '../../hooks/useWatchlist';
import { DeleteConfirmation } from '../shared';
import type { WatchlistItem } from '../../types';

function formatMarketCap(value: number | null): string {
  if (value == null) return '—';
  if (value >= 1_000_000_000_000) {
    return `$${(value / 1_000_000_000_000).toFixed(2)}T`;
  }
  if (value >= 1_000_000_000) {
    return `$${(value / 1_000_000_000).toFixed(2)}B`;
  }
  if (value >= 1_000_000) {
    return `$${(value / 1_000_000).toFixed(2)}M`;
  }
  return `$${value.toLocaleString()}`;
}

function formatDailyChange(value: number): React.ReactNode {
  const color =
    value > 0
      ? 'text-green-600 dark:text-green-400'
      : value < 0
        ? 'text-red-600 dark:text-red-400'
        : 'text-gray-900 dark:text-gray-100';
  return (
    <span className={color}>
      {value >= 0 ? '+' : ''}
      {value.toFixed(2)}%
    </span>
  );
}

function getRsiColor(rsi: number | null): string {
  if (rsi == null) return 'text-gray-400 dark:text-gray-500';
  if (rsi >= 70) return 'text-red-600 dark:text-red-400';
  if (rsi >= 60) return 'text-orange-500 dark:text-orange-400';
  if (rsi <= 30) return 'text-green-600 dark:text-green-400';
  if (rsi <= 40) return 'text-emerald-500 dark:text-emerald-400';
  return 'text-gray-900 dark:text-gray-100';
}

function getRsiBg(rsi: number | null): string {
  if (rsi == null) return '';
  if (rsi >= 70) return 'bg-red-50 dark:bg-red-900/20';
  if (rsi <= 30) return 'bg-green-50 dark:bg-green-900/20';
  return '';
}

function getRsiLabel(rsi: number | null): string {
  if (rsi == null) return '';
  if (rsi >= 70) return 'Overbought';
  if (rsi <= 30) return 'Oversold';
  return '';
}

function RsiCell({ value }: { value: number | null }) {
  if (value == null) return <span className="text-gray-400 dark:text-gray-500">—</span>;

  const color = getRsiColor(value);
  const bg = getRsiBg(value);
  const label = getRsiLabel(value);

  return (
    <div className="flex items-center gap-1.5">
      <span
        className={`inline-flex items-center justify-center min-w-[2.5rem] px-1.5 py-0.5 rounded text-xs font-bold ${color} ${bg}`}
      >
        {value.toFixed(1)}
      </span>
      {label && <span className={`text-[10px] font-medium ${color}`}>{label}</span>}
    </div>
  );
}

type SortKey = keyof WatchlistItem | 'actions';

interface ColumnDef {
  key: SortKey;
  label: string;
  align: 'left' | 'right' | 'center';
  sortable: boolean;
}

const COLUMNS: ColumnDef[] = [
  { key: 'ticker', label: 'Ticker', align: 'left', sortable: true },
  { key: 'company_name', label: 'Company Name', align: 'left', sortable: true },
  { key: 'current_price', label: 'Current Price', align: 'right', sortable: true },
  { key: 'daily_change_pct', label: 'Daily Change %', align: 'right', sortable: true },
  { key: 'week_52_high', label: '52W High', align: 'right', sortable: true },
  { key: 'week_52_low', label: '52W Low', align: 'right', sortable: true },
  { key: 'target_buy_price', label: 'Target Price', align: 'right', sortable: true },
  { key: 'analyst_rating', label: 'Rating', align: 'left', sortable: true },
  { key: 'pe_ratio', label: 'PE Ratio', align: 'right', sortable: true },
  { key: 'market_cap', label: 'Market Cap', align: 'right', sortable: true },
  { key: 'sector', label: 'Sector', align: 'left', sortable: true },
  { key: 'rsi_daily', label: 'RSI(D)', align: 'center', sortable: true },
  { key: 'rsi_weekly', label: 'RSI(W)', align: 'center', sortable: true },
  { key: 'priority', label: 'Priority', align: 'center', sortable: true },
  { key: 'actions', label: 'Actions', align: 'center', sortable: false },
];

interface WatchlistTableProps {
  items: WatchlistItem[];
}

export default function WatchlistTable({ items }: WatchlistTableProps) {
  const deleteMutation = useDeleteWatchlistItem();
  const [deleteTarget, setDeleteTarget] = useState<WatchlistItem | null>(null);
  const [sortColumn, setSortColumn] = useState<SortKey>('priority');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');

  const handleSort = (column: SortKey) => {
    if (column === 'actions') return;
    if (sortColumn === column) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortColumn(column);
      // Default: descending for numeric, ascending for text
      const numericCols = new Set([
        'current_price',
        'daily_change_pct',
        'week_52_high',
        'week_52_low',
        'target_buy_price',
        'pe_ratio',
        'market_cap',
        'rsi_daily',
        'rsi_weekly',
      ]);
      setSortDirection(numericCols.has(column) ? 'desc' : 'asc');
    }
  };

  const sortedItems = useMemo(() => {
    const sorted = [...items];
    sorted.sort((a, b) => {
      const aVal = a[sortColumn as keyof WatchlistItem];
      const bVal = b[sortColumn as keyof WatchlistItem];

      if (aVal == null && bVal == null) return 0;
      if (aVal == null) return 1;
      if (bVal == null) return -1;

      let comparison: number;
      if (typeof aVal === 'number' && typeof bVal === 'number') {
        comparison = aVal - bVal;
      } else {
        comparison = String(aVal).localeCompare(String(bVal), undefined, { sensitivity: 'base' });
      }

      return sortDirection === 'desc' ? -comparison : comparison;
    });
    return sorted;
  }, [items, sortColumn, sortDirection]);

  const handleDelete = () => {
    if (!deleteTarget) return;
    deleteMutation.mutate(deleteTarget.id, {
      onSuccess: () => setDeleteTarget(null),
    });
  };

  const getSortIndicator = (col: SortKey) => {
    if (sortColumn !== col) return null;
    return sortDirection === 'asc' ? ' ▲' : ' ▼';
  };

  return (
    <>
      <div className="overflow-x-auto rounded-lg border border-gray-200 dark:border-gray-700">
        <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
          <thead className="bg-gray-50 dark:bg-gray-800">
            <tr>
              {COLUMNS.map((col) => (
                <th
                  key={col.key}
                  onClick={col.sortable ? () => handleSort(col.key) : undefined}
                  style={{ padding: '8px', fontSize: '14px', minHeight: '40px' }}
                  className={`text-sm font-semibold text-gray-700 dark:text-gray-300 whitespace-nowrap ${
                    col.align === 'right'
                      ? 'text-right'
                      : col.align === 'center'
                        ? 'text-center'
                        : 'text-left'
                  } ${col.sortable ? 'cursor-pointer select-none hover:bg-gray-100 dark:hover:bg-gray-700' : ''}`}
                >
                  {col.label}
                  {col.sortable && (
                    <span className="text-blue-600 dark:text-blue-400">
                      {getSortIndicator(col.key)}
                    </span>
                  )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200 dark:divide-gray-700 bg-white dark:bg-gray-900">
            {sortedItems.map((item) => (
              <tr
                key={item.id}
                className="hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
              >
                <td
                  style={{ padding: '8px', fontSize: '14px', minHeight: '40px' }}
                  className="font-medium text-gray-900 dark:text-gray-100"
                >
                  {item.ticker}
                </td>
                <td
                  style={{ padding: '8px', fontSize: '14px', minHeight: '40px' }}
                  className="text-gray-900 dark:text-gray-100"
                >
                  {item.company_name ?? '—'}
                </td>
                <td
                  style={{ padding: '8px', fontSize: '14px', minHeight: '40px' }}
                  className="text-right text-gray-900 dark:text-gray-100"
                >
                  ${item.current_price.toFixed(2)}
                </td>
                <td
                  style={{ padding: '8px', fontSize: '14px', minHeight: '40px' }}
                  className="text-right"
                >
                  {formatDailyChange(item.daily_change_pct)}
                </td>
                <td
                  style={{ padding: '8px', fontSize: '14px', minHeight: '40px' }}
                  className="text-right text-gray-900 dark:text-gray-100"
                >
                  ${item.week_52_high.toFixed(2)}
                </td>
                <td
                  style={{ padding: '8px', fontSize: '14px', minHeight: '40px' }}
                  className="text-right text-gray-900 dark:text-gray-100"
                >
                  ${item.week_52_low.toFixed(2)}
                </td>
                <td
                  style={{ padding: '8px', fontSize: '14px', minHeight: '40px' }}
                  className="text-right text-gray-900 dark:text-gray-100"
                >
                  {item.target_buy_price != null ? `$${item.target_buy_price.toFixed(2)}` : '—'}
                </td>
                <td
                  style={{ padding: '8px', fontSize: '14px', minHeight: '40px' }}
                  className="text-gray-900 dark:text-gray-100 capitalize"
                >
                  {item.analyst_rating ?? '—'}
                </td>
                <td
                  style={{ padding: '8px', fontSize: '14px', minHeight: '40px' }}
                  className="text-right text-gray-900 dark:text-gray-100"
                >
                  {item.pe_ratio != null ? item.pe_ratio.toFixed(2) : '—'}
                </td>
                <td
                  style={{ padding: '8px', fontSize: '14px', minHeight: '40px' }}
                  className="text-right text-gray-900 dark:text-gray-100"
                >
                  {formatMarketCap(item.market_cap)}
                </td>
                <td
                  style={{ padding: '8px', fontSize: '14px', minHeight: '40px' }}
                  className="text-gray-900 dark:text-gray-100"
                >
                  {item.sector ?? '—'}
                </td>
                <td
                  style={{ padding: '8px', fontSize: '14px', minHeight: '40px' }}
                  className="text-center"
                >
                  <RsiCell value={item.rsi_daily} />
                </td>
                <td
                  style={{ padding: '8px', fontSize: '14px', minHeight: '40px' }}
                  className="text-center"
                >
                  <RsiCell value={item.rsi_weekly} />
                </td>
                <td
                  style={{ padding: '8px', fontSize: '14px', minHeight: '40px' }}
                  className="text-center text-gray-900 dark:text-gray-100"
                >
                  <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 text-xs font-bold">
                    {item.priority}
                  </span>
                </td>
                <td
                  style={{ padding: '8px', fontSize: '14px', minHeight: '40px' }}
                  className="text-center"
                >
                  <button
                    onClick={() => setDeleteTarget(item)}
                    className="p-1.5 text-red-500 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors"
                    aria-label={`Delete ${item.ticker} from watchlist`}
                    title="Remove from watchlist"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                      />
                    </svg>
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {deleteTarget && (
        <DeleteConfirmation
          title="Remove from Watchlist"
          message={`Are you sure you want to remove ${deleteTarget.ticker}${deleteTarget.company_name ? ` (${deleteTarget.company_name})` : ''} from your watchlist?`}
          onConfirm={handleDelete}
          onCancel={() => setDeleteTarget(null)}
          confirmLabel={deleteMutation.isPending ? 'Removing...' : 'Remove'}
        />
      )}
    </>
  );
}
