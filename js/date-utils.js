/**
 * Calendar date math. Plain arithmetic and the native Date constructor, no
 * libraries.
 *
 * Every Date built here is a local-midnight date, which keeps day-of-week
 * lookups honest and sidesteps the UTC-parsing trap that shifts dates by a day
 * for anyone west of Greenwich.
 */

/** A new date the given number of days after `date`, leaving `date` untouched. */
export function addDays(date, days) {
  const shifted = new Date(date);
  shifted.setDate(shifted.getDate() + days);
  return shifted;
}

/** Days in a month, with the leap-year rule applied to February. */
export function getDaysInMonth(year, monthIndex) {
  return new Date(year, monthIndex + 1, 0).getDate();
}

export function isLeapYear(year) {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

/**
 * Advances a year/month pair by a whole number of months, rolling the year over
 * in either direction.
 */
export function addMonths(year, monthIndex, offset) {
  const absoluteMonth = year * 12 + monthIndex + offset;

  return {
    year: Math.floor(absoluteMonth / 12),
    monthIndex: ((absoluteMonth % 12) + 12) % 12,
  };
}

/**
 * How many blank cells precede the 1st of the month, given which weekday the
 * week starts on. `weekStart` is 0 for Sunday, 1 for Monday.
 */
export function getLeadingBlankCount(year, monthIndex, weekStart) {
  const firstWeekday = new Date(year, monthIndex, 1).getDay();
  return (firstWeekday - weekStart + 7) % 7;
}

/** Weekday header labels rotated so the configured start day comes first. */
export function orderWeekdays(weekdayNames, weekStart) {
  return Array.from({ length: 7 }, (_unused, column) => weekdayNames[(column + weekStart) % 7]);
}

/**
 * True when the weekday sitting in a given column is Saturday or Sunday.
 * Used for weekend shading, which is a column property rather than a per-date
 * one, so the shading runs the full height of the grid.
 */
export function isWeekendColumn(column, weekStart) {
  const weekday = (column + weekStart) % 7;
  return weekday === 0 || weekday === 6;
}

export function toDateKey(date) {
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}

/**
 * Builds the cell list for one month.
 *
 * The result is always a whole number of weeks. Leading and trailing cells are
 * filled with the neighboring months' dates and flagged `inMonth: false`, so
 * the renderer can either print them grayed out or leave the cell blank without
 * the grid shape changing either way.
 */
export function buildMonthGrid(year, monthIndex, weekStart) {
  const daysInMonth = getDaysInMonth(year, monthIndex);
  const leadingBlanks = getLeadingBlankCount(year, monthIndex, weekStart);
  const weekCount = Math.ceil((leadingBlanks + daysInMonth) / 7);
  const cells = [];

  for (let cellIndex = 0; cellIndex < weekCount * 7; cellIndex += 1) {
    const dayOffset = cellIndex - leadingBlanks;
    const date = new Date(year, monthIndex, 1 + dayOffset);

    cells.push({
      date,
      dateKey: toDateKey(date),
      dayOfMonth: date.getDate(),
      column: cellIndex % 7,
      inMonth: dayOffset >= 0 && dayOffset < daysInMonth,
      isWeekend: isWeekendColumn(cellIndex % 7, weekStart),
    });
  }

  return { year, monthIndex, weekCount, daysInMonth, leadingBlanks, cells };
}

/**
 * The full ordered run of months the user asked for, starting at
 * `startYear`/`startMonth` (1-12) and continuing for `monthCount` months.
 */
export function buildMonthSequence(startYear, startMonth, monthCount, weekStart) {
  return Array.from({ length: monthCount }, (_unused, offset) => {
    const { year, monthIndex } = addMonths(startYear, startMonth - 1, offset);
    return buildMonthGrid(year, monthIndex, weekStart);
  });
}

/** Splits the month sequence into pages of `monthsPerPage`. */
export function paginateMonths(months, monthsPerPage) {
  const pages = [];

  for (let index = 0; index < months.length; index += monthsPerPage) {
    pages.push(months.slice(index, index + monthsPerPage));
  }

  return pages;
}
