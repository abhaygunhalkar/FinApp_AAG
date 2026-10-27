import type { MonthlyPnlEntry } from '../../api/options';
import type { Holding, PortfolioSnapshot, PricePoint } from '../../types';
import { inCurrentYear } from './format';

// Pure calculations behind the Dashboard cards, kept apart so they're easy to test.

/** A single sector above this share of stocks gets a concentration note. */
const CONCENTRATION_PCT = 30;

export interface GrowthRow {
  date: string;
  value: number;
  bench?: number;
}

/**
 * Pair each portfolio day with the benchmark's latest close on or before it, rebased
 * so the benchmark starts at the portfolio's first value: both lines share a start.
 */
export function withBenchmark(history: PortfolioSnapshot[], bench: PricePoint[]): GrowthRow[] {
  const closes = [...bench].sort((a, b) => a.date.localeCompare(b.date));
  let j = -1;
  let base: number | null = null;
  const start = history[0]?.total_value ?? 0;
  return history.map((h) => {
    while (j + 1 < closes.length && closes[j + 1].date <= h.date) j += 1;
    const close = j >= 0 ? closes[j].close : null;
    if (base === null && close !== null) base = close;
    return {
      date: h.date,
      value: h.total_value,
      bench: close !== null && base ? (start * close) / base : undefined,
    };
  });
}

/** Round steps (1, 2, 2.5, 5 × 10ⁿ) from small to large, around `near`. */
function roundSteps(near: number): number[] {
  const mag = 10 ** Math.floor(Math.log10(near));
  return [mag / 10, mag, mag * 10].flatMap((m) => [1, 2, 2.5, 5].map((k) => k * m));
}

/**
 * Y axis hugging the data (not starting at $0): 4–5 evenly spaced ticks on round
 * values, with a little room above and below the lines.
 */
export function growthAxis(rows: GrowthRow[]): {
  domain: [number, number];
  ticks: number[];
  step: number;
} {
  const vals = rows.flatMap((r) => (r.bench !== undefined ? [r.value, r.bench] : [r.value]));
  const min = Math.min(...vals);
  const max = Math.max(...vals);
  const pad = Math.max((max - min) * 0.08, Math.abs(max) * 0.002, 1);
  const span = (lo: number, hi: number, step: number) => ({
    lo: Math.floor(lo / step) * step,
    hi: Math.ceil(hi / step) * step,
  });
  // The finest round step that still gives at most 5 ticks.
  let step = 1;
  for (const s of roundSteps((max - min + 2 * pad) / 4)) {
    const { lo, hi } = span(min - pad, max + pad, s);
    if ((hi - lo) / s + 1 <= 5) {
      step = s;
      break;
    }
  }
  const { lo, hi } = span(min - pad, max + pad, step);
  const ticks: number[] = [];
  for (let v = lo; v <= hi + step / 2; v += step) ticks.push(Math.round(v * 100) / 100);
  return { domain: [lo, hi], ticks, step };
}

/** The fields of an options trade this card reads. */
export interface OptionTradeLite {
  trade_type: string;
  premium: number | null;
  contracts: number | null;
  open_date: string;
}

export interface OptionsYtd {
  collected: number;
  paid: number;
  net: number;
  realized: number;
  trades: number;
}

/**
 * Premiums count trades OPENED this year; realized P&L counts closed/expired
 * trades by expiry date (the same entries the monthly chart uses).
 */
export function optionsYtd(trades: OptionTradeLite[], pnl: MonthlyPnlEntry[]): OptionsYtd {
  let collected = 0;
  let paid = 0;
  let count = 0;
  for (const t of trades) {
    if (!inCurrentYear(t.open_date)) continue;
    count += 1;
    const amount = (t.premium ?? 0) * (t.contracts ?? 0) * 100;
    if (t.trade_type.startsWith('sell_')) collected += amount;
    else if (t.trade_type.startsWith('buy_')) paid += amount;
  }
  const realized = pnl
    .filter((p) => inCurrentYear(p.transaction_date))
    .reduce((s, p) => s + p.realized_gain, 0);
  return { collected, paid, net: collected - paid, realized, trades: count };
}

export interface SectorShare {
  name: string;
  pct: number;
}

/** Each sector's share of stock market value, largest first. */
export function sectorShares(holdings: Holding[]): SectorShare[] {
  const bySector = new Map<string, number>();
  for (const h of holdings) {
    const sector = h.sector || 'Unknown';
    bySector.set(sector, (bySector.get(sector) ?? 0) + h.current_value);
  }
  const total = [...bySector.values()].reduce((s, v) => s + v, 0);
  if (total <= 0) return [];
  return [...bySector.entries()]
    .map(([name, value]) => ({ name, pct: (value / total) * 100 }))
    .sort((a, b) => b.pct - a.pct);
}

/** "Technology is 39%, 2.7× the next sector", or null when nothing dominates. */
export function concentrationNote(sectors: SectorShare[]): string | null {
  const [top, next] = sectors;
  if (!top || top.pct <= CONCENTRATION_PCT) return null;
  const pct = `${top.name} is ${Math.round(top.pct)}%`;
  return next ? `${pct}, ${(top.pct / next.pct).toFixed(1)}× the next sector` : pct;
}
