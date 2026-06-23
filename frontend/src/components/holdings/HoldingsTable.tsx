import { useMemo } from 'react';
import { useUIStore } from '../../store/uiStore';
import { EmptyState } from '../shared';
import HoldingRow from './HoldingRow';
import type { Holding } from '../../types';

interface HoldingsTableProps {
  holdings: Holding[];
}

type SortColumn = keyof Holding | string;

const NUMERIC_COLUMNS: Set<string> = new Set([
  'quantity',
  'average_buy_price',
  'current_price',
  'daily_change',
  'daily_change_pct',
  'total_invested',
  'current_value',
  'unrealized_gain',
  'unrealized_gain_pct',
  'dividend_yield',
  'annual_dividend_income',
  'allocation_pct',
]);

const COLUMNS: { key: SortColumn; label: string; align: 'left' | 'right' }[] = [
  { key: 'ticker', label: 'Ticker', align: 'left' },
  { key: 'company_name', label: 'Company', align: 'left' },
  { key: 'quantity', label: 'Qty', align: 'right' },
  { key: 'average_buy_price', label: 'Avg Cost', align: 'right' },
  { key: 'current_price', label: 'Price', align: 'right' },
  { key: 'daily_change', label: 'Day Change', align: 'right' },
  { key: 'daily_change_pct', label: 'Day %', align: 'right' },
  { key: 'total_invested', label: 'Invested', align: 'right' },
  { key: 'current_value', label: 'Value', align: 'right' },
  { key: 'unrealized_gain', label: 'Gain/Loss', align: 'right' },
  { key: 'unrealized_gain_pct', label: 'Gain %', align: 'right' },
  { key: 'sector', label: 'Sector', align: 'left' },
  { key: 'broker', label: 'Broker', align: 'left' },
  { key: 'allocation_pct', label: 'Alloc %', align: 'right' },
  { key: 'updated_at', label: 'Updated', align: 'left' },
];

function getDefaultDirection(column: string): 'asc' | 'desc' {
  if (NUMERIC_COLUMNS.has(column)) return 'desc';
  return 'asc';
}

function SortIcon({ active, dir }: { active: boolean; dir: 'asc' | 'desc' }) {
  if (!active) {
    return (
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 16 16"
        fill="currentColor"
        className="w-3 h-3 opacity-40 inline-block ml-1"
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
      className="w-3 h-3 inline-block ml-1"
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
      className="w-3 h-3 inline-block ml-1"
    >
      <path
        fillRule="evenodd"
        d="M8 1a.75.75 0 0 1 .75.75v10.638l1.96-2.158a.75.75 0 1 1 1.11 1.008l-3.25 3.578a.75.75 0 0 1-1.11 0L4.21 11.238a.75.75 0 1 1 1.11-1.008l1.93 2.127V1.75A.75.75 0 0 1 8 1Z"
        clipRule="evenodd"
      />
    </svg>
  );
}

export default function HoldingsTable({ holdings }: HoldingsTableProps) {
  const { holdingsFilter, setHoldingsFilter } = useUIStore();

  const filteredAndSorted = useMemo(() => {
    let result = [...holdings];

    if (holdingsFilter.search) {
      const searchLower = holdingsFilter.search.toLowerCase();
      result = result.filter(
        (h) =>
          h.ticker.toLowerCase().includes(searchLower) ||
          (h.company_name && h.company_name.toLowerCase().includes(searchLower)),
      );
    }

    if (holdingsFilter.sector) {
      result = result.filter((h) => h.sector === holdingsFilter.sector);
    }

    if (holdingsFilter.performance === 'gainers') {
      result = result.filter((h) => h.unrealized_gain > 0);
    } else if (holdingsFilter.performance === 'losers') {
      result = result.filter((h) => h.unrealized_gain < 0);
    }

    const { sortColumn, sortDirection } = holdingsFilter;
    result.sort((a, b) => {
      const aVal = a[sortColumn as keyof Holding];
      const bVal = b[sortColumn as keyof Holding];
      let comparison = 0;
      if (aVal == null && bVal == null) comparison = 0;
      else if (aVal == null) comparison = -1;
      else if (bVal == null) comparison = 1;
      else if (typeof aVal === 'number' && typeof bVal === 'number') {
        comparison = aVal - bVal;
      } else {
        comparison = String(aVal).localeCompare(String(bVal), undefined, { sensitivity: 'base' });
      }
      return sortDirection === 'desc' ? -comparison : comparison;
    });

    return result;
  }, [holdings, holdingsFilter]);

  const handleSort = (column: string) => {
    if (holdingsFilter.sortColumn === column) {
      setHoldingsFilter({ sortDirection: holdingsFilter.sortDirection === 'asc' ? 'desc' : 'asc' });
    } else {
      setHoldingsFilter({ sortColumn: column, sortDirection: getDefaultDirection(column) });
    }
  };

  if (filteredAndSorted.length === 0) {
    const hasFilters =
      holdingsFilter.search || holdingsFilter.sector || holdingsFilter.performance !== 'all';
    return (
      <EmptyState
        icon={
          <svg className="w-12 h-12" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1.5}
              d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4"
            />
          </svg>
        }
        title={hasFilters ? 'No holdings match your filters' : 'No holdings yet'}
        description={
          hasFilters
            ? 'Try adjusting your search or filter criteria.'
            : 'Add your first stock holding to start tracking your portfolio.'
        }
      />
    );
  }

  return (
    <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-finance-gradient text-slate-200 text-left border-b border-blue-900/40">
              {COLUMNS.map((col) => (
                <th
                  key={col.key}
                  onClick={() => handleSort(col.key)}
                  className={`px-3 py-3 font-semibold text-xs uppercase tracking-wider cursor-pointer select-none whitespace-nowrap hover:text-white transition-colors ${
                    col.align === 'right' ? 'text-right' : 'text-left'
                  }`}
                >
                  {col.label}
                  <SortIcon
                    active={holdingsFilter.sortColumn === col.key}
                    dir={holdingsFilter.sortDirection}
                  />
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
            {filteredAndSorted.map((holding) => (
              <HoldingRow key={holding.id} holding={holding} />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
