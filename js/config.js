/**
 * Every knob the calendar exposes, plus the physical constants the print layout
 * is computed from.
 *
 * All internal measurement is in millimeters. Paper sizes are defined once, in
 * exact millimeters, and every derived dimension stays in that unit so no part
 * of the layout math ever mixes `in` with `mm` inside a calc(). Inches are only
 * reintroduced for display labels.
 */

export const MM_PER_INCH = 25.4;

export function inchesToMillimetres(inches) {
  return inches * MM_PER_INCH;
}

/**
 * Trimmed off the printable height of every page.
 *
 * A page sized to exactly the printable area is a coin flip in Chrome: any
 * sub-pixel rounding in the layout tips it over the page box and emits a blank
 * trailing page. Four tenths of a millimeter is invisible on paper and removes
 * the ambiguity entirely.
 */
export const PAGE_HEIGHT_SAFETY_MM = 0.4;

/**
 * Paper dimensions are stored portrait-first (short edge x long edge).
 * `applyOrientation` swaps them when the user asks for landscape.
 */
export const PAPER_SIZES = {
  letter: {
    label: 'Letter',
    note: '8.5 x 11 in',
    widthMm: inchesToMillimetres(8.5),
    heightMm: inchesToMillimetres(11),
    marginMm: inchesToMillimetres(0.35),
  },
  tabloid: {
    label: '11x17',
    note: '11 x 17 in',
    widthMm: inchesToMillimetres(11),
    heightMm: inchesToMillimetres(17),
    marginMm: inchesToMillimetres(0.5),
  },
  legal: {
    label: 'Legal',
    note: '8.5 x 14 in',
    widthMm: inchesToMillimetres(8.5),
    heightMm: inchesToMillimetres(14),
    marginMm: inchesToMillimetres(0.35),
  },
  poster: {
    label: 'Poster',
    note: '18 x 24 in',
    widthMm: inchesToMillimetres(18),
    heightMm: inchesToMillimetres(24),
    marginMm: inchesToMillimetres(0.75),
  },
  'movie-poster': {
    label: 'Movie Poster',
    note: '27 x 40 in',
    widthMm: inchesToMillimetres(27),
    heightMm: inchesToMillimetres(40),
    marginMm: inchesToMillimetres(1),
  },
  a4: {
    label: 'A4',
    note: '210 x 297 mm',
    widthMm: 210,
    heightMm: 297,
    marginMm: 9,
  },
};

/**
 * `monthsPerPage` drives the entire layout engine. `arrangement` is the grid of
 * month blocks on a single sheet, chosen per orientation so the blocks keep a
 * roughly page-shaped aspect instead of turning into letterbox slivers.
 */
export const CALENDAR_TYPES = {
  monthly: {
    label: 'Monthly',
    note: 'One month per page',
    monthsPerPage: 1,
    arrangement: { landscape: { columns: 1, rows: 1 }, portrait: { columns: 1, rows: 1 } },
  },
  yearly: {
    label: 'Yearly',
    note: 'Twelve months on one page',
    monthsPerPage: 12,
    arrangement: { landscape: { columns: 4, rows: 3 }, portrait: { columns: 3, rows: 4 } },
  },
  'two-month': {
    label: 'Two Month',
    note: 'Two months per page',
    monthsPerPage: 2,
    arrangement: { landscape: { columns: 2, rows: 1 }, portrait: { columns: 1, rows: 2 } },
  },
  'four-month': {
    label: 'Four Month',
    note: 'Four months per page',
    monthsPerPage: 4,
    arrangement: { landscape: { columns: 2, rows: 2 }, portrait: { columns: 2, rows: 2 } },
  },
  'six-month': {
    label: 'Six Months',
    note: 'Six months per page',
    monthsPerPage: 6,
    arrangement: { landscape: { columns: 3, rows: 2 }, portrait: { columns: 2, rows: 3 } },
  },
};

export const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

export const WEEKDAY_NAMES_LONG = [
  'Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday',
];

export const WEEKDAY_NAMES_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export const WEEKDAY_NAMES_MINIMAL = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

export const GRID_COLORS = {
  gray: { label: 'Gray', value: '#c9c9c9' },
  black: { label: 'Black', value: '#000000' },
};

export const HOLIDAY_MODES = {
  none: { label: 'No', note: 'No holidays printed' },
  federal: { label: 'US Federal', note: 'The 11 federal holidays' },
  all: { label: 'US All', note: 'Federal, common observances and Easter dates' },
};

export const DAY_SIZES = {
  big: { label: 'Big', dateScale: 1.9, labelScale: 1.25 },
  small: { label: 'Small', dateScale: 1, labelScale: 1 },
};

/**
 * Defaults mirror the task brief: August 2026 through July 2027, Monday-start,
 * landscape Letter, hairline gray grid, nothing shaded, no holidays.
 */
export const DEFAULT_OPTIONS = {
  calendarType: 'monthly',
  startYear: 2026,
  startMonth: 8,
  monthCount: 12,
  weekStart: 1,
  orientation: 'landscape',
  paperSize: 'letter',
  daySize: 'small',
  gridLines: true,
  gridColor: '#c9c9c9',
  shadeWeekends: false,
  includeNotes: false,
  showAdjacentDays: false,
  holidays: 'none',
};

/**
 * Returns the page box for a paper size, with width and height swapped when the
 * orientation is landscape.
 */
export function applyOrientation(paperSizeKey, orientation) {
  const paper = PAPER_SIZES[paperSizeKey] ?? PAPER_SIZES.letter;
  const isLandscape = orientation === 'landscape';

  return {
    ...paper,
    widthMm: isLandscape ? paper.heightMm : paper.widthMm,
    heightMm: isLandscape ? paper.widthMm : paper.heightMm,
  };
}
