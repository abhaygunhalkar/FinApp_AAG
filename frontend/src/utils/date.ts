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
    return new Date(year, month, day);
  }

  if (isoDate) {
    year = Number(isoDate[1]);
    month = Number(isoDate[2]) - 1;
    day = Number(isoDate[3]);
    return new Date(year, month, day);
  }

  return new Date(dateStr);
}
