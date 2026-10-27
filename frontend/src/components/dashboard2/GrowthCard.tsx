import { useEffect, useMemo, useState } from 'react';
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { useMarketHistory, usePortfolioHistory } from '../../hooks';
import { parseLocalDateString } from '../../utils/date';
import { growthAxis, withBenchmark, type GrowthRow } from './calc';
import { Card, Empty, Skeleton } from './Card';
import { fmtCompact, fmtMoney } from './format';

type Range = 7 | 30 | 90 | 365;
const RANGES: { value: Range; label: string; period: string }[] = [
  { value: 7, label: '7d', period: '7d' },
  { value: 30, label: '30d', period: '30d' },
  { value: 90, label: '90d', period: '90d' },
  { value: 365, label: '1y', period: '1y' },
];
/** S&P 500 tracker used as the benchmark (a plain ticker; "^GSPC" needs URL escaping). */
const BENCHMARK = 'VOO';
const BENCH_COLOR = '#F97316';
const LINE_COLOR = '#1D4ED8';

/**
 * Date label that stays inside the plot: the first one starts at its point and the
 * last one ends at its point, so neither runs under the Y-axis labels or off the card.
 */
function DateTick({
  x,
  y,
  payload,
  first,
  last,
  range,
}: {
  x?: number;
  y?: number;
  payload?: { value: string };
  first: string;
  last: string;
  range: Range;
}) {
  if (!payload) return null;
  const anchor = payload.value === first ? 'start' : payload.value === last ? 'end' : 'middle';
  return (
    <text x={x} y={y} dy="0.71em" textAnchor={anchor} fontSize={11} fill="#5B6472">
      {fmtDay(payload.value, range)}
    </text>
  );
}

/** `count` evenly spaced dates for the X axis, first and last included. */
function pickTicks(rows: GrowthRow[], count: number): string[] {
  const n = rows.length;
  if (n <= count) return rows.map((r) => r.date);
  return Array.from(
    { length: count },
    (_, i) => rows[Math.round((i * (n - 1)) / (count - 1))].date,
  );
}

/** Narrow cards (phones) fit three date labels without crowding; wider ones fit five. */
const WIDE_QUERY = '(min-width: 640px)';

function useIsWide(): boolean {
  const [wide, setWide] = useState(
    () =>
      typeof window === 'undefined' || !window.matchMedia || window.matchMedia(WIDE_QUERY).matches,
  );
  useEffect(() => {
    if (!window.matchMedia) return;
    const mq = window.matchMedia(WIDE_QUERY);
    const onChange = () => setWide(mq.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);
  return wide;
}

function fmtDay(iso: string, range: Range): string {
  return parseLocalDateString(iso).toLocaleDateString(
    'en-US',
    range === 365 ? { month: 'short', year: '2-digit' } : { month: 'short', day: 'numeric' },
  );
}

function GrowthTooltip({
  active,
  payload,
  hidden,
}: {
  active?: boolean;
  payload?: { payload: GrowthRow }[];
  hidden: boolean;
}) {
  if (!active || !payload?.length) return null;
  const row = payload[0].payload;
  return (
    <div className="rounded-lg border border-[#E4E7EC] bg-white px-3 py-2 text-xs shadow-md dark:border-slate-600 dark:bg-slate-800">
      <p className="mb-1 font-semibold text-[#0E1116] dark:text-white">
        {parseLocalDateString(row.date).toLocaleDateString('en-US', {
          month: 'short',
          day: 'numeric',
          year: 'numeric',
        })}
      </p>
      <p className="tabular-nums text-[#0E1116] dark:text-slate-200">
        <span className="text-[#5B6472] dark:text-slate-400">Portfolio: </span>
        {fmtMoney(row.value, hidden)}
      </p>
      {row.bench !== undefined && (
        <p className="tabular-nums text-[#0E1116] dark:text-slate-200">
          <span className="text-[#5B6472] dark:text-slate-400">S&amp;P 500: </span>
          {fmtMoney(row.bench, hidden)}
        </p>
      )}
    </div>
  );
}

export default function GrowthCard({ hidden }: { hidden: boolean }) {
  const [range, setRange] = useState<Range>(30);
  const [showBench, setShowBench] = useState(true);
  const wide = useIsWide();
  const period = RANGES.find((r) => r.value === range)!.period;
  const { data: history, isLoading } = usePortfolioHistory(range);
  const {
    data: bench,
    isLoading: benchLoading,
    isError: benchError,
  } = useMarketHistory(showBench ? BENCHMARK : '', period);

  const rows = useMemo(
    () => withBenchmark(history ?? [], showBench ? (bench ?? []) : []),
    [history, bench, showBench],
  );
  // The backend answers [] when yfinance fails; either way the portfolio line still draws.
  const benchMissing =
    showBench && (benchError || (!benchLoading && !rows.some((r) => r.bench !== undefined)));

  const controls = (
    <div className="flex flex-wrap items-center gap-1.5">
      <button
        type="button"
        onClick={() => setShowBench((v) => !v)}
        aria-pressed={showBench}
        className={`inline-flex h-7 items-center gap-1.5 rounded-lg border px-2.5 text-xs font-semibold transition-colors ${
          showBench
            ? 'border-[#FDBA74] bg-[#FFF7ED] text-[#0E1116] dark:border-orange-700 dark:bg-orange-950/40 dark:text-white'
            : 'border-[#DDE1E7] bg-white text-[#0E1116] hover:bg-[#F7F8FA] dark:border-slate-600 dark:bg-slate-800 dark:text-white dark:hover:bg-slate-700'
        }`}
      >
        <span
          className="w-3 border-t-2 border-dashed"
          style={{ borderColor: BENCH_COLOR }}
          aria-hidden="true"
        />
        vs S&amp;P 500
      </button>
      <div
        role="group"
        aria-label="Growth range"
        className="inline-flex rounded-lg bg-[#F1F2F5] p-0.5 dark:bg-slate-700"
      >
        {RANGES.map((r) => {
          const active = range === r.value;
          return (
            <button
              key={r.value}
              type="button"
              onClick={() => setRange(r.value)}
              aria-pressed={active}
              className={`h-6 min-w-8 rounded-md px-1.5 text-[11px] font-semibold tabular-nums transition-colors ${
                active
                  ? 'bg-white text-[#0E1116] shadow-sm dark:bg-slate-900 dark:text-white'
                  : 'text-[#5B6472] hover:text-[#0E1116] dark:text-slate-300 dark:hover:text-white'
              }`}
            >
              {r.label}
            </button>
          );
        })}
      </div>
    </div>
  );

  let body;
  if (isLoading) {
    body = <Skeleton className="h-[150px]" />;
  } else if (rows.length < 2) {
    body = (
      <Empty>Portfolio history will appear here once a few days of prices are recorded.</Empty>
    );
  } else {
    const axis = growthAxis(rows);
    const ticks = pickTicks(rows, wide ? 5 : 3);
    // Show a decimal on "$121.5k" when ticks are under $1k apart.
    const fmtTick = (v: number) =>
      axis.step < 1000 && Math.abs(v) >= 1000 ? `$${(v / 1000).toFixed(1)}k` : fmtCompact(v);
    body = (
      <div
        role="img"
        aria-label={`Portfolio value over ${RANGES.find((r) => r.value === range)!.label}${
          showBench ? ' compared with the S&P 500' : ''
        }`}
        className="h-[150px]"
      >
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={rows} margin={{ top: 6, right: 22, bottom: 4, left: 0 }}>
            <CartesianGrid vertical={false} stroke="#EEF0F3" />
            <XAxis
              dataKey="date"
              ticks={ticks}
              tick={<DateTick first={ticks[0]} last={ticks[ticks.length - 1]} range={range} />}
              tickLine={false}
              tickMargin={8}
              axisLine={false}
              interval={0}
              minTickGap={8}
            />
            <YAxis
              domain={axis.domain}
              ticks={axis.ticks}
              tickFormatter={fmtTick}
              tick={hidden ? false : { fontSize: 11, fill: '#5B6472' }}
              tickLine={false}
              axisLine={false}
              width={hidden ? 8 : 48}
            />
            <Tooltip
              content={<GrowthTooltip hidden={hidden} />}
              cursor={{ stroke: '#CBD5E1', strokeWidth: 1 }}
            />
            {showBench && (
              <Line
                type="monotone"
                dataKey="bench"
                stroke={BENCH_COLOR}
                strokeWidth={2}
                strokeDasharray="6 5"
                dot={false}
                isAnimationActive={false}
                connectNulls
              />
            )}
            <Line
              type="monotone"
              dataKey="value"
              stroke={LINE_COLOR}
              strokeWidth={2}
              dot={false}
              activeDot={{ r: 3 }}
              isAnimationActive={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    );
  }

  return (
    <Card title="Portfolio growth" aside={controls}>
      {body}
      {benchMissing && (
        <p className="text-xs text-[#5B6472] dark:text-slate-400">S&amp;P 500 data unavailable</p>
      )}
    </Card>
  );
}
