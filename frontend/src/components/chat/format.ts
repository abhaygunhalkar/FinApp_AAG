import { MASK } from '../networth/format';

const formatters = new Map<string, Intl.NumberFormat>();

/**
 * An amount in the message's currency, in the user's locale ("$1,234.56" in
 * en-US, "1.234,56 $" in de-DE), or the mask when numbers are hidden.
 */
export function fmtAmount(value: number, currency: string, hidden: boolean): string {
  if (hidden) return MASK;
  let f = formatters.get(currency);
  if (!f) {
    f = new Intl.NumberFormat(undefined, { style: 'currency', currency });
    formatters.set(currency, f);
  }
  // A true minus sign (U+2212), as elsewhere in the app, wherever the
  // locale puts it.
  return f
    .formatToParts(value)
    .map((p) => (p.type === 'minusSign' ? '−' : p.value))
    .join('');
}
