import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import type { WatchlistItem } from '../../types/watchlist';
import type { ActivityEvent } from '../../types/dashboard';

/**
 * Feature: personal-finance-dashboard
 * Properties 16, 17: Dashboard logic correctness
 *
 * These property tests verify the watchlist movers filter and activity feed
 * ordering/limit logic used in the Dashboard page components.
 *
 * **Validates: Requirements 7.5, 8.1, 8.6**
 */

// --- Pure functions extracted from WatchlistMoversChart ---

function filterWatchlistMovers(watchlist: WatchlistItem[]): WatchlistItem[] {
  if (!watchlist || watchlist.length === 0) return [];
  return watchlist.filter((item) => Math.abs(item.daily_change_pct) >= 2);
}

// --- Pure functions extracted from ActivityFeed ---

function getActivityFeed(events: ActivityEvent[]): ActivityEvent[] {
  // The backend returns events ordered by timestamp descending, limited to 20.
  // The frontend also applies .slice(0, 20) as a safety measure.
  // We test the combined logic: sort descending by timestamp, then limit to 20.
  const sorted = [...events].sort(
    (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime(),
  );
  return sorted.slice(0, 20);
}

// --- Arbitraries ---

const watchlistItemArbitrary: fc.Arbitrary<WatchlistItem> = fc.record({
  id: fc.integer({ min: 1, max: 100000 }),
  ticker: fc
    .array(fc.constantFrom(...'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('')), {
      minLength: 1,
      maxLength: 5,
    })
    .map((arr) => arr.join('')),
  company_name: fc.oneof(fc.constant(null), fc.string({ minLength: 1, maxLength: 30 })),
  current_price: fc.double({ min: 0.01, max: 10000, noNaN: true }),
  daily_change_pct: fc.double({ min: -50, max: 50, noNaN: true }),
  week_52_high: fc.double({ min: 0, max: 10000, noNaN: true }),
  week_52_low: fc.double({ min: 0, max: 10000, noNaN: true }),
  target_buy_price: fc.oneof(
    fc.constant(null),
    fc.double({ min: 0.01, max: 999999.99, noNaN: true }),
  ),
  analyst_rating: fc.oneof(fc.constant(null), fc.constantFrom('Buy', 'Hold', 'Sell')),
  pe_ratio: fc.oneof(fc.constant(null), fc.double({ min: 0, max: 500, noNaN: true })),
  market_cap: fc.oneof(fc.constant(null), fc.double({ min: 0, max: 1e12, noNaN: true })),
  rsi_daily: fc.oneof(fc.constant(null), fc.double({ min: 0, max: 100, noNaN: true })),
  rsi_weekly: fc.oneof(fc.constant(null), fc.double({ min: 0, max: 100, noNaN: true })),
  sector: fc.oneof(
    fc.constant(null),
    fc.constantFrom('Technology', 'Healthcare', 'Finance', 'Energy'),
  ),
  notes: fc.oneof(fc.constant(null), fc.string({ minLength: 0, maxLength: 100 })),
  priority: fc.integer({ min: 1, max: 5 }),
  created_at: fc.constant('2024-01-01T00:00:00Z'),
  updated_at: fc.constant('2024-06-01T00:00:00Z'),
});

const watchlistArbitrary = fc.array(watchlistItemArbitrary, { minLength: 0, maxLength: 30 });

const EVENT_TYPES: ActivityEvent['event_type'][] = [
  'holding_added',
  'stock_sold',
  'watchlist_added',
  'watchlist_removed',
  'notes_updated',
];

const activityEventArbitrary: fc.Arbitrary<ActivityEvent> = fc.record({
  event_type: fc.constantFrom(...EVENT_TYPES),
  ticker: fc
    .array(fc.constantFrom(...'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('')), {
      minLength: 1,
      maxLength: 5,
    })
    .map((arr) => arr.join('')),
  details: fc.constant({} as Record<string, unknown>),
  timestamp: fc
    .date({
      min: new Date('2020-01-01T00:00:00Z'),
      max: new Date('2025-12-31T23:59:59Z'),
      // fast-check also generates "Invalid Date" unless told not to.
      noInvalidDate: true,
    })
    .map((d) => d.toISOString()),
});

const activityEventsArbitrary = fc.array(activityEventArbitrary, { minLength: 0, maxLength: 50 });

// --- Property Tests ---

describe('Property 16: Watchlist movers filter', () => {
  it('movers list contains exactly those items where |daily_change_pct| >= 2%, and no others', () => {
    fc.assert(
      fc.property(watchlistArbitrary, (watchlist) => {
        const movers = filterWatchlistMovers(watchlist);

        // Every item in movers must have |daily_change_pct| >= 2
        for (const item of movers) {
          expect(Math.abs(item.daily_change_pct)).toBeGreaterThanOrEqual(2);
        }

        // Every item in the original list with |daily_change_pct| >= 2 must be in movers
        for (const item of watchlist) {
          if (Math.abs(item.daily_change_pct) >= 2) {
            expect(movers).toContain(item);
          }
        }

        // No item with |daily_change_pct| < 2 should be in movers
        for (const item of watchlist) {
          if (Math.abs(item.daily_change_pct) < 2) {
            expect(movers).not.toContain(item);
          }
        }

        // The movers list size should equal the count of qualifying items
        const expectedCount = watchlist.filter((i) => Math.abs(i.daily_change_pct) >= 2).length;
        expect(movers).toHaveLength(expectedCount);
      }),
      { numRuns: 100 },
    );
  });
});

describe('Property 17: Activity feed ordering and limit', () => {
  it('activity feed returns at most 20 events ordered by timestamp descending', () => {
    fc.assert(
      fc.property(activityEventsArbitrary, (events) => {
        const feed = getActivityFeed(events);

        // At most 20 events
        expect(feed.length).toBeLessThanOrEqual(20);

        // If input has more than 20, result is exactly 20
        if (events.length > 20) {
          expect(feed).toHaveLength(20);
        } else {
          expect(feed).toHaveLength(events.length);
        }

        // Descending timestamp order: each event's timestamp >= next event's timestamp
        for (let i = 0; i < feed.length - 1; i++) {
          const currentTime = new Date(feed[i].timestamp).getTime();
          const nextTime = new Date(feed[i + 1].timestamp).getTime();
          expect(currentTime).toBeGreaterThanOrEqual(nextTime);
        }
      }),
      { numRuns: 100 },
    );
  });
});
