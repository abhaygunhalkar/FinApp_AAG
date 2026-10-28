import { useMemo, useState } from 'react';
import type { FinancialAccount, NetWorthSnapshot } from '../../types';
import { useCountUp } from '../../hooks/useCountUp';
import NetWorthChart, { NetWorthChartEmpty } from './NetWorthChart';
import { fmtDay, fmtMoney, fmtPct } from './format';
import {
  MIN_HISTORY_DAYS,
  RANGES,
  accountsAddedBetween,
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
  /** Accounts, to flag a change that includes an account added in the range. */
  accounts: FinancialAccount[];
  hidden: boolean;
  ready: boolean;
}

export default function NetWorthHero({
  netWorth,
  totalAssets,
  totalLiabilities,
  liquidCash,
  snapshots,
  accounts,
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
  // Snapshots hold totals only, so an added account's opening balance can't be
  // taken out of the change yet; say when it is in there.
  const added =
    change && series.length > 0
      ? accountsAddedBetween(accounts, series[0].date, scrubbed?.date ?? null)
      : [];
  const caption = RANGES.find((r) => r.key === range)!.caption;
  const debtRatio = totalAssets > 0 ? (totalLiabilities / totalAssets) * 100 : null;

  return (
    <section
      aria-label="Net worth summary"
      className="rounded-2xl bg-[#0C1322] px-4 py-5 sm:px-6 text-white shadow-[0_12px_40px_-12px_rgba(12,19,34,0.45)]"
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#A3AEC2]">
            Net worth
          </p>
          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1.5">
            <p
              className="text-[40px] font-bold leading-none tracking-[-0.03em] break-words"
              aria-live="polite"
            >
              {fmtMoney(shownValue, hidden)}
            </p>
            {change && (
              <ChangeBadge change={change} hidden={hidden} added={added.map((a) => a.name)} />
            )}
            <span className="text-xs text-[#A3AEC2]">
              {scrubbed ? fmtDay(scrubbed.date) : change ? caption : 'Today'}
            </span>
          </div>
        </div>

        <div
          role="group"
          aria-label="Time range"
          className="flex w-full sm:w-auto shrink-0 rounded-full bg-white/[0.06] p-0.5"
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
              className={`flex-1 sm:flex-none h-7 min-w-9 px-2.5 rounded-full text-xs font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#7AB0FF] ${
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

      <div className="mt-3 -mx-1">
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

      <dl className="mt-3 grid grid-cols-2 lg:grid-cols-4 gap-px overflow-hidden rounded-xl bg-white/10">
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
  added,
}: {
  change: { amount: number; pct: number | null };
  hidden: boolean;
  /** Names of accounts added in the range, whose balances are in the change. */
  added: string[];
}) {
  const up = change.amount >= 0;
  const sign = up ? '+' : '−';
  const amount = fmtMoney(Math.abs(change.amount), hidden);
  const pct = change.pct === null ? '' : ` (${fmtPct(Math.abs(change.pct), 1)})`;
  const note = added.length ? `Includes accounts added this period: ${added.join(', ')}` : null;
  return (
    <span
      title={note ?? undefined}
      className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold ${
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
      {note && (
        <>
          <span aria-hidden="true">*</span>
          <span className="sr-only">. {note}</span>
        </>
      )}
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
    <div className="bg-[#0C1322] px-4 py-3 sm:px-5">
      <dt className="text-[11px] font-medium uppercase tracking-[0.12em] text-[#A3AEC2]">
        {label}
      </dt>
      <dd className={`mt-0.5 text-xl font-bold ${valueClass}`}>{value}</dd>
    </div>
  );
}
