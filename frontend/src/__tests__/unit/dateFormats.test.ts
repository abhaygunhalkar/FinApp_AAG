import { describe, expect, it } from 'vitest';
import {
  fmtDate,
  fmtDateTime,
  fmtDayMonth,
  fmtDayMonthTime,
  fmtDayOfMonth,
  fmtMonthName,
  fmtMonthShortYear,
  fmtMonthYear,
  fmtWeekdayDate,
} from '../../utils/date';

describe('date display formats', () => {
  it('formats a date in the one app style', () => {
    expect(fmtDate('2026-11-13')).toBe('Nov 13, 2026');
    expect(fmtDayMonth('2026-11-13')).toBe('Nov 13');
    expect(fmtMonthYear('2026-11-13')).toBe('Nov 2026');
    expect(fmtMonthShortYear('2026-11-13')).toBe('Nov 26');
    expect(fmtWeekdayDate('2026-11-13')).toBe('Fri, Nov 13');
    expect(fmtMonthName('2026-11-13')).toBe('Nov');
    expect(fmtDayOfMonth('2026-11-03')).toBe('3');
  });

  it("uses only a timestamp's date part for date-only formats", () => {
    // Late in the day UTC must not become the next day anywhere.
    expect(fmtDate('2026-11-13T23:59:00')).toBe('Nov 13, 2026');
    expect(fmtDate('2026-01-01')).toBe('Jan 1, 2026');
  });

  it('accepts Date objects', () => {
    expect(fmtDate(new Date(2026, 0, 31))).toBe('Jan 31, 2026');
  });

  it('shows times in the viewer’s time zone', () => {
    const local = new Date(2026, 10, 13, 9, 30);
    expect(fmtDateTime(local)).toBe('Nov 13, 2026, 9:30 AM');
    expect(fmtDayMonthTime(local)).toBe('Nov 13, 9:30 AM');
  });
});
