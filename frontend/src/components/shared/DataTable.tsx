import { useState, useCallback } from 'react';

export interface Column<T> {
  key: string;
  header: string;
  sortable?: boolean;
  render?: (row: T) => React.ReactNode;
}

interface DataTableProps<T> {
  columns: Column<T>[];
  data: T[];
  keyExtractor: (row: T) => string | number;
  defaultSortColumn?: string;
  defaultSortDirection?: 'asc' | 'desc';
  onSortChange?: (column: string, direction: 'asc' | 'desc') => void;
}

export default function DataTable<T extends Record<string, unknown>>({
  columns,
  data,
  keyExtractor,
  defaultSortColumn,
  defaultSortDirection = 'asc',
  onSortChange,
}: DataTableProps<T>) {
  const [sortColumn, setSortColumn] = useState<string | undefined>(defaultSortColumn);
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>(defaultSortDirection);

  const handleSort = useCallback(
    (columnKey: string) => {
      let newDirection: 'asc' | 'desc' = 'asc';
      if (sortColumn === columnKey) {
        newDirection = sortDirection === 'asc' ? 'desc' : 'asc';
      }
      setSortColumn(columnKey);
      setSortDirection(newDirection);
      onSortChange?.(columnKey, newDirection);
    },
    [sortColumn, sortDirection, onSortChange],
  );

  const sortedData = [...data].sort((a, b) => {
    if (!sortColumn) return 0;
    const aVal = a[sortColumn];
    const bVal = b[sortColumn];

    if (aVal == null && bVal == null) return 0;
    if (aVal == null) return sortDirection === 'asc' ? -1 : 1;
    if (bVal == null) return sortDirection === 'asc' ? 1 : -1;

    let comparison: number;
    if (typeof aVal === 'string' && typeof bVal === 'string') {
      comparison = aVal.localeCompare(bVal);
    } else if (typeof aVal === 'number' && typeof bVal === 'number') {
      comparison = aVal - bVal;
    } else {
      comparison = String(aVal).localeCompare(String(bVal));
    }

    return sortDirection === 'asc' ? comparison : -comparison;
  });

  return (
    <div className="overflow-x-auto rounded-lg border border-gray-200 dark:border-gray-700">
      <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
        <thead className="bg-gray-50 dark:bg-gray-800">
          <tr>
            {columns.map((col) => (
              <th
                key={col.key}
                scope="col"
                className={`px-2 py-3 text-left text-sm font-semibold text-gray-700 dark:text-gray-300 ${
                  col.sortable
                    ? 'cursor-pointer select-none hover:bg-gray-100 dark:hover:bg-gray-700'
                    : ''
                }`}
                style={{ minHeight: '40px', padding: '8px' }}
                onClick={col.sortable ? () => handleSort(col.key) : undefined}
              >
                <div className="flex items-center gap-1">
                  <span style={{ fontSize: '14px' }}>{col.header}</span>
                  {col.sortable && sortColumn === col.key && (
                    <span className="text-blue-600 dark:text-blue-400">
                      {sortDirection === 'asc' ? '↑' : '↓'}
                    </span>
                  )}
                </div>
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-200 dark:divide-gray-700 bg-white dark:bg-gray-900">
          {sortedData.map((row) => (
            <tr
              key={keyExtractor(row)}
              className="hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
              style={{ minHeight: '40px' }}
            >
              {columns.map((col) => (
                <td
                  key={col.key}
                  className="whitespace-nowrap text-gray-900 dark:text-gray-100"
                  style={{
                    fontSize: '14px',
                    minHeight: '40px',
                    padding: '8px',
                    lineHeight: '24px',
                  }}
                >
                  {col.render ? col.render(row) : ((row[col.key] as React.ReactNode) ?? '—')}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
