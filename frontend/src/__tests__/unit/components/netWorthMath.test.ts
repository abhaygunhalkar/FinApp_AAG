import { describe, expect, it } from 'vitest';
import {
  ASSET_CATEGORIES,
  ASSET_PALETTE,
  breakdown,
  buildSeries,
  changeOver,
  historySpanDays,
} from '../../../components/networth';
import type { FinancialAccount, NetWorthSnapshot } from '../../../types';

const today = new Date(2026, 9, 20); // Oct 20, 2026

function snap(date: string, net_worth: number): NetWorthSnapshot {
  return { id: 0, date, total_assets: 0, total_liabilities: 0, net_worth, created_at: '' };
}

function acct(account_type: FinancialAccount['account_type'], balance: number): FinancialAccount {
  return {
    id: Math.random(),
    name: account_type,
    institution: null,
    account_type,
    balance,
    is_asset: true,
    is_linked: false,
    last_synced: null,
    notes: null,
    created_at: '',
    updated_at: '',
  };
}

describe('buildSeries', () => {
  const snapshots = [
    snap('2026-01-01', 10_000),
    snap('2026-10-01', 40_000),
    snap('2026-10-19', 50_000),
    snap('2026-10-20', 1), // stale value for today
  ];

  it('ends at the live net worth instead of today’s stored snapshot', () => {
    const series = buildSeries(snapshots, 51_510, '1M', today);
    expect(series.at(-1)).toEqual({ date: '2026-10-20', value: 51_510 });
    expect(series.filter((p) => p.date === '2026-10-20')).toHaveLength(1);
  });

  it('keeps only points inside the range', () => {
    expect(buildSeries(snapshots, 51_510, '1M', today).map((p) => p.date)).toEqual([
      '2026-10-01',
      '2026-10-19',
      '2026-10-20',
    ]);
    expect(buildSeries(snapshots, 51_510, 'ALL', today)).toHaveLength(4);
  });
});

describe('changeOver', () => {
  it('measures from the first point in range, not from zero', () => {
    const series = [
      { date: '2026-10-01', value: 40_000 },
      { date: '2026-10-20', value: 51_510 },
    ];
    const change = changeOver(series, 51_510);
    expect(change?.amount).toBe(11_510);
    expect(change?.pct).toBeCloseTo(28.775);
  });

  it('returns null without a baseline', () => {
    expect(changeOver([{ date: '2026-10-20', value: 5 }], 5)).toBeNull();
  });

  it('leaves percent undefined when the baseline is zero', () => {
    const series = [
      { date: '2026-10-01', value: 0 },
      { date: '2026-10-20', value: 100 },
    ];
    expect(changeOver(series, 100)?.pct).toBeNull();
  });
});

describe('historySpanDays', () => {
  it('counts days from the first snapshot to today', () => {
    expect(historySpanDays([], today)).toBe(0);
    expect(historySpanDays([snap('2026-10-15', 1)], today)).toBe(5);
    expect(historySpanDays([snap('2026-10-13', 1)], today)).toBe(7);
  });
});

describe('breakdown', () => {
  it('groups by category, sorts by size and colours by rank', () => {
    const segments = breakdown(
      [acct('checking', 1_000), acct('savings', 1_000), acct('investment', 6_000)],
      ASSET_CATEGORIES,
      ASSET_PALETTE,
    );
    expect(segments.map((s) => [s.label, s.pct, s.color])).toEqual([
      ['Investments', 75, ASSET_PALETTE[0]],
      ['Cash', 25, ASSET_PALETTE[1]],
    ]);
  });
});
