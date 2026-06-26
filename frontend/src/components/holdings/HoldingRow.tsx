import { useState } from 'react';
import TransactionHistory from './TransactionHistory';
import { parseLocalDateString } from '../../utils/date';
import type { Holding } from '../../types';

interface HoldingRowProps {
  holding: Holding;
}

const td = 'px-3 py-2 text-sm tabular-nums';

export default function HoldingRow({ holding }: HoldingRowProps) {
  const [expanded, setExpanded] = useState(false);

  const gainClass =
    holding.unrealized_gain > 0
      ? 'text-emerald-600 dark:text-emerald-400'
      : holding.unrealized_gain < 0
        ? 'text-red-500 dark:text-red-400'
        : 'text-slate-600 dark:text-slate-300';

  const dayClass =
    holding.daily_change > 0
      ? 'text-emerald-600 dark:text-emerald-400'
      : holding.daily_change < 0
        ? 'text-red-500 dark:text-red-400'
        : 'text-slate-600 dark:text-slate-300';

  const fmt = (v: number) =>
    v.toLocaleString('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2 });

  const fmtSigned = (v: number) => `${v > 0 ? '+' : ''}${fmt(v)}`;
  const fmtPct = (v: number) => `${v.toFixed(2)}%`;
  const fmtSignedPct = (v: number) => `${v > 0 ? '+' : ''}${v.toFixed(2)}%`;

  const fmtDate = (dateStr: string) =>
    parseLocalDateString(dateStr).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });

  return (
    <>
      <tr
        className="hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors cursor-pointer"
        onClick={() => setExpanded(!expanded)}
        aria-expanded={expanded}
      >
        {/* Ticker */}
        <td className={`${td} pl-4`}>
          <span className="inline-flex items-center gap-1.5">
            <svg
              className={`w-3.5 h-3.5 text-slate-400 transition-transform flex-shrink-0 ${expanded ? 'rotate-90' : ''}`}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
            <span className="font-bold text-slate-900 dark:text-white tracking-wide">
              {holding.ticker}
            </span>
          </span>
        </td>

        {/* Company */}
        <td className={`${td} text-slate-600 dark:text-slate-400 max-w-[160px] truncate`}>
          {holding.company_name ?? '—'}
        </td>

        {/* Qty */}
        <td className={`${td} text-right text-slate-700 dark:text-slate-300`}>
          {Number(holding.quantity).toFixed(2)}
        </td>

        {/* Avg Cost */}
        <td className={`${td} text-right text-slate-700 dark:text-slate-300`}>
          {fmt(holding.average_buy_price)}
        </td>

        {/* Current Price */}
        <td className={`${td} text-right font-medium text-slate-900 dark:text-white`}>
          {fmt(holding.current_price)}
        </td>

        {/* Day Change $ */}
        <td className={`${td} text-right font-medium ${dayClass}`}>
          {fmtSigned(holding.daily_change)}
        </td>

        {/* Day Change % */}
        <td className={`${td} text-right font-medium ${dayClass}`}>
          {fmtSignedPct(holding.daily_change_pct)}
        </td>

        {/* Total Invested */}
        <td className={`${td} text-right text-slate-600 dark:text-slate-400`}>
          {fmt(holding.total_invested)}
        </td>

        {/* Current Value */}
        <td className={`${td} text-right font-medium text-slate-800 dark:text-slate-200`}>
          {fmt(holding.current_value)}
        </td>

        {/* Gain/Loss $ */}
        <td className={`${td} text-right font-semibold ${gainClass}`}>
          {fmtSigned(holding.unrealized_gain)}
        </td>

        {/* Gain/Loss % */}
        <td className={`${td} text-right font-semibold ${gainClass}`}>
          {fmtPct(holding.unrealized_gain_pct)}
        </td>

        {/* Sector */}
        <td className={`${td} text-slate-500 dark:text-slate-400`}>{holding.sector ?? '—'}</td>

        {/* Broker */}
        <td className={`${td} text-slate-500 dark:text-slate-400`}>{holding.broker ?? '—'}</td>

        {/* Allocation % */}
        <td className={`${td} text-right text-slate-600 dark:text-slate-400`}>
          {fmtPct(holding.allocation_pct)}
        </td>

        {/* Updated */}
        <td className={`${td} text-slate-400 dark:text-slate-500 pr-4`}>
          {fmtDate(holding.updated_at)}
        </td>
      </tr>

      {/* Expanded transaction history */}
      {expanded && (
        <tr className="bg-slate-50 dark:bg-slate-800/50">
          <td colSpan={15} className="px-5 py-4">
            <TransactionHistory holdingId={holding.id} ticker={holding.ticker} />
          </td>
        </tr>
      )}
    </>
  );
}
