import { useState } from 'react';
import type { BrokerSummary } from '../../types';
import { Card, Empty, SkeletonRows } from './Card';
import { fmtMoney, fmtPct, fmtShare, tone } from './format';

/** One blue, darkest for the largest broker. */
const SHADES = ['#1D4ED8', '#3B82F6', '#60A5FA', '#93C5FD'];
const OTHER_COLOR = '#CBD5E1';
/** Rows shown before the rest fold into "+N more". */
const MAX_ROWS = 4;

export default function BrokerCard({
  brokers,
  isLoading,
  hidden,
}: {
  brokers: BrokerSummary[] | undefined;
  isLoading: boolean;
  hidden: boolean;
}) {
  const [expanded, setExpanded] = useState(false);

  if (isLoading) {
    return (
      <Card title="By broker">
        <SkeletonRows rows={5} />
      </Card>
    );
  }
  const sorted = [...(brokers ?? [])].sort((a, b) => b.market_value - a.market_value);
  if (sorted.length === 0) {
    return (
      <Card title="By broker">
        <Empty>No holdings yet. Add one on Holdings to see your brokers here.</Empty>
      </Card>
    );
  }

  const total = sorted.reduce((s, b) => s + b.market_value, 0);
  // Up to 4 brokers get their own shade; beyond that, the top 3 do and the rest share grey.
  const folded = sorted.length > MAX_ROWS;
  const named = folded ? sorted.slice(0, MAX_ROWS - 1) : sorted;
  const rest = folded ? sorted.slice(MAX_ROWS - 1) : [];
  const restValue = rest.reduce((s, b) => s + b.market_value, 0);
  const colorOf = (i: number) => (i < named.length ? SHADES[i] : OTHER_COLOR);
  const visible = folded && !expanded ? named : sorted;

  const segments = [
    ...named.map((b, i) => ({ key: b.broker, value: b.market_value, color: SHADES[i] })),
    ...(rest.length ? [{ key: 'Other', value: restValue, color: OTHER_COLOR }] : []),
  ];

  return (
    <Card
      title="By broker"
      aside={<span className="text-xs text-[#5B6472] dark:text-slate-400">share · return</span>}
    >
      <div
        className="flex h-1.5 gap-[2px] overflow-hidden rounded-full"
        role="img"
        aria-label={segments.map((s) => `${s.key} ${fmtShare(s.value, total)}`).join(', ')}
      >
        {segments.map((s) => (
          <div key={s.key} style={{ flex: `${s.value} 1 0`, background: s.color }} />
        ))}
      </div>
      <ul>
        {visible.map((b) => {
          const i = sorted.indexOf(b);
          const ret = b.total_invested > 0 ? (b.unrealized_gain / b.total_invested) * 100 : 0;
          const t = tone(b.unrealized_gain);
          return (
            <li
              key={b.broker}
              className="grid grid-cols-[10px_minmax(0,1fr)_auto] items-center gap-2 border-t border-[#F1F2F5] py-1.5 dark:border-slate-700"
            >
              <span
                className="h-2 w-2 rounded-sm"
                style={{ background: colorOf(i) }}
                aria-hidden="true"
              />
              <span className="flex min-w-0 flex-col">
                <span className="truncate text-[13px] font-semibold text-[#0E1116] dark:text-white">
                  {b.broker}
                </span>
                <span className="text-xs text-[#5B6472] dark:text-slate-400">
                  {fmtShare(b.market_value, total)} · {b.holding_count}{' '}
                  {b.holding_count === 1 ? 'holding' : 'holdings'}
                </span>
              </span>
              <span className="flex flex-col text-right tabular-nums">
                <span className="text-[13px] font-semibold text-[#0E1116] dark:text-white">
                  {fmtMoney(b.market_value, hidden)}
                </span>
                <span className={`text-xs ${t.className}`}>
                  {t.arrow && <span aria-hidden="true">{t.arrow} </span>}
                  {fmtMoney(Math.abs(b.unrealized_gain), hidden)} (
                  {b.unrealized_gain < 0 ? '−' : ''}
                  {fmtPct(ret)})
                </span>
              </span>
            </li>
          );
        })}
        {folded && (
          <li className="border-t border-[#F1F2F5] pt-1.5 dark:border-slate-700">
            <button
              type="button"
              onClick={() => setExpanded((v) => !v)}
              aria-expanded={expanded}
              className="flex w-full items-center justify-between rounded-md py-0.5 text-[13px] font-medium text-[#1D4ED8] hover:underline dark:text-blue-400"
            >
              <span>{expanded ? 'Show fewer' : `+${rest.length} more`}</span>
              {!expanded && (
                <span className="tabular-nums text-[#5B6472] dark:text-slate-400">
                  {fmtMoney(restValue, hidden)}
                </span>
              )}
            </button>
          </li>
        )}
      </ul>
    </Card>
  );
}
