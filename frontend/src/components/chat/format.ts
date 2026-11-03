import { MASK } from '../networth/format';

const formatters = new Map<string, Intl.NumberFormat>();

/** "$1,234.56" in the message's currency, or the mask when numbers are hidden. */
export function fmtAmount(value: number, currency: string, hidden: boolean): string {
  if (hidden) return MASK;
  let f = formatters.get(currency);
  if (!f) {
    f = new Intl.NumberFormat('en-US', { style: 'currency', currency });
    formatters.set(currency, f);
  }
  return f.format(value);
}
