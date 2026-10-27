import type { LotSelection, Transaction } from '../../types';

/** Quantities are floats; anything closer than this counts as equal. */
export const EPSILON = 1e-6;

export type LotOrder = 'oldest' | 'highest';

/** A buy lot that still has shares to sell. */
export interface OpenLot {
  id: number;
  date: string;
  price: number;
  quantity: number;
  remaining: number;
}

/**
 * Buys of one holding (one ticker at one broker) that still have shares,
 * oldest first. Lots bought after `saleDate` can't be sold on that date.
 */
export function openLots(transactions: Transaction[], saleDate?: string): OpenLot[] {
  return transactions
    .filter(
      (t) =>
        t.transaction_type === 'buy' &&
        (t.remaining_quantity ?? 0) > EPSILON &&
        (!saleDate || t.transaction_date <= saleDate),
    )
    .map((t) => ({
      id: t.id,
      date: t.transaction_date,
      price: t.price,
      quantity: t.quantity,
      remaining: t.remaining_quantity ?? 0,
    }))
    .sort((a, b) => a.date.localeCompare(b.date) || a.id - b.id);
}

/**
 * Spread `quantity` shares over the lots: oldest first (FIFO) or highest
 * cost first (smallest taxable gain). Returns fewer shares than asked when
 * the lots run out.
 */
export function fillLots(lots: OpenLot[], quantity: number, order: LotOrder): LotSelection[] {
  const sorted =
    order === 'oldest' ? lots : [...lots].sort((a, b) => b.price - a.price || a.id - b.id);
  const picks: LotSelection[] = [];
  let left = quantity;
  for (const lot of sorted) {
    if (left <= EPSILON) break;
    const take = Math.min(lot.remaining, left);
    picks.push({ buy_transaction_id: lot.id, quantity: round(take) });
    left -= take;
  }
  return picks;
}

/** Trim float noise from share counts (8 decimals, like the backend). */
export function round(n: number): number {
  return Math.round(n * 1e8) / 1e8;
}
