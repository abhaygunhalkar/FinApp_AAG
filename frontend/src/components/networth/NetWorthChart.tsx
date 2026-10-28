import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, YAxis } from 'recharts';
import { fmtCompact } from './format';
import type { SeriesPoint } from './netWorthMath';

const LINE = '#7AB0FF';
const CHART_HEIGHT = 160;

interface NetWorthChartProps {
  series: SeriesPoint[];
  hidden: boolean;
  /** Animate the line; off for the first render, on when the range changes. */
  animate: boolean;
  /** Called with the index under the pointer, or null when it leaves. */
  onScrub: (index: number | null) => void;
}

interface ChartPointerState {
  activeTooltipIndex?: number | string | null;
}

export default function NetWorthChart({ series, hidden, animate, onScrub }: NetWorthChartProps) {
  const values = series.map((p) => p.value);
  const min = Math.min(...values);
  const max = Math.max(...values);
  // Pad the domain so a flat line sits mid-chart and peaks don't touch the edges.
  const pad = max === min ? Math.max(1, Math.abs(max) * 0.05) : (max - min) * 0.12;

  const handleMove = (state: ChartPointerState) => {
    const i = Number(state?.activeTooltipIndex);
    onScrub(Number.isInteger(i) && i >= 0 && i < series.length ? i : null);
  };

  return (
    <div
      className="h-[160px] select-none touch-pan-y"
      role="img"
      aria-label={`Net worth trend from ${fmtCompact(series[0].value, hidden)} to ${fmtCompact(
        series[series.length - 1].value,
        hidden,
      )}. Hover or drag across the chart to see a specific day.`}
    >
      <ResponsiveContainer width="100%" height={CHART_HEIGHT}>
        <AreaChart
          data={series}
          margin={{ top: 8, right: 0, left: 0, bottom: 8 }}
          onMouseMove={handleMove}
          onMouseLeave={() => onScrub(null)}
          onTouchMove={handleMove}
          onTouchEnd={() => onScrub(null)}
        >
          <defs>
            <linearGradient id="nwHeroFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={LINE} stopOpacity={0.35} />
              <stop offset="100%" stopColor={LINE} stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid vertical={false} strokeDasharray="4 6" stroke="rgba(255,255,255,0.10)" />
          <YAxis
            orientation="right"
            domain={[min - pad, max + pad]}
            ticks={max === min ? [max] : [min, max]}
            tickFormatter={(v: number) => fmtCompact(v, hidden)}
            tick={{ fill: '#A3AEC2', fontSize: 12 }}
            tickLine={false}
            axisLine={false}
            width={64}
          />
          <Tooltip
            content={() => null}
            cursor={{ stroke: 'rgba(255,255,255,0.35)', strokeWidth: 1 }}
            isAnimationActive={false}
          />
          <Area
            type="monotone"
            dataKey="value"
            // Fill down to the lowest point, not to $0 (which may sit above a negative series).
            baseValue="dataMin"
            stroke={LINE}
            strokeWidth={2}
            fill="url(#nwHeroFill)"
            dot={false}
            activeDot={{ r: 5, fill: LINE, stroke: '#0C1322', strokeWidth: 2 }}
            isAnimationActive={animate}
            animationDuration={600}
            animationEasing="ease-out"
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

/** Placeholder while there is less than a week of history. */
export function NetWorthChartEmpty() {
  return (
    <div className="relative h-[160px] flex items-center justify-center">
      <div
        className="absolute inset-x-0 top-1/2 border-t border-dashed border-white/10"
        aria-hidden="true"
      />
      <div className="relative flex flex-col items-center gap-3 text-center px-4">
        <span className="relative flex h-3 w-3" aria-hidden="true">
          <span className="absolute inline-flex h-full w-full rounded-full bg-[#7AB0FF] opacity-60 animate-ping motion-reduce:animate-none" />
          <span className="relative inline-flex h-3 w-3 rounded-full bg-[#7AB0FF]" />
        </span>
        <p className="text-sm text-[#C3CDDD] bg-[#0C1322] px-2">
          Your trend builds over time — check back in a week
        </p>
      </div>
    </div>
  );
}
