/**
 * Thin adapter over the vendored holidate package.
 *
 * holidate returns a flat, chronologically sorted list per calendar year. The
 * calendar renders month by month and needs O(1) lookups, so results are folded
 * into a Map keyed by local date, cached per year+mode, and merged when a run of
 * months straddles a year boundary.
 *
 * Scope note: holidate ships US holidays only, so the Holidays control is
 * US-only by definition. If upstream adds countries, `countryMap` in
 * vendor/holidate/holidate.js is where they surface.
 */

import { getHolidays } from '../vendor/holidate/holidate.js';
import { addDays, toDateKey } from './date-utils.js';

const holidaysByYearAndMode = new Map();

/** holidate's English name for the day every movable feast is measured from. */
const EASTER_HOLIDAY_NAME = 'Easter';

/**
 * Days before Easter for each movable feast holidate derives from it: Easter
 * itself, Good Friday, Palm Sunday, Ash Wednesday and Mardi Gras. Taken from
 * `easterHolidayRules` in the pinned vendor source.
 */
const EASTER_OFFSETS_IN_DAYS = [0, 2, 7, 46, 47];

/**
 * Easter, by the anonymous Gregorian algorithm (Meeus/Jones/Butcher).
 *
 * holidate computes Easter from a fixed golden-number lookup table, which has
 * no century or epact correction baked in and so is only right for roughly
 * 1900 to 2199. The year field here accepts a far wider range than that, and a
 * calendar that prints Easter on the wrong Sunday is worse than one that does
 * not print it at all. This algorithm is valid for every Gregorian year.
 */
export function computeGregorianEaster(year) {
  const metonicCycleYear = year % 19;
  const century = Math.floor(year / 100);
  const yearInCentury = year % 100;

  const centuryLeapDays = Math.floor(century / 4);
  const centuryRemainder = century % 4;
  const lunarCorrection = Math.floor((century + 8) / 25);
  const solarCorrection = Math.floor((century - lunarCorrection + 1) / 3);

  const epact = (19 * metonicCycleYear + century - centuryLeapDays - solarCorrection + 15) % 30;

  const yearLeapDays = Math.floor(yearInCentury / 4);
  const yearRemainder = yearInCentury % 4;

  const weekdayOffset =
    (32 + 2 * centuryRemainder + 2 * yearLeapDays - epact - yearRemainder) % 7;
  const monthAdjustment = Math.floor((metonicCycleYear + 11 * epact + 22 * weekdayOffset) / 451);

  const dayOfYearMarker = epact + weekdayOffset - 7 * monthAdjustment + 114;
  const monthNumber = Math.floor(dayOfYearMarker / 31);
  const dayOfMonth = (dayOfYearMarker % 31) + 1;

  return new Date(year, monthNumber - 1, dayOfMonth);
}

/**
 * Moves holidate's Easter-derived holidays onto the correct dates.
 *
 * Every one of them is a fixed number of days before holidate's own Easter, so
 * when that Easter is off, all five are off by exactly the same amount and a
 * single shift fixes the set. Anything not sitting on one of those offsets is
 * left alone.
 */
function correctEasterHolidays(holidays, year) {
  const anchor = holidays.find((holiday) => holiday.name === EASTER_HOLIDAY_NAME);

  if (!anchor) {
    return holidays;
  }

  const shiftInDays = Math.round(
    (computeGregorianEaster(year) - anchor.date) / (24 * 60 * 60 * 1000),
  );

  if (shiftInDays === 0) {
    return holidays;
  }

  const easterDerivedKeys = new Set(
    EASTER_OFFSETS_IN_DAYS.map((offset) => toDateKey(addDays(anchor.date, -offset))),
  );

  return holidays.map((holiday) => {
    if (!easterDerivedKeys.has(toDateKey(holiday.date))) {
      return holiday;
    }

    return { ...holiday, date: addDays(holiday.date, shiftInDays) };
  });
}

/**
 * `natural: false` marks holidate's synthetic "(observed)" entries, generated
 * when a fixed-date federal holiday lands on a weekend. They are real days off,
 * so they are kept.
 */
function matchesMode(holiday, mode) {
  if (mode === 'all') {
    return true;
  }

  return holiday.tags.includes('federal');
}

/**
 * Decides which name a cell shows when several holidays share a date.
 *
 * A federal holiday outranks an observance, and a real date outranks an
 * observed one. Without this, June 19 in a year where Juneteenth falls on
 * Father's Day would print as Father's Day and drop the federal holiday.
 */
function precedenceRank(holiday) {
  if (!holiday.natural) {
    return 2;
  }

  return holiday.tags.includes('federal') ? 0 : 1;
}

function buildLookup(year, mode) {
  const lookup = new Map();
  const holidays = correctEasterHolidays(getHolidays(year), year);

  for (const holiday of holidays) {
    if (!matchesMode(holiday, mode)) {
      continue;
    }

    const key = toDateKey(holiday.date);
    const existing = lookup.get(key) ?? [];

    existing.push(holiday);
    lookup.set(key, existing);
  }

  for (const sharedDate of lookup.values()) {
    // Stable sort, so holidate's own chronological order breaks ties.
    sharedDate.sort((first, second) => precedenceRank(first) - precedenceRank(second));
  }

  return lookup;
}

function getYearLookup(year, mode) {
  const cacheKey = `${year}:${mode}`;

  if (!holidaysByYearAndMode.has(cacheKey)) {
    holidaysByYearAndMode.set(cacheKey, buildLookup(year, mode));
  }

  return holidaysByYearAndMode.get(cacheKey);
}

/**
 * Returns a single date-keyed Map covering every year the given months touch.
 * Returns an empty Map when holidays are switched off, so callers can look up
 * unconditionally.
 */
export function buildHolidayLookup(months, mode) {
  if (mode === 'none') {
    return new Map();
  }

  const years = new Set();

  for (const month of months) {
    // Adjacent-month cells can spill into the neighboring year.
    for (const cell of month.cells) {
      years.add(cell.date.getFullYear());
    }
  }

  const merged = new Map();

  for (const year of years) {
    for (const [dateKey, holidays] of getYearLookup(year, mode)) {
      merged.set(dateKey, holidays);
    }
  }

  return merged;
}

/**
 * A handful of federal holidays have names long enough to swamp a day cell,
 * which is the whole point of the cell being blank writing space. These are the
 * conventional short forms, applied for display only; the full name still
 * reaches assistive technology and the tooltip in dense layouts.
 */
const SHORT_DISPLAY_NAMES = new Map([
  ['Juneteenth National Independence Day', 'Juneteenth'],
  ['Martin Luther King Jr. Day', 'MLK Jr. Day'],
]);

function toDisplayName(name) {
  const compactedSuffix = name.replace(' (observed)', ' (obs.)');
  const withoutSuffix = compactedSuffix.replace(' (obs.)', '');
  const shortened = SHORT_DISPLAY_NAMES.get(withoutSuffix);

  if (!shortened) {
    return compactedSuffix;
  }

  return compactedSuffix.endsWith(' (obs.)') ? `${shortened} (obs.)` : shortened;
}

/** The name shown in a day cell when several holidays share a date. */
export function getPrimaryHolidayName(holidays) {
  const name = holidays?.[0]?.name;
  return name ? toDisplayName(name) : '';
}

/** Every name on a date, spelled out in full, for assistive technology. */
export function getFullHolidayNames(holidays) {
  return (holidays ?? []).map((holiday) => holiday.name).join(', ');
}
