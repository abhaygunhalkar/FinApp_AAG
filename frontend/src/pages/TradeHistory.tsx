import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import apiClient from '../api/client';
import { LoadingSpinner, EmptyState } from '../components/shared';
import { parseLocalDateString } from '../utils/date';

interface SellRecord {
  id: number;
  ticker: string;
  quantity: number;
  price: number;
  fees: number;
  transaction_date: string;
  broker: string | null;
  cost_basis: number;
  realized_gain: number;
}

type SortKey = keyof SellRecord;

const COLUMNS: { key: SortKey; label: string; align: 'left' | 'right' }[] = [
  { key: 'transaction_date', label: 'Date', align: 'left' },
  { key: 'ticker', label: 'Ticker', align: 'left' },
  { key: 'quantity', label: 'Quantity', align: 'right' },
  { key: 'price', label: 'Sell Price', align: 'right' },
  { key: 'cost_basis', label: 'Cost Basis', align: 'right' },
  { key: 'fees', label: 'Fees', align: 'right' },
  { key: 'broker', label: 'Broker', align: 'left' },
  { key: 'realized_gain', label: 'Realized Gain', align: 'right' },
];

export default function TradeHistory() {
  const { data: sells, isLoading } = useQuery({
    queryKey: ['transactions', 'sells'],
    queryFn: async () => {
      const response = await apiClient.get('/api/transactions/sells');
      return response.data.data as SellRecord[];
    },
  });

  const [sortColumn, setSortColumn] = useState<SortKey>('transaction_date');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');

  const handleSort = (column: SortKey) => {
    if (sortColumn === column) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortColumn(column);
      const numericCols = new Set(['quantity', 'price', 'cost_basis', 'fees', 'realized_gain']);
      setSortDirection(numericCols.has(column) ? 'desc' : 'asc');
    }
  };

  const sortedSells = useMemo(() => {
    const records = sells ?? [];
    const sorted = [...records];
    sorted.sort((a, b) => {
      const aVal = a[sortColumn];
      const bVal = b[sortColumn];

      if (aVal == null && bVal == null) return 0;
      if (aVal == null) return 1;
      if (bVal == null) return -1;

      let comparison = 0;
      if (typeof aVal === 'number' && typeof bVal === 'number') {
        comparison = aVal - bVal;
      } else {
        comparison = String(aVal).localeCompare(String(bVal));
      }

      return sortDirection === 'desc' ? -comparison : comparison;
    });
    return sorted;
  }, [sells, sortColumn, sortDirection]);

  const getSortIndicator = (col: SortKey) => {
    if (sortColumn !== col) return null;
    return sortDirection === 'asc' ? ' ▲' : ' ▼';
  };

  const formatCurrency = (value: number | undefined | null) =>
    (value ?? 0).toLocaleString('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2 });

  const formatDate = (dateStr: string) =>
    parseLocalDateString(dateStr).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });

  const totalRealized = sortedSells.reduce((sum, s) => sum + (s.realized_gain ?? 0), 0);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <LoadingSpinner size="lg" />
      </div>
    );
  }

  if (sortedSells.length === 0) {
    return (
      <div className="p-4">
        <h1 className="text-3xl font-bold text-slate-900 dark:text-white mb-2">
          Trade History
        </h1>
        <p className="text-sm text-slate-500 dark:text-slate-400 mb-6">
          Your completed sell transactions
        </p>
        <EmptyState
          icon={
            <svg className="w-12 h-12" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
            </svg>
          }
          title="No sell transactions yet"
          description="When you sell stocks from your holdings, the trade history will appear here."
        />
      </div>
    );
  }

  return (
    <div className="p-4">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-3xl font-bold text-slate-900 dark:text-white">
            Trade History
          </h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            Your completed sell transactions
          </p>
        </div>
        <div className={`px-4 py-2 rounded-lg text-sm font-semibold ${
          totalRealized >= 0
            ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300'
            : 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300'
        }`}>
          Total Realized: {totalRealized >= 0 ? '+' : ''}{formatCurrency(totalRealized)}
        </div>
      </div>

      <div className="overflow-x-auto rounded-lg border border-gray-200 dark:border-gray-700">
        <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
          <thead className="bg-gray-50 dark:bg-gray-800">
            <tr>
              {COLUMNS.map((col) => (
                <th
                  key={col.key}
                  onClick={() => handleSort(col.key)}
                  style={{ padding: '8px', fontSize: '14px', minHeight: '40px' }}
                  className={`text-sm font-semibold text-gray-700 dark:text-gray-300 whitespace-nowrap cursor-pointer select-none hover:bg-gray-100 dark:hover:bg-gray-700 ${
                    col.align === 'right' ? 'text-right' : 'text-left'
                  }`}
                >
                  {col.label}
                  <span className="text-blue-600 dark:text-blue-400">
                    {getSortIndicator(col.key)}
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200 dark:divide-gray-700 bg-white dark:bg-gray-900">
            {sortedSells.map((sell) => {
              const gain = sell.realized_gain ?? 0;
              const gainColor = gain >= 0
                ? 'text-green-600 dark:text-green-400'
                : 'text-red-600 dark:text-red-400';

              return (
                <tr key={sell.id} className="hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
                  <td style={{ padding: '8px', fontSize: '14px', minHeight: '40px' }} className="text-gray-900 dark:text-gray-100">
                    {formatDate(sell.transaction_date)}
                  </td>
                  <td style={{ padding: '8px', fontSize: '14px', minHeight: '40px' }} className="font-medium text-gray-900 dark:text-gray-100">
                    {sell.ticker}
                  </td>
                  <td style={{ padding: '8px', fontSize: '14px', minHeight: '40px' }} className="text-right text-gray-900 dark:text-gray-100">
                    {sell.quantity}
                  </td>
                  <td style={{ padding: '8px', fontSize: '14px', minHeight: '40px' }} className="text-right text-gray-900 dark:text-gray-100">
                    {formatCurrency(sell.price)}
                  </td>
                  <td style={{ padding: '8px', fontSize: '14px', minHeight: '40px' }} className="text-right text-gray-500 dark:text-gray-400">
                    {formatCurrency(sell.cost_basis)}
                  </td>
                  <td style={{ padding: '8px', fontSize: '14px', minHeight: '40px' }} className="text-right text-gray-500 dark:text-gray-400">
                    {formatCurrency(sell.fees)}
                  </td>
                  <td style={{ padding: '8px', fontSize: '14px', minHeight: '40px' }} className="text-gray-900 dark:text-gray-100">
                    {sell.broker ?? '—'}
                  </td>
                  <td style={{ padding: '8px', fontSize: '14px', minHeight: '40px' }} className={`text-right font-semibold ${gainColor}`}>
                    {gain >= 0 ? '+' : ''}{formatCurrency(gain)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
