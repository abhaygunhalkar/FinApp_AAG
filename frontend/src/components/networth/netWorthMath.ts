import type { FinancialAccount, NetWorthSnapshot } from '../../types';
import type { CategoryConfig } from './accountConfig';
import { parseISODate, toISODate } from './format';

export type RangeKey = '1W' | '1M' | '3M' | '1Y' | 'ALL';

export const RANGES: { key: RangeKey; label: string; days: number | null; caption: string }[] = [
  { key: '1W', label: '1W', days: 7, caption: 'past week' },
  { key: '1M', label: '1M', days: 30, caption: 'past month' },
  { key: '3M', label: '3M', days: 91, caption: 'past 3 months' },
  { key: '1Y', label: '1Y', days: 365, caption: 'past year' },
  { key: 'ALL', label: 'All', days: null, caption: 'all time' },
];

/** Minimum span of history before a trend line is meaningful. */
export const MIN_HISTORY_DAYS = 7;

export interface SeriesPoint {
  date: string;
  value: number;
}

/**
 * Daily net worth series for the range. Today's stored snapshot is replaced by
 * the live value so the line always ends at the headline number.
 */
export function buildSeries(
  snapshots: NetWorthSnapshot[],
  liveNetWorth: number,
  range: RangeKey,
  today: Date = new Date(),
): SeriesPoint[] {
  const todayISO = toISODate(today);
  const days = RANGES.find((r) => r.key === range)?.days ?? null;
  let cutoff: string | null = null;
  if (days !== null) {
    const d = new Date(today);
    d.setDate(d.getDate() - days);
    cutoff = toISODate(d);
  }
  const points = snapshots
    .filter((s) => s.date < todayISO && (cutoff === null || s.date >= cutoff))
    .map((s) => ({ date: s.date, value: s.net_worth }));
  points.push({ date: todayISO, value: liveNetWorth });
  return points;
}

/** Days between the oldest snapshot and today (0 when there is none). */
export function historySpanDays(snapshots: NetWorthSnapshot[], today: Date = new Date()): number {
  if (snapshots.length === 0) return 0;
  const first = parseISODate(snapshots[0].date);
  const start = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  return Math.round((start.getTime() - first.getTime()) / 86_400_000);
}

export interface Change {
  amount: number;
  /** null when the baseline is zero (percent undefined). */
  pct: number | null;
}

/** Change from the first point of the series to `toValue`. */
export function changeOver(series: SeriesPoint[], toValue: number): Change | null {
  if (series.length < 2) return null;
  const base = series[0].value;
  const amount = toValue - base;
  return { amount, pct: base !== 0 ? (amount / Math.abs(base)) * 100 : null };
}

/**
 * Accounts created after `startDate` (the range's first snapshot) and on or
 * before `endDate` (null for today), so their balances are in the change.
 */
export function accountsAddedBetween(
  accounts: FinancialAccount[],
  startDate: string,
  endDate: string | null,
): FinancialAccount[] {
  return accounts.filter((a) => {
    const day = a.created_at.slice(0, 10);
    return day > startDate && (endDate === null || day <= endDate);
  });
}

export interface BreakdownSegment {
  key: string;
  label: string;
  color: string;
  value: number;
  pct: number;
}

/** Totals per category, largest first, dropping empty categories. */
export function breakdown(
  accounts: FinancialAccount[],
  categories: CategoryConfig[],
  palette: string[],
): BreakdownSegment[] {
  const total = accounts.reduce((s, a) => s + a.balance, 0);
  return categories
    .map((c) => {
      const value = accounts
        .filter((a) => c.types.includes(a.account_type))
        .reduce((s, a) => s + a.balance, 0);
      return { key: c.key, label: c.label, value, pct: share(value, total) };
    })
    .filter((s) => s.value > 0)
    .sort((a, b) => b.value - a.value)
    .map((s, i) => ({ ...s, color: palette[i % palette.length] }));
}

/** Share of `part` in `total` as a 0–100 number, clamped. */
export function share(part: number, total: number): number {
  if (total <= 0) return 0;
  return Math.min(100, Math.max(0, (part / total) * 100));
}
