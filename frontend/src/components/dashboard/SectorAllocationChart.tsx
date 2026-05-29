import { useMemo } from 'react';
import {
  PieChart,
  Pie,
  Cell,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts';
import { useHoldings } from '../../hooks/useHoldings';
import { EmptyState } from '../shared';

const COLORS = [
  '#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6',
  '#06b6d4', '#ec4899', '#f97316', '#14b8a6', '#6366f1',
];

interface SectorData {
  name: string;
  value: number;
  percentage: number;
}

export default function SectorAllocationChart() {
  const { data: holdings, isLoading } = useHoldings();

  const sectorData: SectorData[] = useMemo(() => {
    if (!holdings || holdings.length === 0) return [];

    const sectorMap = new Map<string, number>();
    let totalValue = 0;

    for (const holding of holdings) {
      const sector = holding.sector || 'Unknown';
      const value = holding.current_value;
      sectorMap.set(sector, (sectorMap.get(sector) || 0) + value);
      totalValue += value;
    }

    if (totalValue === 0) return [];

    return Array.from(sectorMap.entries())
      .map(([name, value]) => ({
        name,
        value,
        percentage: Math.round((value / totalValue) * 10000) / 100,
      }))
      .sort((a, b) => b.value - a.value);
  }, [holdings]);

  if (isLoading) {
    return (
      <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-4 shadow-sm">
        <div className="h-64 flex items-center justify-center">
          <p className="text-sm text-gray-500 dark:text-gray-400">Loading...</p>
        </div>
      </div>
    );
  }

  if (sectorData.length === 0) {
    return (
      <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-4 shadow-sm">
        <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-4">
          Sector Allocation
        </h3>
        <EmptyState
          icon={
            <svg xmlns="http://www.w3.org/2000/svg" className="h-10 w-10" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M11 3.055A9.001 9.001 0 1020.945 13H11V3.055z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M20.488 9H15V3.512A9.025 9.025 0 0120.488 9z" />
            </svg>
          }
          title="No Sector Data"
          description="Sector allocation will appear here once you have holdings with sector information."
        />
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-4 shadow-sm">
      <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-4">
        Sector Allocation
      </h3>
      <ResponsiveContainer width="100%" height={256}>
        <PieChart>
          <Pie
            data={sectorData}
            cx="50%"
            cy="50%"
            innerRadius={50}
            outerRadius={90}
            dataKey="value"
            nameKey="name"
            label={({ payload, x, y }) => (
              <text
                x={x}
                y={y}
                fill="#111827"
                textAnchor="middle"
                dominantBaseline="central"
                fontSize={12}
              >
                {`${payload.percentage}%`}
              </text>
            )}
            labelLine={false}
          >
            {sectorData.map((_entry, index) => (
              <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
            ))}
          </Pie>
          <Tooltip
            formatter={(value) => [
              new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(Number(value)),
              'Value',
            ]}
            contentStyle={{
              backgroundColor: 'var(--color-white, #fff)',
              border: '1px solid var(--color-gray-200, #e5e7eb)',
              borderRadius: '0.375rem',
            }}
          />
          <Legend
            wrapperStyle={{ fontSize: '12px' }}
          />
        </PieChart>
      </ResponsiveContainer>
    </div>
  );
}
