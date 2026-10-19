import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import type { NetWorthSnapshot } from '../../types';

function fmtShort(v: number): string {
  if (Math.abs(v) >= 1_000_000) return `$${(v / 1_000_000).toFixed(1)}M`;
  if (Math.abs(v) >= 1_000) return `$${(v / 1_000).toFixed(0)}k`;
  return `$${v.toFixed(0)}`;
}

function fmtFull(v: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(v);
}

function fmtDate(dateStr: string): string {
  const [year, month, day] = dateStr.split('-').map(Number);
  return new Date(year, month - 1, day).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
  });
}

interface NetWorthChartProps {
  snapshots: NetWorthSnapshot[];
}

export default function NetWorthChart({ snapshots }: NetWorthChartProps) {
  if (snapshots.length < 2) {
    return (
      <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-6 shadow-sm flex items-center justify-center h-52">
        <div className="text-center">
          <p className="text-sm font-medium text-slate-500 dark:text-slate-400">Not enough history yet</p>
          <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">
            Your net worth trend will appear after balances are updated on multiple days.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-5 shadow-sm">
      <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-200 mb-4">
        Net Worth Over Time
      </h3>
      <ResponsiveContainer width="100%" height={220}>
        <AreaChart data={snapshots} margin={{ top: 5, right: 10, left: 10, bottom: 5 }}>
          <svg>
            <defs>
              <linearGradient id="nwGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#8b5cf6" stopOpacity={0.25} />
                <stop offset="95%" stopColor="#8b5cf6" stopOpacity={0} />
              </linearGradient>
              <linearGradient id="assetGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#10b981" stopOpacity={0.15} />
                <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
              </linearGradient>
            </defs>
          </svg>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.2)" />
          <XAxis
            dataKey="date"
            tick={{ fontSize: 11 }}
            tickLine={false}
            axisLine={false}
            tickFormatter={fmtDate}
            interval="preserveStartEnd"
          />
          <YAxis
            tick={{ fontSize: 11 }}
            tickLine={false}
            axisLine={false}
            tickFormatter={fmtShort}
            width={55}
          />
          <Tooltip
            formatter={(value, name) => {
              const labels: Record<string, string> = {
                net_worth: 'Net Worth',
                total_assets: 'Total Assets',
                total_liabilities: 'Total Liabilities',
              };
              return [fmtFull(Number(value)), labels[String(name)] ?? String(name)];
            }}
            labelFormatter={(label) => fmtDate(String(label))}
            contentStyle={{
              backgroundColor: 'white',
              border: '1px solid #e2e8f0',
              borderRadius: '0.5rem',
              fontSize: '12px',
            }}
          />
          <Area
            type="monotone"
            dataKey="total_assets"
            stroke="#10b981"
            strokeWidth={1.5}
            fill="url(#assetGradient)"
            dot={false}
            activeDot={{ r: 3 }}
          />
          <Area
            type="monotone"
            dataKey="net_worth"
            stroke="#8b5cf6"
            strokeWidth={2}
            fill="url(#nwGradient)"
            dot={false}
            activeDot={{ r: 4 }}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
