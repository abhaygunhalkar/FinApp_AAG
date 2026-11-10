import { useMemo } from 'react';
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { fmtCompact, fmtMoney } from '../networth/format';
import { BASELINE_COLOR, SCENARIO_COLOR, chartRows, yearTicks, type ChartRow } from './payoffChart';
import { fmtYearMonth, type Comparison } from './simulatePayoff';

function BalanceTooltip({
  active,
  payload,
  hidden,
  showScenario,
}: {
  active?: boolean;
  payload?: { payload: ChartRow }[];
  hidden: boolean;
  showScenario: boolean;
}) {
  if (!active || !payload?.length) return null;
  const row = payload[0].payload;
  const line = (label: string, color: string, value: number | null) => (
    <p className="flex items-center gap-2 tabular-nums text-slate-900 dark:text-slate-100">
      <span className="h-2 w-2 rounded-full" style={{ background: color }} aria-hidden="true" />
      <span className="text-slate-500 dark:text-slate-400">{label}</span>
      <span className="ml-auto pl-3 font-semibold">
        {value === null ? 'Paid off' : fmtMoney(value, hidden)}
      </span>
    </p>
  );
  return (
    <div className="min-w-[200px] space-y-1 rounded-xl border border-ink-200 bg-white px-3 py-2 text-xs shadow-md dark:border-slate-600 dark:bg-slate-800">
      <p className="font-semibold text-slate-900 dark:text-white">{fmtYearMonth(row.month)}</p>
      {line('Current plan', BASELINE_COLOR, row.baseline)}
      {showScenario && line('With changes', SCENARIO_COLOR, row.scenario)}
    </div>
  );
}

interface BalanceChartProps {
  comparison: Comparison;
  startBalance: number;
  hidden: boolean;
  /** Draw the scenario line only when it differs from the current plan. */
  showScenario: boolean;
}

export default function BalanceChart({
  comparison,
  startBalance,
  hidden,
  showScenario,
}: BalanceChartProps) {
  const rows = useMemo(() => chartRows(comparison, startBalance), [comparison, startBalance]);
  const ticks = useMemo(() => yearTicks(rows), [rows]);
  const base = comparison.baseline.summary;
  const next = comparison.scenario.summary;

  return (
    <section className="rounded-[20px] border border-ink-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-4 sm:p-5">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
          Remaining balance
        </h2>
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-[13px] text-slate-500 dark:text-slate-400">
          <span className="flex items-center gap-1.5">
            <span className="h-0.5 w-4 rounded" style={{ background: BASELINE_COLOR }} />
            Current plan
          </span>
          {showScenario && (
            <span className="flex items-center gap-1.5">
              <span className="h-0.5 w-4 rounded" style={{ background: SCENARIO_COLOR }} />
              With changes
            </span>
          )}
        </div>
      </div>
      <div
        className="h-[260px] select-none touch-pan-y"
        role="img"
        aria-label={`Remaining balance over time. Current plan pays off ${
          base.payoffMonth ? fmtYearMonth(base.payoffMonth) : 'never'
        }${
          showScenario
            ? `; with changes ${next.payoffMonth ? fmtYearMonth(next.payoffMonth) : 'never'}`
            : ''
        }.`}
      >
        <ResponsiveContainer width="100%" height={260}>
          <AreaChart data={rows} margin={{ top: 8, right: 4, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id="mortgageScenarioFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={SCENARIO_COLOR} stopOpacity={0.3} />
                <stop offset="100%" stopColor={SCENARIO_COLOR} stopOpacity={0} />
              </linearGradient>
              <linearGradient id="mortgageBaselineFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={BASELINE_COLOR} stopOpacity={0.14} />
                <stop offset="100%" stopColor={BASELINE_COLOR} stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid
              vertical={false}
              strokeDasharray="4 6"
              stroke="var(--color-ink-200)"
              strokeOpacity={0.6}
            />
            <XAxis
              dataKey="month"
              ticks={ticks}
              tickFormatter={(m: string) => m.slice(0, 4)}
              tick={{ fill: 'var(--color-slate-500)', fontSize: 12 }}
              tickLine={false}
              axisLine={false}
              minTickGap={16}
            />
            <YAxis
              tickFormatter={(v: number) => fmtCompact(v, hidden)}
              tick={{ fill: 'var(--color-slate-500)', fontSize: 12 }}
              tickLine={false}
              axisLine={false}
              width={60}
            />
            <Tooltip
              content={<BalanceTooltip hidden={hidden} showScenario={showScenario} />}
              cursor={{ stroke: 'var(--color-slate-400)', strokeWidth: 1 }}
              isAnimationActive={false}
            />
            <Area
              type="monotone"
              dataKey="baseline"
              stroke={BASELINE_COLOR}
              strokeWidth={2}
              fill="url(#mortgageBaselineFill)"
              dot={false}
              activeDot={{ r: 4, fill: BASELINE_COLOR, strokeWidth: 0 }}
              isAnimationActive={false}
            />
            {showScenario && (
              <Area
                type="monotone"
                dataKey="scenario"
                stroke={SCENARIO_COLOR}
                strokeWidth={2.5}
                fill="url(#mortgageScenarioFill)"
                dot={false}
                activeDot={{ r: 4, fill: SCENARIO_COLOR, strokeWidth: 0 }}
                isAnimationActive={false}
              />
            )}
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </section>
  );
}
