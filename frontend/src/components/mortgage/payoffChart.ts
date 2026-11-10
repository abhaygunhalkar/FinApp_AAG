import { addMonths, type Comparison, type YearMonth } from './simulatePayoff';

/** Liabilities orange for the loan as it is; the palette's accent for the scenario. */
export const BASELINE_COLOR = '#C2410C';
export const SCENARIO_COLOR = 'var(--color-accent-500)';

export interface ChartRow {
  month: YearMonth;
  baseline: number | null;
  scenario: number | null;
}

/** Remaining balance month by month; each line stops the month its loan is paid off. */
export function chartRows(c: Comparison, startBalance: number): ChartRow[] {
  const base = c.baseline.schedule;
  const next = c.scenario.schedule;
  const first = base[0]?.month ?? next[0]?.month;
  if (!first) return [];
  const rows: ChartRow[] = [
    { month: addMonths(first, -1), baseline: startBalance, scenario: startBalance },
  ];
  const length = Math.max(base.length, next.length);
  for (let i = 0; i < length; i++) {
    rows.push({
      month: base[i]?.month ?? next[i].month,
      baseline: base[i]?.balance ?? null,
      scenario: next[i]?.balance ?? null,
    });
  }
  return rows;
}

/** January ticks, spaced so there are at most about six. */
export function yearTicks(rows: ChartRow[]): YearMonth[] {
  const januaries = rows.map((r) => r.month).filter((m) => m.endsWith('-01'));
  const step = Math.max(1, Math.ceil(januaries.length / 6));
  return januaries.filter((_, i) => i % step === 0);
}
