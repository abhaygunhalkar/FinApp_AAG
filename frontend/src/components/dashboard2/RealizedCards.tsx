import { useState } from 'react';
import { Bar, BarChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Card, Empty, Skeleton, SkeletonRows } from './Card';
import { fmtSigned, tone } from './format';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const STOCKS_COLOR = '#1D4ED8';
const OPTIONS_COLOR = '#7C3AED';
/** Tickers listed before the rest fold into "+N more". */
const TOP_TICKERS = 8;

export interface MonthRow {
  month: number;
  stocks: number;
  options: number;
}

export interface TickerGain {
  ticker: string;
  gain: number;
}

function LegendDot({ color, label }: { color: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1">
      <span className="h-2 w-2 rounded-sm" style={{ background: color }} aria-hidden="true" />
      {label}
    </span>
  );
}

function MonthTooltip({
  active,
  payload,
  hidden,
}: {
  active?: boolean;
  payload?: { payload: MonthRow }[];
  hidden: boolean;
}) {
  if (!active || !payload?.length) return null;
  const row = payload[0].payload;
  return (
    <div className="rounded-lg border border-[#E4E7EC] bg-white px-3 py-2 text-xs shadow-md dark:border-slate-600 dark:bg-slate-800">
      <p className="mb-1 font-semibold text-[#0E1116] dark:text-white">{MONTHS[row.month]}</p>
      <p className="tabular-nums dark:text-slate-200">
        <span className="text-[#5B6472] dark:text-slate-400">Stocks </span>
        {fmtSigned(row.stocks, hidden)}
      </p>
      <p className="tabular-nums dark:text-slate-200">
        <span className="text-[#5B6472] dark:text-slate-400">Options </span>
        {fmtSigned(row.options, hidden)}
      </p>
    </div>
  );
}

export function MonthlyRealizedCard({
  months,
  hidden,
}: {
  /** Twelve rows for the current year; null while loading. */
  months: MonthRow[] | null;
  hidden: boolean;
}) {
  const title = 'Monthly realized gain';
  if (!months) {
    return (
      <Card title={title}>
        <Skeleton className="h-[130px]" />
      </Card>
    );
  }
  const ytd = months.reduce((s, m) => s + m.stocks + m.options, 0);
  const any = months.some((m) => m.stocks !== 0 || m.options !== 0);
  const t = tone(ytd);

  return (
    <Card
      title={title}
      aside={
        <div className="flex items-center gap-3 text-[11px] text-[#5B6472] dark:text-slate-400">
          <LegendDot color={STOCKS_COLOR} label="Stocks" />
          <LegendDot color={OPTIONS_COLOR} label="Options" />
          {any && (
            <span className={`font-semibold tabular-nums ${t.className}`}>
              YTD {fmtSigned(ytd, hidden, true)}
            </span>
          )}
        </div>
      }
    >
      {any ? (
        <div
          role="img"
          aria-label={`Realized gain by month this year, stocks and options. Year to date ${fmtSigned(ytd, hidden, true)}.`}
          className="h-[130px]"
        >
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={months} margin={{ top: 4, right: 0, bottom: 0, left: 0 }} barGap={2}>
              <XAxis
                dataKey="month"
                tickFormatter={(m: number) => MONTHS[m][0]}
                tick={{ fontSize: 11, fill: '#5B6472' }}
                tickLine={false}
                axisLine={{ stroke: '#DDE1E7' }}
                interval={0}
              />
              <YAxis hide domain={[(min: number) => Math.min(0, min), 'auto']} />
              <ReferenceLine y={0} stroke="#DDE1E7" />
              <Tooltip content={<MonthTooltip hidden={hidden} />} cursor={{ fill: '#F1F2F5' }} />
              <Bar
                dataKey="stocks"
                fill={STOCKS_COLOR}
                radius={[2, 2, 0, 0]}
                isAnimationActive={false}
              />
              <Bar
                dataKey="options"
                fill={OPTIONS_COLOR}
                radius={[2, 2, 0, 0]}
                isAnimationActive={false}
              />
            </BarChart>
          </ResponsiveContainer>
        </div>
      ) : (
        <Empty>No realized gains yet this year.</Empty>
      )}
    </Card>
  );
}

export function TickerRealizedCard({
  tickers,
  hidden,
}: {
  /** This year's stock realized gain per ticker; null while loading. */
  tickers: TickerGain[] | null;
  hidden: boolean;
}) {
  const [showAll, setShowAll] = useState(false);
  const title = 'Realized gain by ticker';
  const aside = <span className="text-xs text-[#5B6472] dark:text-slate-400">Stocks · YTD</span>;
  if (!tickers) {
    return (
      <Card title={title} aside={aside}>
        <SkeletonRows rows={5} />
      </Card>
    );
  }
  if (tickers.length === 0) {
    return (
      <Card title={title} aside={aside}>
        <Empty>No stock sales this year yet.</Empty>
      </Card>
    );
  }
  // Gains largest first, losses after them (smallest loss first, biggest loss last).
  const sorted = [...tickers].sort((a, b) => b.gain - a.gain);
  const shown = showAll ? sorted : sorted.slice(0, TOP_TICKERS);
  const more = sorted.length - TOP_TICKERS;
  const max = Math.max(...sorted.map((t) => Math.abs(t.gain)), 1);

  return (
    <Card title={title} aside={aside}>
      <ul className="flex flex-col">
        {shown.map((t) => {
          const tn = tone(t.gain);
          return (
            <li
              key={t.ticker}
              className="grid grid-cols-[3.5rem_minmax(0,1fr)_auto] items-center gap-2 rounded-md px-1 py-1 hover:bg-[#F1F2F5] dark:hover:bg-slate-700/50"
            >
              <span className="text-xs font-semibold text-[#0E1116] dark:text-white">
                {t.ticker}
              </span>
              <span className="h-2.5" aria-hidden="true">
                <span
                  className={`block h-full rounded-[3px] ${t.gain < 0 ? 'bg-[#B91C1C]' : 'bg-[#15803D]'}`}
                  style={{ width: `${Math.max((Math.abs(t.gain) / max) * 100, 1.5)}%` }}
                />
              </span>
              <span
                className={`min-w-[4.5rem] text-right text-xs font-semibold tabular-nums ${tn.className}`}
              >
                {fmtSigned(t.gain, hidden, true)}
              </span>
            </li>
          );
        })}
      </ul>
      {more > 0 && (
        <button
          type="button"
          onClick={() => setShowAll((v) => !v)}
          aria-expanded={showAll}
          className="w-fit text-[13px] font-medium text-[#1D4ED8] hover:underline dark:text-blue-400"
        >
          {showAll ? 'Show top 8' : `+${more} more`}
        </button>
      )}
    </Card>
  );
}
