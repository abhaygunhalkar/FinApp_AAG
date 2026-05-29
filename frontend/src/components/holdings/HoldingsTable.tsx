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
  { key: 'company_name', label: 'Company Name', align: 'left' },
  { key: 'quantity', label: 'Quantity', align: 'right' },
  { key: 'average_buy_price', label: 'Avg Buy Price', align: 'right' },
  { key: 'current_price', label: 'Current Price', align: 'right' },
  { key: 'daily_change', label: 'Day Change', align: 'right' },
  { key: 'daily_change_pct', label: 'Day Change %', align: 'right' },
  { key: 'total_invested', label: 'Total Invested', align: 'right' },
  { key: 'current_value', label: 'Current Value', align: 'right' },
  { key: 'unrealized_gain', label: 'Gain/Loss', align: 'right' },
  { key: 'unrealized_gain_pct', label: 'Gain %', align: 'right' },
  { key: 'sector', label: 'Sector', align: 'left' },
  { key: 'broker', label: 'Broker', align: 'left' },
  { key: 'allocation_pct', label: 'Allocation %', align: 'right' },
  { key: 'updated_at', label: 'Last Updated', align: 'left' },
];

function getDefaultDirection(column: string): 'asc' | 'desc' {
  if (NUMERIC_COLUMNS.has(column)) return 'desc';
  return 'asc';
}

export default function HoldingsTable({ holdings }: HoldingsTableProps) {
  const { holdingsFilter, setHoldingsFilter } = useUIStore();

  const filteredAndSorted = useMemo(() => {
    let result = [...holdings];

    // Search filter: case-insensitive partial match on ticker or company_name
    if (holdingsFilter.search) {
      const searchLower = holdingsFilter.search.toLowerCase();
      result = result.filter(
        (h) =>
          h.ticker.toLowerCase().includes(searchLower) ||
          (h.company_name && h.company_name.toLowerCase().includes(searchLower))
      );
    }

    // Sector filter
    if (holdingsFilter.sector) {
      result = result.filter((h) => h.sector === holdingsFilter.sector);
    }

    // Performance filter
    if (holdingsFilter.performance === 'gainers') {
      result = result.filter((h) => h.unrealized_gain > 0);
    } else if (holdingsFilter.performance === 'losers') {
      result = result.filter((h) => h.unrealized_gain < 0);
    }

    // Sort
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
        comparison = String(aVal).localeCompare(String(bVal), undefined, {
          sensitivity: 'base',
        });
      }

      return sortDirection === 'desc' ? -comparison : comparison;
    });

    return result;
  }, [holdings, holdingsFilter]);

  const handleSort = (column: string) => {
    if (holdingsFilter.sortColumn === column) {
      // Toggle direction
      setHoldingsFilter({
        sortDirection: holdingsFilter.sortDirection === 'asc' ? 'desc' : 'asc',
      });
    } else {
      // New column: use default direction
      setHoldingsFilter({
        sortColumn: column,
        sortDirection: getDefaultDirection(column),
      });
    }
  };

  const getSortIndicator = (column: string) => {
    if (holdingsFilter.sortColumn !== column) return null;
    return holdingsFilter.sortDirection === 'asc' ? ' ▲' : ' ▼';
  };

  if (filteredAndSorted.length === 0) {
    const hasFilters =
      holdingsFilter.search ||
      holdingsFilter.sector ||
      holdingsFilter.performance !== 'all';

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
    <div className="overflow-x-auto">
      <table className="w-full border-collapse">
        <thead>
          <tr className="border-b-2 border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800">
            {COLUMNS.map((col) => (
              <th
                key={col.key}
                onClick={() => handleSort(col.key)}
                className={`cursor-pointer select-none whitespace-nowrap font-semibold text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-gray-100 ${
                  col.align === 'right' ? 'text-right' : 'text-left'
                }`}
                style={{ padding: '8px', fontSize: '14px', minHeight: '40px' }}
              >
                {col.label}
                {getSortIndicator(col.key)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {filteredAndSorted.map((holding) => (
            <HoldingRow key={holding.id} holding={holding} />
          ))}
        </tbody>
      </table>
    </div>
  );
}
