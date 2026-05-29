import { useState } from 'react';
import TransactionHistory from './TransactionHistory';
import type { Holding } from '../../types';

interface HoldingRowProps {
  holding: Holding;
}

export default function HoldingRow({ holding }: HoldingRowProps) {
  const [expanded, setExpanded] = useState(false);

  const gainClass =
    holding.unrealized_gain > 0
      ? 'text-green-600 dark:text-green-400'
      : holding.unrealized_gain < 0
        ? 'text-red-600 dark:text-red-400'
        : 'text-gray-900 dark:text-gray-100';

  const formatCurrency = (value: number) =>
    value.toLocaleString('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2,
    });

  const formatPercent = (value: number) => `${value.toFixed(2)}%`;
  const formatSignedCurrency = (value: number) =>
    `${value > 0 ? '+' : ''}${formatCurrency(value)}`;
  const formatSignedPercent = (value: number) =>
    `${value > 0 ? '+' : ''}${value.toFixed(2)}%`;

  const formatDate = (dateStr: string) =>
    new Date(dateStr).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });

  return (
    <>
      <tr
        className="border-b border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800 cursor-pointer"
        style={{ minHeight: '40px' }}
        onClick={() => setExpanded(!expanded)}
        aria-expanded={expanded}
      >
        <td className="px-2 py-2 text-sm text-gray-900 dark:text-gray-100" style={{ padding: '8px', fontSize: '14px' }}>
          <span className="inline-flex items-center gap-1">
            <svg
              className={`w-4 h-4 transition-transform ${expanded ? 'rotate-90' : ''}`}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
            <span className="font-medium">{holding.ticker}</span>
          </span>
        </td>
        <td style={{ padding: '8px', fontSize: '14px' }} className="text-gray-900 dark:text-gray-100">
          {holding.company_name ?? '—'}
        </td>
        <td style={{ padding: '8px', fontSize: '14px' }} className="text-right text-gray-900 dark:text-gray-100">
          {holding.quantity}
        </td>
        <td style={{ padding: '8px', fontSize: '14px' }} className="text-right text-gray-900 dark:text-gray-100">
          {formatCurrency(holding.average_buy_price)}
        </td>
        <td style={{ padding: '8px', fontSize: '14px' }} className="text-right text-gray-900 dark:text-gray-100">
          {formatCurrency(holding.current_price)}
        </td>
        <td style={{ padding: '8px', fontSize: '14px' }} className={`text-right ${holding.daily_change > 0 ? 'text-green-600 dark:text-green-400' : holding.daily_change < 0 ? 'text-red-600 dark:text-red-400' : 'text-gray-900 dark:text-gray-100'}`}>
          {formatSignedCurrency(holding.daily_change)}
        </td>
        <td style={{ padding: '8px', fontSize: '14px' }} className={`text-right ${holding.daily_change_pct > 0 ? 'text-green-600 dark:text-green-400' : holding.daily_change_pct < 0 ? 'text-red-600 dark:text-red-400' : 'text-gray-900 dark:text-gray-100'}`}>
          {formatSignedPercent(holding.daily_change_pct)}
        </td>
        <td style={{ padding: '8px', fontSize: '14px' }} className="text-right text-gray-900 dark:text-gray-100">
          {formatCurrency(holding.total_invested)}
        </td>
        <td style={{ padding: '8px', fontSize: '14px' }} className="text-right text-gray-900 dark:text-gray-100">
          {formatCurrency(holding.current_value)}
        </td>
        <td style={{ padding: '8px', fontSize: '14px' }} className={`text-right ${gainClass}`}>
          {formatCurrency(holding.unrealized_gain)}
        </td>
        <td style={{ padding: '8px', fontSize: '14px' }} className={`text-right ${gainClass}`}>
          {formatPercent(holding.unrealized_gain_pct)}
        </td>
        <td style={{ padding: '8px', fontSize: '14px' }} className="text-gray-900 dark:text-gray-100">
          {holding.sector ?? '—'}
        </td>
        <td style={{ padding: '8px', fontSize: '14px' }} className="text-gray-900 dark:text-gray-100">
          {holding.broker ?? '—'}
        </td>
        <td style={{ padding: '8px', fontSize: '14px' }} className="text-right text-gray-900 dark:text-gray-100">
          {formatPercent(holding.allocation_pct)}
        </td>
        <td style={{ padding: '8px', fontSize: '14px' }} className="text-gray-500 dark:text-gray-400">
          {formatDate(holding.updated_at)}
        </td>
      </tr>
      {expanded && (
        <tr className="bg-gray-50 dark:bg-gray-800/50">
          <td colSpan={15} className="px-4 py-3">
            <TransactionHistory holdingId={holding.id} ticker={holding.ticker} />
          </td>
        </tr>
      )}
    </>
  );
}
