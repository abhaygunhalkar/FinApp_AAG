export function parseLocalDateString(dateStr: string): Date {
  const dateOnlyMatch = /^([0-9]{4})-([0-9]{2})-([0-9]{2})$/;
  const isoDateMatch = /^([0-9]{4})-([0-9]{2})-([0-9]{2})T/;

  let year: number;
  let month: number;
  let day: number;

  const dateOnly = dateStr.match(dateOnlyMatch);
  const isoDate = dateStr.match(isoDateMatch);

  if (dateOnly) {
    year = Number(dateOnly[1]);
    month = Number(dateOnly[2]) - 1;
    day = Number(dateOnly[3]);
    return new Date(year, month, day, 12, 0, 0);
  }

  if (isoDate) {
    year = Number(isoDate[1]);
    month = Number(isoDate[2]) - 1;
    day = Number(isoDate[3]);
    return new Date(year, month, day, 12, 0, 0);
  }

  return new Date(dateStr);
}

// --- Display formats -------------------------------------------------------
//
// Every date shown in the app goes through these, in one style: US English
// with a short month name ("Nov 13, 2026"). Strings may be dates
// ("2026-11-13") or timestamps; the date-only formats use just the date part,
// so a backend timestamp never shifts a day.

type DateInput = string | Date;

const dateOf = (v: DateInput): Date => (typeof v === 'string' ? parseLocalDateString(v) : v);
const instantOf = (v: DateInput): Date => (typeof v === 'string' ? new Date(v) : v);
const style = (options: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat('en-US', options);

const FULL = style({ month: 'short', day: 'numeric', year: 'numeric' });
const DAY_MONTH = style({ month: 'short', day: 'numeric' });
const MONTH_YEAR = style({ month: 'short', year: 'numeric' });
const MONTH_SHORT_YEAR = style({ month: 'short', year: '2-digit' });
const WEEKDAY = style({ weekday: 'short', month: 'short', day: 'numeric' });
const MONTH = style({ month: 'short' });
const DAY = style({ day: 'numeric' });
const DATE_TIME = style({
  month: 'short',
  day: 'numeric',
  year: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
});
const DAY_MONTH_TIME = style({
  month: 'short',
  day: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
});

/** "Nov 13, 2026" */
export const fmtDate = (v: DateInput): string => FULL.format(dateOf(v));
/** "Nov 13" */
export const fmtDayMonth = (v: DateInput): string => DAY_MONTH.format(dateOf(v));
/** "Nov 2026" */
export const fmtMonthYear = (v: DateInput): string => MONTH_YEAR.format(dateOf(v));
/** "Nov 26": for a year-long chart axis */
export const fmtMonthShortYear = (v: DateInput): string => MONTH_SHORT_YEAR.format(dateOf(v));
/** "Thu, Nov 13" */
export const fmtWeekdayDate = (v: DateInput): string => WEEKDAY.format(dateOf(v));
/** "Nov": the month alone, for calendar badges */
export const fmtMonthName = (v: DateInput): string => MONTH.format(dateOf(v));
/** "13": the day of the month alone, for calendar badges */
export const fmtDayOfMonth = (v: DateInput): string => DAY.format(dateOf(v));
/** "Nov 13, 2026, 9:30 AM", in the viewer's time zone */
export const fmtDateTime = (v: DateInput): string => DATE_TIME.format(instantOf(v));
/** "Nov 13, 9:30 AM", in the viewer's time zone */
export const fmtDayMonthTime = (v: DateInput): string => DAY_MONTH_TIME.format(instantOf(v));
