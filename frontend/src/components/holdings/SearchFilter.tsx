import { useUIStore } from '../../store/uiStore';
import type { Holding } from '../../types';

interface SearchFilterProps {
  holdings: Holding[];
}

const selectClass =
  'px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 focus:outline-none focus:ring-2 focus:ring-slate-400 focus:border-transparent transition';

export default function SearchFilter({ holdings }: SearchFilterProps) {
  const { holdingsFilter, setHoldingsFilter } = useUIStore();

  const sectors = Array.from(
    new Set(holdings.map((h) => h.sector).filter((s): s is string => s !== null && s !== '')),
  ).sort();

  return (
    <div className="flex flex-wrap items-center gap-3">
      {/* Search */}
      <div className="relative flex-1 min-w-[220px]">
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 16 16"
          fill="currentColor"
          className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none"
        >
          <path
            fillRule="evenodd"
            d="M9.965 11.026a5 5 0 1 1 1.06-1.06l2.755 2.754a.75.75 0 1 1-1.06 1.06l-2.755-2.754ZM10.5 7a3.5 3.5 0 1 1-7 0 3.5 3.5 0 0 1 7 0Z"
            clipRule="evenodd"
          />
        </svg>
        <input
          id="holdings-search"
          type="text"
          placeholder="Search by ticker or company…"
          value={holdingsFilter.search}
          onChange={(e) => setHoldingsFilter({ search: e.target.value })}
          className="w-full pl-9 pr-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-400 focus:border-transparent transition"
        />
      </div>

      {/* Sector */}
      <select
        id="sector-filter"
        value={holdingsFilter.sector ?? ''}
        onChange={(e) =>
          setHoldingsFilter({ sector: e.target.value === '' ? null : e.target.value })
        }
        className={selectClass}
      >
        <option value="">All Sectors</option>
        {sectors.map((sector) => (
          <option key={sector} value={sector}>
            {sector}
          </option>
        ))}
      </select>

      {/* Performance */}
      <select
        id="performance-filter"
        value={holdingsFilter.performance}
        onChange={(e) =>
          setHoldingsFilter({ performance: e.target.value as 'all' | 'gainers' | 'losers' })
        }
        className={selectClass}
      >
        <option value="all">All Performance</option>
        <option value="gainers">Gainers only</option>
        <option value="losers">Losers only</option>
      </select>
    </div>
  );
}
