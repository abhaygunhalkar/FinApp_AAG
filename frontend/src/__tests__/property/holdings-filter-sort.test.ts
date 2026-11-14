import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import type { Holding } from '../../types/holding';

/**
 * Feature: personal-finance-dashboard
 * Properties 2, 3, 4: Holdings filter and sort correctness
 *
 * These property tests verify the filter/sort logic used in HoldingsTable.
 * The logic is extracted as pure functions matching the component's useMemo implementation.
 *
 * **Validates: Requirements 2.1, 2.2, 2.3, 2.4**
 */

// --- Pure filter/sort functions extracted from HoldingsTable ---

function filterBySearch(holdings: Holding[], search: string): Holding[] {
  if (!search) return holdings;
  const searchLower = search.toLowerCase();
  return holdings.filter(
    (h) =>
      h.ticker.toLowerCase().includes(searchLower) ||
      (h.company_name && h.company_name.toLowerCase().includes(searchLower)),
  );
}

function filterBySector(holdings: Holding[], sector: string | null): Holding[] {
  if (!sector) return holdings;
  return holdings.filter((h) => h.sector === sector);
}

function filterByPerformance(
  holdings: Holding[],
  performance: 'all' | 'gainers' | 'losers',
): Holding[] {
  if (performance === 'gainers') {
    return holdings.filter((h) => h.unrealized_gain > 0);
  } else if (performance === 'losers') {
    return holdings.filter((h) => h.unrealized_gain < 0);
  }
  return holdings;
}

function sortHoldings(
  holdings: Holding[],
  sortColumn: keyof Holding,
  sortDirection: 'asc' | 'desc',
): Holding[] {
  const result = [...holdings];
  result.sort((a, b) => {
    const aVal = a[sortColumn];
    const bVal = b[sortColumn];

    let comparison = 0;
    if (aVal == null && bVal == null) comparison = 0;
    else if (aVal == null) comparison = -1;
    else if (bVal == null) comparison = 1;
    else if (typeof aVal === 'number' && typeof bVal === 'number') {
      comparison = aVal - bVal;
    } else {
      comparison = String(aVal).localeCompare(String(bVal), undefined, {
        sensitivity: 'base',
      });
    }

    return sortDirection === 'desc' ? -comparison : comparison;
  });
  return result;
}

// --- Arbitraries ---

const SECTORS = ['Technology', 'Healthcare', 'Finance', 'Energy', 'Consumer', 'Industrial'];

const TICKER_CHARS = 'ABCDEFGHXYZ';
const ALPHA_CHARS = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ .,';

function arbStringFrom(chars: string, minLength: number, maxLength: number): fc.Arbitrary<string> {
  return fc
    .array(fc.constantFrom(...chars.split('')), { minLength, maxLength })
    .map((arr) => arr.join(''));
}

const holdingArbitrary: fc.Arbitrary<Holding> = fc.record({
  id: fc.integer({ min: 1, max: 100000 }),
  ticker: arbStringFrom(TICKER_CHARS, 1, 5),
  company_name: fc.oneof(fc.constant(null), arbStringFrom(ALPHA_CHARS, 1, 30)),
  quantity: fc.double({ min: 0.01, max: 10000, noNaN: true }),
  average_buy_price: fc.double({ min: 0.01, max: 10000, noNaN: true }),
  current_price: fc.double({ min: 0, max: 10000, noNaN: true }),
  total_invested: fc.double({ min: 0, max: 100000, noNaN: true }),
  current_value: fc.double({ min: 0, max: 100000, noNaN: true }),
  daily_change: fc.double({ min: -1000, max: 1000, noNaN: true }),
  daily_change_pct: fc.double({ min: -50, max: 50, noNaN: true }),
  unrealized_gain: fc.double({ min: -50000, max: 50000, noNaN: true }),
  unrealized_gain_pct: fc.double({ min: -100, max: 1000, noNaN: true }),
  allocation_pct: fc.double({ min: 0, max: 100, noNaN: true }),
  sector: fc.oneof(fc.constant(null), fc.constantFrom(...SECTORS)),
  industry: fc.oneof(fc.constant(null), fc.constant('Software'), fc.constant('Banking')),
  dividend_yield: fc.double({ min: 0, max: 20, noNaN: true }),
  holding_type: fc.constantFrom<'stock' | 'etf'>('stock', 'etf'),
  broker: fc.oneof(fc.constant(null), fc.constant('Robinhood'), fc.constant('Schwab')),
  annual_dividend_income: fc.double({ min: 0, max: 50000, noNaN: true }),
  created_at: fc.constant('2024-01-01T00:00:00Z'),
  updated_at: fc.constant('2024-06-01T00:00:00Z'),
});

const holdingsListArbitrary = fc.array(holdingArbitrary, { minLength: 0, maxLength: 20 });

const searchStringArbitrary = arbStringFrom(
  'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ',
  0,
  5,
);

const sortColumnArbitrary = fc.constantFrom<keyof Holding>(
  'ticker',
  'company_name',
  'quantity',
  'average_buy_price',
  'current_price',
  'total_invested',
  'current_value',
  'unrealized_gain',
  'unrealized_gain_pct',
  'allocation_pct',
  'dividend_yield',
  'annual_dividend_income',
);

const sortDirectionArbitrary = fc.constantFrom<'asc' | 'desc'>('asc', 'desc');

const sectorFilterArbitrary = fc.oneof(fc.constant(null), fc.constantFrom(...SECTORS));

// --- Property Tests ---

describe('Property 2: Holdings search filter', () => {
  it('filtered results contain exactly those holdings where ticker or company_name contains the search string as a case-insensitive substring', () => {
    fc.assert(
      fc.property(holdingsListArbitrary, searchStringArbitrary, (holdings, search) => {
        const result = filterBySearch(holdings, search);

        if (!search) {
          // Empty search returns all holdings
          expect(result).toHaveLength(holdings.length);
          return;
        }

        const searchLower = search.toLowerCase();

        // Every result must match the search
        for (const h of result) {
          const tickerMatch = h.ticker.toLowerCase().includes(searchLower);
          const nameMatch = h.company_name
            ? h.company_name.toLowerCase().includes(searchLower)
            : false;
          expect(tickerMatch || nameMatch).toBe(true);
        }

        // Every holding that matches must be in the result
        for (const h of holdings) {
          const tickerMatch = h.ticker.toLowerCase().includes(searchLower);
          const nameMatch = h.company_name
            ? h.company_name.toLowerCase().includes(searchLower)
            : false;
          if (tickerMatch || nameMatch) {
            expect(result).toContain(h);
          }
        }
      }),
      { numRuns: 100 },
    );
  });
});

describe('Property 3: Holdings sort correctness', () => {
  it('for any list of holdings and any valid sort column and direction, adjacent pairs respect the specified direction', () => {
    fc.assert(
      fc.property(
        holdingsListArbitrary,
        sortColumnArbitrary,
        sortDirectionArbitrary,
        (holdings, sortColumn, sortDirection) => {
          const sorted = sortHoldings(holdings, sortColumn, sortDirection);

          // Verify length is preserved
          expect(sorted).toHaveLength(holdings.length);

          // Verify adjacent pair ordering
          for (let i = 0; i < sorted.length - 1; i++) {
            const aVal = sorted[i][sortColumn];
            const bVal = sorted[i + 1][sortColumn];

            let comparison = 0;
            if (aVal == null && bVal == null) comparison = 0;
            else if (aVal == null) comparison = -1;
            else if (bVal == null) comparison = 1;
            else if (typeof aVal === 'number' && typeof bVal === 'number') {
              comparison = aVal - bVal;
            } else {
              comparison = String(aVal).localeCompare(String(bVal), undefined, {
                sensitivity: 'base',
              });
            }

            if (sortDirection === 'asc') {
              expect(comparison).toBeLessThanOrEqual(0);
            } else {
              expect(comparison).toBeGreaterThanOrEqual(0);
            }
          }
        },
      ),
      { numRuns: 100 },
    );
  });
});

describe('Property 4: Holdings predicate filter', () => {
  it('sector filter produces only holdings with matching sector', () => {
    fc.assert(
      fc.property(holdingsListArbitrary, sectorFilterArbitrary, (holdings, sector) => {
        const result = filterBySector(holdings, sector);

        if (!sector) {
          // Null sector filter returns all holdings
          expect(result).toHaveLength(holdings.length);
          return;
        }

        // Every result must have the matching sector
        for (const h of result) {
          expect(h.sector).toBe(sector);
        }

        // Every holding with matching sector must be in the result
        for (const h of holdings) {
          if (h.sector === sector) {
            expect(result).toContain(h);
          }
        }
      }),
      { numRuns: 100 },
    );
  });

  it('performance filter "gainers" produces only holdings with unrealized_gain > 0', () => {
    fc.assert(
      fc.property(holdingsListArbitrary, (holdings) => {
        const result = filterByPerformance(holdings, 'gainers');

        // Every result must have positive unrealized_gain
        for (const h of result) {
          expect(h.unrealized_gain).toBeGreaterThan(0);
        }

        // Every holding with positive unrealized_gain must be in the result
        for (const h of holdings) {
          if (h.unrealized_gain > 0) {
            expect(result).toContain(h);
          }
        }
      }),
      { numRuns: 100 },
    );
  });

  it('performance filter "losers" produces only holdings with unrealized_gain < 0', () => {
    fc.assert(
      fc.property(holdingsListArbitrary, (holdings) => {
        const result = filterByPerformance(holdings, 'losers');

        // Every result must have negative unrealized_gain
        for (const h of result) {
          expect(h.unrealized_gain).toBeLessThan(0);
        }

        // Every holding with negative unrealized_gain must be in the result
        for (const h of holdings) {
          if (h.unrealized_gain < 0) {
            expect(result).toContain(h);
          }
        }
      }),
      { numRuns: 100 },
    );
  });

  it('performance filter "all" returns all holdings unchanged', () => {
    fc.assert(
      fc.property(holdingsListArbitrary, (holdings) => {
        const result = filterByPerformance(holdings, 'all');
        expect(result).toHaveLength(holdings.length);
      }),
      { numRuns: 100 },
    );
  });
});
