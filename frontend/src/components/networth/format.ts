export const MASK = '••••••';

const usd0 = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
});

/** $51,510 / −$51,510 (typographic minus) — or the mask when balances are hidden. */
export function fmtMoney(v: number, hidden = false): string {
  if (hidden) return MASK;
  const rounded = Math.round(v);
  return rounded < 0 ? `−${usd0.format(-rounded)}` : usd0.format(rounded);
}

/** $51.5k / $1.2M, for chart labels. */
export function fmtCompact(v: number, hidden = false): string {
  if (hidden) return MASK;
  const sign = v < 0 ? '-' : '';
  const abs = Math.abs(v);
  if (abs >= 1_000_000) return `${sign}$${(abs / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000) return `${sign}$${(abs / 1_000).toFixed(1)}k`;
  return `${sign}$${abs.toFixed(0)}`;
}

export function fmtPct(v: number, digits = 0): string {
  return `${v.toFixed(digits)}%`;
}

/** Parses a YYYY-MM-DD string as a local date (avoids the UTC off-by-one). */
export function parseISODate(iso: string): Date {
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function toISODate(d: Date): string {
  return d.toLocaleDateString('en-CA');
}

export function fmtDay(iso: string): string {
  return parseISODate(iso).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

export function fmtMonthYear(iso: string): string {
  return parseISODate(iso).toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
}

export function fmtShortDate(iso: string): string {
  return parseISODate(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export function timeAgo(iso: string, now = Date.now()): string {
  const minutes = Math.floor((now - new Date(iso).getTime()) / 60000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

/** Whole days since `iso` when it is more than `afterDays` old, else null. */
export function staleDays(iso: string | null, afterDays = 3, now = Date.now()): number | null {
  if (!iso) return null;
  const days = Math.floor((now - new Date(iso).getTime()) / 86_400_000);
  return days > afterDays ? days : null;
}

export function initials(text: string): string {
  const words = text.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return '?';
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0][0] + words[1][0]).toUpperCase();
}
