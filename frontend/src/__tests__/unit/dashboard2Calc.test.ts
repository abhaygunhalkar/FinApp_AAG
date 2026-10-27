import { describe, expect, it } from 'vitest';
import {
  concentrationNote,
  growthAxis,
  optionsYtd,
  sectorShares,
  withBenchmark,
} from '../../components/dashboard2/calc';
import type { Holding, PricePoint } from '../../types';

const Y = new Date().getFullYear();
const close = (date: string, c: number) => ({ date, close: c }) as PricePoint;

describe('withBenchmark', () => {
  it('rebases the benchmark to the portfolio start and carries closes over gaps', () => {
    const rows = withBenchmark(
      [
        { date: '2026-10-01', total_value: 1000 },
        { date: '2026-10-02', total_value: 1100 },
        { date: '2026-10-03', total_value: 1050 }, // no benchmark close this day
      ],
      [close('2026-10-02', 220), close('2026-10-01', 200)],
    );
    expect(rows.map((r) => r.bench)).toEqual([1000, 1100, 1100]);
  });

  it('leaves the benchmark empty before its first close', () => {
    const rows = withBenchmark(
      [
        { date: '2026-10-01', total_value: 500 },
        { date: '2026-10-02', total_value: 510 },
      ],
      [close('2026-10-02', 50)],
    );
    expect(rows[0].bench).toBeUndefined();
    expect(rows[1].bench).toBe(500);
  });
});

describe('growthAxis', () => {
  it('hugs the data with round ticks instead of starting at zero', () => {
    const { domain, ticks } = growthAxis([
      { date: 'a', value: 119_800 },
      { date: 'b', value: 123_400, bench: 123_900 },
    ]);
    expect(domain[0]).toBeGreaterThan(100_000);
    expect(domain[0]).toBeLessThanOrEqual(119_800);
    expect(domain[1]).toBeGreaterThanOrEqual(123_900);
    expect(ticks[0]).toBe(domain[0]);
    const steps = ticks.slice(1).map((t, i) => t - ticks[i]);
    expect(new Set(steps).size).toBe(1);
  });
});

describe('optionsYtd', () => {
  it('counts premiums opened this year and P&L that closed this year', () => {
    const ytd = optionsYtd(
      [
        { trade_type: 'sell_put', premium: 2, contracts: 3, open_date: `${Y}-03-01` },
        { trade_type: 'buy_call', premium: 1.5, contracts: 2, open_date: `${Y}-04-01` },
        { trade_type: 'sell_call', premium: 9, contracts: 9, open_date: `${Y - 1}-12-01` },
      ],
      [
        { transaction_date: `${Y}-05-01`, realized_gain: 250 },
        { transaction_date: `${Y - 1}-11-01`, realized_gain: 999 },
      ],
    );
    expect(ytd).toEqual({ collected: 600, paid: 300, net: 300, realized: 250, trades: 2 });
  });
});

describe('sector shares', () => {
  const h = (sector: string | null, value: number) => ({ sector, current_value: value }) as Holding;

  it('sorts sectors by share and flags one above 30%', () => {
    const shares = sectorShares([h('Technology', 60), h('Energy', 20), h(null, 20)]);
    expect(shares.map((s) => s.name)).toEqual(['Technology', 'Energy', 'Unknown']);
    expect(concentrationNote(shares)).toBe('Technology is 60%, 3.0× the next sector');
  });

  it('flags only a sector above 30%', () => {
    expect(concentrationNote(sectorShares([h('A', 30), h('B', 30), h('C', 40)]))).toBe(
      'C is 40%, 1.3× the next sector',
    );
    expect(concentrationNote(sectorShares([h('A', 25), h('B', 25), h('C', 25), h('D', 25)]))).toBe(
      null,
    );
  });
});
