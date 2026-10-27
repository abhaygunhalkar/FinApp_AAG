import { Area, AreaChart, ResponsiveContainer, YAxis } from 'recharts';
import type { DashboardSummary, IntradaySeries } from '../../types';
import { Skeleton } from './Card';
import { fmtMoney, fmtPct } from './format';

/** Dark pill whose colour and arrow follow the sign of `value`. */
function ChangePill({
  value,
  pct,
  suffix,
  digits,
  hidden,
}: {
  value: number;
  pct: number;
  suffix: string;
  /** Decimals on the percent: a day's move needs more than all-time. */
  digits: number;
  hidden: boolean;
}) {
  const style =
    value > 0
      ? { arrow: '▲', cls: 'bg-[#0F3D2E] text-[#6EE7B7]' }
      : value < 0
        ? { arrow: '▼', cls: 'bg-[#3B1518] text-[#FCA5A5]' }
        : { arrow: '', cls: 'bg-white/10 text-[#C9D2DF]' };
  return (
    <span
      className={`inline-flex w-fit items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-semibold tabular-nums ${style.cls}`}
    >
      {style.arrow && <span aria-hidden="true">{style.arrow}</span>}
      {fmtMoney(Math.abs(value), hidden)} ({fmtPct(pct, digits)}) {suffix}
    </span>
  );
}

/** Line colours on the dark strip: green when the day is up, red when down. */
const UP_COLOR = '#4ADE80';
const DOWN_COLOR = '#F87171';

function Sparkline({ intraday, up }: { intraday: IntradaySeries | undefined; up: boolean }) {
  const points = intraday?.points ?? [];
  if (points.length < 2) {
    return (
      <p className="flex h-14 items-center justify-end text-[11px] text-[#A9B4C6]">
        {intraday ? 'No intraday prices yet' : 'Loading today’s prices…'}
      </p>
    );
  }
  const color = up ? UP_COLOR : DOWN_COLOR;
  const when = intraday?.is_today ? 'today' : 'on the last trading day';
  return (
    <div
      role="img"
      aria-label={`Portfolio value through the session ${when}, ${up ? 'up' : 'down'} on the day`}
      className="h-14 w-full"
    >
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={points} margin={{ top: 4, right: 0, bottom: 0, left: 0 }}>
          <defs>
            <linearGradient id="hero-spark-fill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity={0.3} />
              <stop offset="100%" stopColor={color} stopOpacity={0} />
            </linearGradient>
          </defs>
          <YAxis hide domain={['dataMin', 'dataMax']} />
          <Area
            type="monotone"
            dataKey="value"
            stroke={color}
            strokeWidth={2}
            fill="url(#hero-spark-fill)"
            isAnimationActive={false}
            dot={false}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

/**
 * Dark strip at the top: portfolio value, all-time and today's change, today's trend.
 *
 * `total_portfolio_value` is the market value of stock + ETF holdings only; the
 * backend does NOT add the cash balance, so the label's tooltip says so.
 */
export default function Hero({
  summary,
  intraday,
  hidden,
}: {
  summary: DashboardSummary | undefined;
  intraday: IntradaySeries | undefined;
  hidden: boolean;
}) {
  if (!summary) {
    return (
      <section
        aria-label="Portfolio value"
        className="flex flex-wrap items-center gap-x-7 gap-y-4 rounded-2xl bg-[#0C1322] px-5 py-4"
      >
        <div className="flex flex-col gap-2">
          <Skeleton className="h-3 w-28 !bg-white/10" />
          <Skeleton className="h-8 w-48 !bg-white/10" />
        </div>
        <div className="flex flex-col gap-1.5">
          <Skeleton className="h-6 w-44 !rounded-full !bg-white/10" />
          <Skeleton className="h-6 w-40 !rounded-full !bg-white/10" />
        </div>
        <Skeleton className="h-14 min-w-0 flex-[1_1_320px] !bg-white/10" />
      </section>
    );
  }

  const allTimePct =
    summary.total_invested > 0 ? (summary.unrealized_gain / summary.total_invested) * 100 : 0;
  const yesterday = summary.total_portfolio_value - summary.daily_change;
  const todayPct = yesterday > 0 ? (summary.daily_change / yesterday) * 100 : 0;
  const cashNote = `Market value of your stock and ETF holdings. Cash (${fmtMoney(
    summary.cash_position,
    hidden,
  )}) is not included.`;

  return (
    <section
      aria-label="Portfolio value"
      className="flex flex-wrap items-center gap-x-7 gap-y-4 rounded-2xl bg-[#0C1322] px-5 py-4 text-white"
    >
      <div className="flex flex-col gap-1.5">
        <span className="flex items-center gap-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-[#A9B4C6]">
          Portfolio value
          <button
            type="button"
            title={cashNote}
            aria-label={cashNote}
            className="rounded-full text-[#A9B4C6] hover:text-white focus-visible:outline-2 focus-visible:outline-[#7AB0FF]"
          >
            <svg viewBox="0 0 16 16" fill="currentColor" className="h-3.5 w-3.5" aria-hidden="true">
              <path d="M8 1.5a6.5 6.5 0 1 0 0 13 6.5 6.5 0 0 0 0-13M8.75 11.5h-1.5V7h1.5zM8 5.9a.9.9 0 1 1 0-1.8.9.9 0 0 1 0 1.8" />
            </svg>
          </button>
        </span>
        <span className="text-[32px] font-bold leading-none tracking-tight tabular-nums">
          {fmtMoney(summary.total_portfolio_value, hidden)}
        </span>
      </div>
      <div className="flex flex-col gap-1.5">
        <ChangePill
          value={summary.unrealized_gain}
          pct={allTimePct}
          suffix="all time"
          digits={1}
          hidden={hidden}
        />
        <ChangePill
          value={summary.daily_change}
          pct={todayPct}
          suffix="today"
          digits={2}
          hidden={hidden}
        />
      </div>
      <div className="flex min-w-0 flex-[1_1_320px] flex-col gap-0.5">
        <Sparkline intraday={intraday} up={summary.daily_change >= 0} />
        <span className="text-right text-[11px] text-[#A9B4C6]">
          {intraday && !intraday.is_today ? 'Last trading day' : 'Today'}
        </span>
      </div>
    </section>
  );
}
