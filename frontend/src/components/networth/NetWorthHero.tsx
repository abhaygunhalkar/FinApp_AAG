import { useMemo, useState } from 'react';
import type { NetWorthSnapshot } from '../../types';
import { useCountUp } from '../../hooks/useCountUp';
import NetWorthChart, { NetWorthChartEmpty } from './NetWorthChart';
import { fmtDay, fmtMoney, fmtPct } from './format';
import {
  MIN_HISTORY_DAYS,
  RANGES,
  buildSeries,
  changeOver,
  historySpanDays,
  type RangeKey,
} from './netWorthMath';

interface NetWorthHeroProps {
  netWorth: number;
  totalAssets: number;
  totalLiabilities: number;
  liquidCash: number;
  snapshots: NetWorthSnapshot[];
  hidden: boolean;
  ready: boolean;
}

export default function NetWorthHero({
  netWorth,
  totalAssets,
  totalLiabilities,
  liquidCash,
  snapshots,
  hidden,
  ready,
}: NetWorthHeroProps) {
  const [range, setRange] = useState<RangeKey>('3M');
  const [scrubIndex, setScrubIndex] = useState<number | null>(null);
  // On load the headline counts up; the chart only animates on range changes.
  const [rangeChanged, setRangeChanged] = useState(false);

  const series = useMemo(
    () => buildSeries(snapshots, netWorth, range),
    [snapshots, netWorth, range],
  );
  const hasTrend = historySpanDays(snapshots) >= MIN_HISTORY_DAYS && series.length >= 2;
  const animated = useCountUp(ready ? netWorth : null);

  const scrubbed = hasTrend && scrubIndex !== null ? series[scrubIndex] : null;
  const shownValue = scrubbed ? scrubbed.value : animated;
  const change = hasTrend ? changeOver(series, scrubbed ? scrubbed.value : netWorth) : null;
  const caption = RANGES.find((r) => r.key === range)!.caption;
  const debtRatio = totalAssets > 0 ? (totalLiabilities / totalAssets) * 100 : null;

  return (
    <section
      aria-label="Net worth summary"
      className="rounded-[24px] bg-[#0C1322] p-5 sm:p-8 text-white shadow-[0_12px_40px_-12px_rgba(12,19,34,0.45)]"
    >
      <div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#A3AEC2]">
            Net worth
          </p>
          <p
            className="mt-2 text-[44px] sm:text-[64px] font-bold leading-none tracking-[-0.035em] break-words"
            aria-live="polite"
          >
            {fmtMoney(shownValue, hidden)}
          </p>
          <div className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-2 min-h-7">
            {change && <ChangeBadge change={change} hidden={hidden} />}
            <span className="text-sm text-[#A3AEC2]">
              {scrubbed ? fmtDay(scrubbed.date) : change ? caption : 'Today'}
            </span>
          </div>
        </div>

        <div
          role="group"
          aria-label="Time range"
          className="flex w-full sm:w-auto shrink-0 rounded-full bg-white/[0.06] p-1"
        >
          {RANGES.map((r) => (
            <button
              key={r.key}
              type="button"
              aria-pressed={range === r.key}
              onClick={() => {
                setRange(r.key);
                setRangeChanged(true);
                setScrubIndex(null);
              }}
              className={`flex-1 sm:flex-none h-11 min-w-11 px-3 rounded-full text-sm font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#7AB0FF] ${
                range === r.key
                  ? 'bg-white text-[#0C1322]'
                  : 'text-[#C3CDDD] hover:bg-white/10 hover:text-white'
              }`}
            >
              {r.label}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-6 -mx-1">
        {hasTrend ? (
          <NetWorthChart
            series={series}
            hidden={hidden}
            animate={rangeChanged}
            onScrub={setScrubIndex}
          />
        ) : (
          <NetWorthChartEmpty />
        )}
      </div>

      <dl className="mt-6 grid grid-cols-2 lg:grid-cols-4 gap-px overflow-hidden rounded-2xl bg-white/10">
        <Stat label="Assets" value={fmtMoney(totalAssets, hidden)} valueClass="text-[#8FC1FF]" />
        <Stat
          label="Liabilities"
          value={fmtMoney(totalLiabilities, hidden)}
          valueClass="text-[#FDBA74]"
        />
        <Stat
          label="Debt-to-asset"
          value={debtRatio === null ? '—' : fmtPct(debtRatio, debtRatio < 10 ? 1 : 0)}
        />
        <Stat label="Liquid cash" value={fmtMoney(liquidCash, hidden)} />
      </dl>
    </section>
  );
}

function ChangeBadge({
  change,
  hidden,
}: {
  change: { amount: number; pct: number | null };
  hidden: boolean;
}) {
  const up = change.amount >= 0;
  const sign = up ? '+' : '−';
  const amount = fmtMoney(Math.abs(change.amount), hidden);
  const pct = change.pct === null ? '' : ` (${fmtPct(Math.abs(change.pct), 1)})`;
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-sm font-semibold ${
        up ? 'bg-[#13294B] text-[#9CC7FF]' : 'bg-[#3B1F0F] text-[#FDBA74]'
      }`}
    >
      <svg
        viewBox="0 0 12 12"
        className={`h-3 w-3 ${up ? '' : 'rotate-180'}`}
        fill="currentColor"
        aria-hidden="true"
      >
        <path d="M6 1.5 10.5 7H7.25v3.5h-2.5V7H1.5L6 1.5Z" />
      </svg>
      <span className="sr-only">{up ? 'Up' : 'Down'}</span>
      {sign}
      {amount}
      {pct}
    </span>
  );
}

function Stat({
  label,
  value,
  valueClass = 'text-white',
}: {
  label: string;
  value: string;
  valueClass?: string;
}) {
  return (
    <div className="bg-[#0C1322] px-4 py-4 sm:px-5">
      <dt className="text-xs font-medium uppercase tracking-[0.12em] text-[#A3AEC2]">{label}</dt>
      <dd className={`mt-1.5 text-lg sm:text-xl font-semibold ${valueClass}`}>{value}</dd>
    </div>
  );
}
