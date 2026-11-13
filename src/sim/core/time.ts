/**
 * Pure calendar math for the game clock.
 *
 * The simulation never uses `Date`: time is an integer count of weeks since
 * Jan 1 of the start year. That keeps ticks deterministic across machines.
 */

export interface GameDate {
  year: number;
  month: number;
  day: number;
}

const DAYS_PER_WEEK = 7;

const MONTH_NAMES = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
] as const;

/** Days between 0000-03-01 and 1970-01-01 in the civil calendar. */
const CIVIL_EPOCH_OFFSET = 719468;

export function daysFromCivil(date: GameDate): number {
  const shiftedYear = date.month <= 2 ? date.year - 1 : date.year;
  const era = Math.floor(shiftedYear / 400);
  const yearOfEra = shiftedYear - era * 400;
  const shiftedMonth = date.month > 2 ? date.month - 3 : date.month + 9;
  const dayOfYear = Math.floor((153 * shiftedMonth + 2) / 5) + date.day - 1;
  const dayOfEra =
    yearOfEra * 365 + Math.floor(yearOfEra / 4) - Math.floor(yearOfEra / 100) + dayOfYear;
  return era * 146097 + dayOfEra - CIVIL_EPOCH_OFFSET;
}

export function civilFromDays(daysSinceEpoch: number): GameDate {
  if (!Number.isInteger(daysSinceEpoch)) {
    throw new Error(`daysSinceEpoch must be an integer, received ${String(daysSinceEpoch)}`);
  }
  const shifted = daysSinceEpoch + CIVIL_EPOCH_OFFSET;
  const era = Math.floor(shifted / 146097);
  const dayOfEra = shifted - era * 146097;
  const yearOfEra = Math.floor(
    (dayOfEra - Math.floor(dayOfEra / 1460) + Math.floor(dayOfEra / 36524) - Math.floor(dayOfEra / 146096)) /
      365,
  );
  const year = yearOfEra + era * 400;
  const dayOfYear = dayOfEra - (365 * yearOfEra + Math.floor(yearOfEra / 4) - Math.floor(yearOfEra / 100));
  const shiftedMonth = Math.floor((5 * dayOfYear + 2) / 153);
  const day = dayOfYear - Math.floor((153 * shiftedMonth + 2) / 5) + 1;
  const month = shiftedMonth < 10 ? shiftedMonth + 3 : shiftedMonth - 9;
  return { year: month <= 2 ? year + 1 : year, month, day };
}

/**
 * Date at the start of an elapsed week. Week 0 is Jan 1 of `startYear`.
 */
export function dateFromWeek(startYear: number, week: number): GameDate {
  if (!Number.isInteger(startYear)) {
    throw new Error(`startYear must be an integer, received ${String(startYear)}`);
  }
  if (!Number.isInteger(week) || week < 0) {
    throw new Error(`week must be a non-negative integer, received ${String(week)}`);
  }
  const startDay = daysFromCivil({ year: startYear, month: 1, day: 1 });
  return civilFromDays(startDay + week * DAYS_PER_WEEK);
}

export function formatGameDate(date: GameDate): string {
  const monthName = MONTH_NAMES[date.month - 1];
  if (monthName === undefined) {
    throw new Error(`Invalid month ${String(date.month)}`);
  }
  return `${monthName} ${date.day}, ${date.year}`;
}
