import { MASK } from '../networth/format';

export { MASK };

/** True minus sign (U+2212) so negatives line up with "+" in tabular figures. */
export const MINUS = '−';

const usd2 = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});
const usd0 = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  maximumFractionDigits: 0,
});

/** "$1,234.56", or the mask when numbers are hidden. */
export function fmtMoney(v: number, hidden: boolean, whole = false): string {
  if (hidden) return MASK;
  return (whole ? usd0 : usd2).format(v);
}

/** "+$1,234.56" / "−$1,234.56"; the sign stays visible even when the amount is hidden. */
export function fmtSigned(v: number, hidden: boolean, whole = false): string {
  const sign = v > 0 ? '+' : v < 0 ? MINUS : '';
  return `${sign}${fmtMoney(Math.abs(v), hidden, whole)}`;
}

/** "$121k" style axis label. */
export function fmtCompact(v: number): string {
  if (Math.abs(v) >= 1000) return `$${(v / 1000).toFixed(Math.abs(v) >= 100_000 ? 0 : 1)}k`;
  return usd0.format(v);
}

/** "12.7%" (one decimal); unsigned. */
export function fmtPct(v: number, digits = 1): string {
  return `${Math.abs(v).toFixed(digits)}%`;
}

/** Share of a whole as a rounded percent, with "<1%" for small slices. */
export function fmtShare(part: number, whole: number): string {
  if (whole <= 0) return '0%';
  const pct = (part / whole) * 100;
  return pct > 0 && pct < 1 ? '<1%' : `${Math.round(pct)}%`;
}

export const UP = '▲';
export const DOWN = '▼';

/** Gains green with ▲, losses red with ▼, zero neutral: never colour alone. */
export function tone(v: number): { arrow: string; className: string } {
  if (v > 0) return { arrow: UP, className: 'text-[#15803D] dark:text-emerald-400' };
  if (v < 0) return { arrow: DOWN, className: 'text-[#B91C1C] dark:text-red-400' };
  return { arrow: '', className: 'text-[#5B6472] dark:text-slate-400' };
}

const CURRENT_YEAR = () => new Date().getFullYear();

/** Whether an ISO date (YYYY-MM-DD…) falls in the current calendar year. */
export function inCurrentYear(iso: string | null | undefined): boolean {
  return !!iso && Number(iso.slice(0, 4)) === CURRENT_YEAR();
}
