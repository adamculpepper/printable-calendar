/**
 * Print verification.
 *
 * Claims about print output are worthless unless something actually prints, so
 * this drives real Chrome over the DevTools protocol, asks it for a PDF the
 * same way "Save as PDF" does (`preferCSSPageSize`, which honors the @page
 * rule), and then checks the bytes that come back:
 *
 *   - the PDF has exactly the expected number of pages, with no blank trailer
 *   - every sheet measures the paper size that was asked for
 *   - inside the page, nothing overflows and the grid reaches the bottom margin
 *   - grid lines are drawn with borders, so they survive with background
 *     graphics disabled
 *   - the file the Download button produces prints the same way on its own
 *
 * Date and holiday arithmetic is checked separately and directly, since those
 * modules are plain ESM and import straight into node.
 *
 *   npm run verify         # the standard matrix
 *   npm run verify:full    # every calendar type x orientation x paper size
 */

import { writeFileSync, mkdirSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';

import { PDFDocument } from 'pdf-lib';

import { withBrowser } from './lib/browser.mjs';
import {
  addMonths,
  buildMonthGrid,
  buildMonthSequence,
  getDaysInMonth,
  toDateKey,
} from '../js/date-utils.js';
import {
  buildHolidayLookup,
  computeGregorianEaster,
  getPrimaryHolidayName,
} from '../js/holidays.js';
import { DEFAULT_OPTIONS, PAPER_SIZES } from '../js/config.js';
import { computeLayout } from '../js/layout.js';
import { readOptionsFromUrl } from '../js/controls.js';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const runFullMatrix = process.argv.includes('--full');

const POINTS_PER_INCH = 72;
const MM_PER_INCH = 25.4;
const PAGE_SIZE_TOLERANCE_POINTS = 1.5;

const failures = [];
const passes = [];

function check(description, condition, detail = '') {
  if (condition) {
    passes.push(description);
  } else {
    failures.push(`${description}${detail ? ` -- ${detail}` : ''}`);
  }
}

/* -- Measurement --------------------------------------------------------- */

/**
 * Measures the rendered document from inside the page.
 *
 * The important assertion is `bottomGapPx`: the distance from the bottom of a
 * sheet's last block to the bottom of the sheet itself. If the grid did not
 * stretch, this is a large positive number; if the content overflowed, the page
 * would be scrollable. Both are failures.
 */
const MEASUREMENT_EXPRESSION = `(() => {
  // Measure at full size. The preview scales sheets down to fit the window, and
  // a scaled rect would shrink every tolerance along with it.
  const previewStyle = document.getElementById('preview-style');
  if (previewStyle) {
    previewStyle.textContent = '.calendar-pages { --preview-zoom: 1; }';
  }

  const pages = Array.from(document.querySelectorAll('.page'));
  const cell = document.querySelector('.day-cell');
  const cellStyle = cell ? getComputedStyle(cell) : null;

  return {
    pageCount: pages.length,
    reported: window.printableCalendar.getResult(),
    borderBottomWidth: cellStyle ? cellStyle.borderBottomWidth : null,
    borderRightWidth: cellStyle ? cellStyle.borderRightWidth : null,
    pages: pages.map((page) => {
      const pageBox = page.getBoundingClientRect();
      const blocks = Array.from(page.children);
      const lastBlockBottom = Math.max(...blocks.map((block) => block.getBoundingClientRect().bottom));
      const grids = Array.from(page.querySelectorAll('.day-grid'));

      // On screen the sheet is drawn at full paper size with the margin as
      // padding, so the content edge is the padding box, not the border box.
      // In print the padding is zero and these are the same thing.
      const paddingBottom = parseFloat(getComputedStyle(page).paddingBottom) || 0;

      return {
        widthPx: pageBox.width,
        heightPx: pageBox.height,
        overflowPx: page.scrollHeight - page.clientHeight,
        bottomGapPx: pageBox.bottom - paddingBottom - lastBlockBottom,
        gridCount: grids.length,
        weekCounts: grids.map((grid) => Number(grid.dataset.weeks)),
        rowHeights: grids.map((grid) => {
          const rows = Array.from(grid.querySelectorAll('.week'))
            .map((week) => week.getBoundingClientRect().height);
          return { count: rows.length, min: Math.min(...rows), max: Math.max(...rows) };
        }),
      };
    }),
  };
})()`;

/* -- Cases --------------------------------------------------------------- */

function paperPoints(paperSizeKey, orientation) {
  const paper = PAPER_SIZES[paperSizeKey];
  const shortEdge = (paper.widthMm / MM_PER_INCH) * POINTS_PER_INCH;
  const longEdge = (paper.heightMm / MM_PER_INCH) * POINTS_PER_INCH;

  return orientation === 'landscape'
    ? { width: longEdge, height: shortEdge }
    : { width: shortEdge, height: longEdge };
}

/**
 * Months per page, restated rather than imported from config.js on purpose: a
 * test that derives its expectation from the code under test cannot catch that
 * code being wrong.
 */
const MONTHS_PER_PAGE = {
  monthly: 1,
  'two-month': 2,
  'four-month': 4,
  'six-month': 6,
  yearly: 12,
};

function buildCase(name, query) {
  const options = {
    calendarType: 'monthly',
    startYear: 2026,
    startMonth: 8,
    monthCount: 12,
    orientation: 'landscape',
    paperSize: 'letter',
    ...query,
  };

  return {
    name,
    query,
    options,
    expectedPages: Math.ceil(options.monthCount / MONTHS_PER_PAGE[options.calendarType]),
  };
}

function buildCases() {
  const cases = [
    buildCase('brief defaults: Aug 2026 - Jul 2027, monthly, letter landscape', {}),
    buildCase('monthly portrait letter', { orientation: 'portrait' }),
    buildCase('two month', { calendarType: 'two-month' }),
    buildCase('four month', { calendarType: 'four-month' }),
    buildCase('six month', { calendarType: 'six-month' }),
    buildCase('yearly, one sheet', { calendarType: 'yearly' }),
    buildCase('yearly across two sheets', { calendarType: 'yearly', monthCount: 24 }),
    buildCase('odd month count, two month layout', { calendarType: 'two-month', monthCount: 13 }),
    buildCase('single month', { monthCount: 1 }),
    buildCase('everything on: notes, shading, holidays, adjacent days', {
      includeNotes: true,
      shadeWeekends: true,
      holidays: 'all',
      showAdjacentDays: true,
      dateSize: 'largest',
    }),
    buildCase('every type size at its largest', {
      holidays: 'all',
      titleSize: 'largest',
      weekdaySize: 'largest',
      dateSize: 'largest',
      holidaySize: 'largest',
    }),
    buildCase('every type size at its largest on a dense layout', {
      calendarType: 'six-month',
      holidays: 'all',
      includeNotes: true,
      titleSize: 'largest',
      weekdaySize: 'largest',
      dateSize: 'largest',
      holidaySize: 'largest',
    }),
    buildCase('every type size at its smallest', {
      holidays: 'all',
      titleSize: 'smallest',
      weekdaySize: 'smallest',
      dateSize: 'smallest',
      holidaySize: 'smallest',
    }),
    buildCase('largest type on the smallest sheet', {
      paperSize: 'a4',
      orientation: 'portrait',
      calendarType: 'yearly',
      titleSize: 'largest',
      weekdaySize: 'largest',
      dateSize: 'largest',
    }),
    buildCase('notes strip on a multi-month sheet', {
      calendarType: 'four-month',
      includeNotes: true,
    }),
    buildCase('grid lines off', { gridLines: false }),
    buildCase('sunday start', { weekStart: 0 }),
    buildCase('leap-adjacent: Feb 2027 in range, sunday start', {
      startYear: 2027,
      startMonth: 1,
      weekStart: 0,
    }),
    buildCase('leap year February 2028', { startYear: 2028, startMonth: 2, monthCount: 1 }),
    buildCase('legal landscape', { paperSize: 'legal' }),
    buildCase('11x17 landscape', { paperSize: 'tabloid' }),
    buildCase('a4 portrait', { paperSize: 'a4', orientation: 'portrait' }),
    buildCase('poster portrait, yearly', {
      paperSize: 'poster',
      orientation: 'portrait',
      calendarType: 'yearly',
    }),
    buildCase('movie poster portrait, yearly', {
      paperSize: 'movie-poster',
      orientation: 'portrait',
      calendarType: 'yearly',
    }),
  ];

  if (!runFullMatrix) {
    return cases;
  }

  for (const calendarType of Object.keys(MONTHS_PER_PAGE)) {
    for (const orientation of ['landscape', 'portrait']) {
      for (const paperSize of Object.keys(PAPER_SIZES)) {
        cases.push(
          buildCase(`matrix: ${calendarType} / ${orientation} / ${paperSize}`, {
            calendarType,
            orientation,
            paperSize,
          }),
        );
      }
    }
  }

  return cases;
}

/* -- Date math, checked without a browser -------------------------------- */

function verifyDateMath() {
  const august2026 = buildMonthGrid(2026, 7, 1);

  check(
    'Aug 1 2026 falls on a Saturday',
    new Date(2026, 7, 1).getDay() === 6,
    `got day index ${new Date(2026, 7, 1).getDay()}`,
  );

  check(
    'Aug 2026 sits in the second-to-last column on a Monday-start week',
    august2026.cells[august2026.leadingBlanks].column === 5,
    `column ${august2026.cells[august2026.leadingBlanks].column}`,
  );

  check('Aug 2026 needs six rows', august2026.weekCount === 6, `got ${august2026.weekCount}`);

  const finalWeek = august2026.cells.slice(-7);
  const finalWeekDates = finalWeek.filter((cell) => cell.inMonth).map((cell) => cell.dayOfMonth);

  check(
    'Aug 31 2026 sits alone in the final row, under Monday',
    finalWeekDates.length === 1 && finalWeekDates[0] === 31 && finalWeek[0].dayOfMonth === 31,
    `final row holds ${JSON.stringify(finalWeekDates)}`,
  );

  const sequence = buildMonthSequence(2026, 8, 12, 1);

  check(
    'a 12-month run from August 2026 ends in July 2027',
    sequence.at(-1).year === 2027 && sequence.at(-1).monthIndex === 6,
    `ended at ${sequence.at(-1).year}-${sequence.at(-1).monthIndex + 1}`,
  );

  check('February 2027 has 28 days', getDaysInMonth(2027, 1) === 28);
  check('February 2028 has 29 days', getDaysInMonth(2028, 1) === 29);
  check('February 2100 has 28 days', getDaysInMonth(2100, 1) === 28);
  check('February 2000 had 29 days', getDaysInMonth(2000, 1) === 29);

  const rolledBack = addMonths(2026, 0, -1);
  check(
    'stepping back from January 2026 lands on December 2025',
    rolledBack.year === 2025 && rolledBack.monthIndex === 11,
    JSON.stringify(rolledBack),
  );

  const rolledForward = addMonths(2026, 11, 1);
  check(
    'stepping forward from December 2026 lands on January 2027',
    rolledForward.year === 2027 && rolledForward.monthIndex === 0,
    JSON.stringify(rolledForward),
  );

  // Spot checks against a real calendar, both week-start settings.
  const firstWeekdayExpectations = [
    { year: 2026, monthIndex: 7, weekday: 6, label: 'August 2026 starts Saturday' },
    { year: 2026, monthIndex: 11, weekday: 2, label: 'December 2026 starts Tuesday' },
    { year: 2027, monthIndex: 0, weekday: 5, label: 'January 2027 starts Friday' },
    { year: 2027, monthIndex: 1, weekday: 1, label: 'February 2027 starts Monday' },
    { year: 2027, monthIndex: 6, weekday: 4, label: 'July 2027 starts Thursday' },
  ];

  for (const expectation of firstWeekdayExpectations) {
    const actual = new Date(expectation.year, expectation.monthIndex, 1).getDay();
    check(expectation.label, actual === expectation.weekday, `got day index ${actual}`);
  }

  for (const weekStart of [0, 1]) {
    for (const month of buildMonthSequence(2024, 1, 60, weekStart)) {
      const inMonth = month.cells.filter((cell) => cell.inMonth);

      if (
        month.cells.length % 7 !== 0 ||
        inMonth.length !== month.daysInMonth ||
        inMonth[0].dayOfMonth !== 1 ||
        inMonth.at(-1).dayOfMonth !== month.daysInMonth
      ) {
        check(
          `grid integrity for ${month.year}-${month.monthIndex + 1} (weekStart ${weekStart})`,
          false,
          `cells ${month.cells.length}, in-month ${inMonth.length}/${month.daysInMonth}`,
        );
        return;
      }
    }
  }

  check('every month from 2024 to 2028 builds a whole number of weeks with all its dates', true);

  verifyHolidayMath();
  verifyOptionMigration();
  verifyTypeScales();
}

/** Links shared before Day Size retired still have to land on the right size. */
function verifyOptionMigration() {
  const expectations = [
    ['daySize=big', 'largest'],
    ['daySize=small', 'default'],
    ['daySize=tiny', 'smallest'],
  ];

  for (const [query, expected] of expectations) {
    const migrated = readOptionsFromUrl(`?${query}`).dateSize;
    check(`?${query} maps onto dateSize=${expected}`, migrated === expected, `got ${migrated}`);
  }

  const explicit = readOptionsFromUrl('?daySize=big&dateSize=smallest').dateSize;
  check(
    'an explicit dateSize wins over the retired daySize',
    explicit === 'smallest',
    `got ${explicit}`,
  );
}

/**
 * Type scales must actually move the sizes, and must stay inside the bounds
 * that keep a cell usable however far they are pushed.
 */
function verifyTypeScales() {
  const base = { ...DEFAULT_OPTIONS };
  const larger = computeLayout({ ...base, dateSize: 'largest', titleSize: 'largest' });
  const smaller = computeLayout({ ...base, dateSize: 'smallest', titleSize: 'smallest' });
  const middle = computeLayout(base);

  check(
    'the largest date size is bigger than the default',
    larger.metrics.dateFontMm > middle.metrics.dateFontMm,
  );
  check(
    'the smallest date size is smaller than the default',
    smaller.metrics.dateFontMm < middle.metrics.dateFontMm,
  );
  check(
    'the largest title size is bigger than the default',
    larger.metrics.titleFontMm > middle.metrics.titleFontMm,
  );

  for (const calendarType of Object.keys(MONTHS_PER_PAGE)) {
    for (const paperSize of Object.keys(PAPER_SIZES)) {
      const layout = computeLayout({
        ...base,
        calendarType,
        paperSize,
        orientation: 'portrait',
        titleSize: 'largest',
        weekdaySize: 'largest',
        dateSize: 'largest',
        holidaySize: 'largest',
      });

      const { dateFontMm, titleFontMm, weekdayFontMm, worstCaseCellHeightMm, titleHeightMm, weekdayRowHeightMm } =
        layout.metrics;

      if (
        dateFontMm > worstCaseCellHeightMm * 0.5 + 0.01 ||
        titleFontMm > titleHeightMm ||
        weekdayFontMm > weekdayRowHeightMm
      ) {
        check(
          `largest type stays inside its band for ${calendarType} / ${paperSize}`,
          false,
          `date ${dateFontMm.toFixed(2)} of cell ${worstCaseCellHeightMm.toFixed(2)}, ` +
            `title ${titleFontMm.toFixed(2)} of ${titleHeightMm.toFixed(2)}, ` +
            `weekday ${weekdayFontMm.toFixed(2)} of ${weekdayRowHeightMm.toFixed(2)}`,
        );
        return;
      }
    }
  }

  check('largest type stays inside its band on every layout and paper size', true);
}

/**
 * Holiday checks.
 *
 * The vendored package computes Easter from a golden-number table with no
 * century correction, which is only right for roughly 1900 to 2199, so
 * js/holidays.js recomputes it and shifts the movable feasts. Both halves are
 * checked: the algorithm against dates a real calendar agrees on, and the
 * correction plumbing against the algorithm across the whole supported range.
 */
function verifyHolidayMath() {
  const knownEasterDates = [
    [1818, 3, 22], // Earliest an Easter can fall.
    [1961, 4, 2],
    [2000, 4, 23],
    [2011, 4, 24],
    [2024, 3, 31],
    [2025, 4, 20],
    [2026, 4, 5],
    [2027, 3, 28],
    [2030, 4, 21],
    [2038, 4, 25], // Latest an Easter can fall.
  ];

  for (const [year, month, day] of knownEasterDates) {
    const computed = computeGregorianEaster(year);
    check(
      `Easter ${year} falls on ${month}/${day}`,
      computed.getMonth() === month - 1 && computed.getDate() === day,
      `got ${computed.getMonth() + 1}/${computed.getDate()}`,
    );
  }

  // Years chosen to straddle the vendored table's valid window in both
  // directions, so the correction is exercised where it actually bites.
  const easterLookupYears = [1600, 1750, 1899, 1900, 2000, 2199, 2200, 2204, 2400, 3000, 3999];

  for (const year of easterLookupYears) {
    const lookup = buildHolidayLookup(buildMonthSequence(year, 1, 12, 1), 'all');
    const onEaster = lookup.get(toDateKey(computeGregorianEaster(year))) ?? [];

    check(
      `holiday lookup places Easter ${year} on the correct Sunday`,
      onEaster.some((holiday) => holiday.name === 'Easter'),
      `found ${JSON.stringify(onEaster.map((holiday) => holiday.name))}`,
    );

    check(`Easter ${year} lands on a Sunday`, computeGregorianEaster(year).getDay() === 0);
  }

  // June 19 2022 was both Juneteenth and Father's Day. The federal holiday has
  // to win the cell, or the day reads as an observance and nothing more.
  const june2022 = buildHolidayLookup(buildMonthSequence(2022, 6, 1, 1), 'all');
  const sharedDate = june2022.get('2022-06-19') ?? [];

  check(
    'a federal holiday outranks an observance sharing its date',
    getPrimaryHolidayName(sharedDate).startsWith('Juneteenth'),
    `primary name was "${getPrimaryHolidayName(sharedDate)}" from ${JSON.stringify(sharedDate.map((holiday) => holiday.name))}`,
  );

  check('both holidays are still available on that date', sharedDate.length >= 2, `got ${sharedDate.length}`);
}

/* -- Standalone export --------------------------------------------------- */

/*
 * Every case here has more than one row of month blocks except the first. That
 * is deliberate: a single-row layout absorbs a stray hairline, so a monthly
 * calendar can look perfect while every denser layout spills onto an extra
 * page. Checking only the easy case is how that gets missed.
 */
const EXPORT_CASES = [
  {
    name: 'monthly, everything on',
    query: 'shadeWeekends=true&holidays=all&includeNotes=true',
    paperSize: 'letter',
    orientation: 'landscape',
    expectedPages: 12,
  },
  {
    name: 'two month on 11x17 portrait',
    query: 'calendarType=two-month&paperSize=tabloid&orientation=portrait',
    paperSize: 'tabloid',
    orientation: 'portrait',
    expectedPages: 6,
  },
  {
    name: 'six month on legal',
    query: 'calendarType=six-month&paperSize=legal',
    paperSize: 'legal',
    orientation: 'landscape',
    expectedPages: 2,
  },
  {
    name: 'four month with a notes strip',
    query: 'calendarType=four-month&includeNotes=true',
    paperSize: 'letter',
    orientation: 'landscape',
    expectedPages: 3,
  },
  {
    name: 'yearly on a poster',
    query: 'calendarType=yearly&paperSize=poster&orientation=portrait',
    paperSize: 'poster',
    orientation: 'portrait',
    expectedPages: 1,
  },
  {
    name: 'yearly on a movie poster',
    query: 'calendarType=yearly&paperSize=movie-poster&orientation=portrait',
    paperSize: 'movie-poster',
    orientation: 'portrait',
    expectedPages: 1,
  },
];

/**
 * The Download HTML button hands the user a file that has to stand on its own,
 * carrying its own @page rule and geometry with no scripts to rebuild them and
 * without the app's stylesheet behind it. The only honest way to check that is
 * to print the exported file itself.
 */
async function verifyStandaloneExport(session, port) {
  for (const exportCase of EXPORT_CASES) {
    const label = `export (${exportCase.name})`;

    await session.loadCalendar(`http://127.0.0.1:${port}/?${exportCase.query}`);
    const exportedHtml = await session.evaluate('window.printableCalendar.exportStandaloneHtml()');

    check(
      `${label}: carries its own @page rule and page geometry`,
      exportedHtml.includes('@page') && exportedHtml.includes('--day-grid-height'),
    );

    check(`${label}: contains no scripts`, !/<script/i.test(exportedHtml));

    check(
      `${label}: keeps the legacy page-break fallbacks`,
      exportedHtml.includes('page-break-after') && exportedHtml.includes('page-break-inside'),
    );

    const exportPath = join(repoRoot, '.tmp', 'standalone-export.html');
    mkdirSync(dirname(exportPath), { recursive: true });
    writeFileSync(exportPath, exportedHtml, 'utf8');

    await session.send('Page.navigate', {
      url: `http://127.0.0.1:${port}/.tmp/standalone-export.html`,
    });

    for (let attempt = 0; attempt < 200; attempt += 1) {
      const ready = await session
        .evaluate('Boolean(document.querySelector(".day-grid"))')
        .catch(() => false);
      if (ready) break;
      await delay(50);
    }

    const measured = await session.evaluate(`(() => {
      const pages = Array.from(document.querySelectorAll('.page'));
      const grid = document.querySelector('.day-grid');
      return {
        pageCount: pages.length,
        gridBoxSizing: getComputedStyle(grid).boxSizing,
        worstOverflow: Math.max(...pages.map((page) => page.scrollHeight - page.clientHeight)),
        worstGap: Math.max(...pages.map((page) => {
          const box = page.getBoundingClientRect();
          const paddingBottom = parseFloat(getComputedStyle(page).paddingBottom) || 0;
          const bottom = Math.max(...Array.from(page.children).map((child) => child.getBoundingClientRect().bottom));
          return box.bottom - paddingBottom - bottom;
        })),
      };
    })()`);

    const { data } = await session.send('Page.printToPDF', {
      preferCSSPageSize: true,
      printBackground: true,
      marginTop: 0,
      marginBottom: 0,
      marginLeft: 0,
      marginRight: 0,
    });

    const pdf = await PDFDocument.load(Buffer.from(data, 'base64'));
    const size = pdf.getPage(0).getSize();
    const expected = paperPoints(exportCase.paperSize, exportCase.orientation);

    check(
      `${label}: the day grid keeps a border box without the app stylesheet`,
      measured.gridBoxSizing === 'border-box',
      `got ${measured.gridBoxSizing}`,
    );
    check(
      `${label}: renders ${exportCase.expectedPages} sheets`,
      measured.pageCount === exportCase.expectedPages,
      `got ${measured.pageCount}`,
    );
    check(
      `${label}: prints ${exportCase.expectedPages} pages`,
      pdf.getPageCount() === exportCase.expectedPages,
      `got ${pdf.getPageCount()}`,
    );
    check(
      `${label}: keeps the ${exportCase.paperSize} ${exportCase.orientation} page box`,
      Math.abs(size.width - expected.width) < PAGE_SIZE_TOLERANCE_POINTS &&
        Math.abs(size.height - expected.height) < PAGE_SIZE_TOLERANCE_POINTS,
      `got ${size.width.toFixed(1)}x${size.height.toFixed(1)}pt`,
    );
    check(`${label}: does not overflow`, measured.worstOverflow <= 0.5, `${measured.worstOverflow}px`);
    check(`${label}: still reaches the bottom margin`, measured.worstGap <= 1, `${measured.worstGap}px`);
  }
}

/* -- Run ----------------------------------------------------------------- */

async function run() {
  verifyDateMath();

  const rows = await withBrowser(repoRoot, async ({ session, port }) => {
    const collected = [];

    for (const testCase of buildCases()) {
      const query = new URLSearchParams(
        Object.fromEntries(
          Object.entries(testCase.query).map(([key, value]) => [key, String(value)]),
        ),
      ).toString();

      await session.loadCalendar(`http://127.0.0.1:${port}/${query ? `?${query}` : ''}`);
      const measured = await session.evaluate(MEASUREMENT_EXPRESSION);

      const { data } = await session.send('Page.printToPDF', {
        preferCSSPageSize: true,
        printBackground: testCase.options.shadeWeekends === true,
        marginTop: 0,
        marginBottom: 0,
        marginLeft: 0,
        marginRight: 0,
      });

      const pdf = await PDFDocument.load(Buffer.from(data, 'base64'));
      const pdfPageCount = pdf.getPageCount();
      const firstPageSize = pdf.getPage(0).getSize();
      const expectedSize = paperPoints(testCase.options.paperSize, testCase.options.orientation);

      const label = testCase.name;

      check(
        `${label}: DOM renders ${testCase.expectedPages} sheets`,
        measured.pageCount === testCase.expectedPages,
        `got ${measured.pageCount}`,
      );

      check(
        `${label}: PDF has exactly ${testCase.expectedPages} pages, no blank trailer`,
        pdfPageCount === testCase.expectedPages,
        `got ${pdfPageCount}`,
      );

      check(
        `${label}: PDF sheet measures ${expectedSize.width.toFixed(0)}x${expectedSize.height.toFixed(0)}pt`,
        Math.abs(firstPageSize.width - expectedSize.width) < PAGE_SIZE_TOLERANCE_POINTS &&
          Math.abs(firstPageSize.height - expectedSize.height) < PAGE_SIZE_TOLERANCE_POINTS,
        `got ${firstPageSize.width.toFixed(1)}x${firstPageSize.height.toFixed(1)}pt`,
      );

      const worstOverflow = Math.max(...measured.pages.map((page) => page.overflowPx));
      check(`${label}: nothing overflows a sheet`, worstOverflow <= 0.5, `${worstOverflow.toFixed(2)}px`);

      const worstGap = Math.max(...measured.pages.map((page) => page.bottomGapPx));
      check(
        `${label}: content reaches the bottom margin on every sheet`,
        worstGap <= 1,
        `largest gap ${worstGap.toFixed(2)}px`,
      );

      const uniformRows = measured.pages.every((page) =>
        page.rowHeights.every((rows) => rows.max - rows.min < 0.75),
      );
      check(`${label}: day-grid rows are equal height`, uniformRows);

      if (testCase.options.gridLines !== false) {
        check(
          `${label}: grid lines are borders, so they print without background graphics`,
          Number.parseFloat(measured.borderBottomWidth) > 0 &&
            Number.parseFloat(measured.borderRightWidth) > 0,
          `bottom ${measured.borderBottomWidth}, right ${measured.borderRightWidth}`,
        );
      }

      collected.push({
        case: label,
        pages: pdfPageCount,
        expected: testCase.expectedPages,
        sheet: `${firstPageSize.width.toFixed(0)}x${firstPageSize.height.toFixed(0)}pt`,
        overflow: `${worstOverflow.toFixed(2)}px`,
        bottomGap: `${worstGap.toFixed(2)}px`,
      });
    }

    await verifyStandaloneExport(session, port);

    return collected;
  });

  console.table(rows);
  console.log(`\n${passes.length} checks passed.`);

  if (failures.length) {
    console.error(`\n${failures.length} FAILED:`);
    for (const failure of failures) {
      console.error(`  x ${failure}`);
    }
    process.exitCode = 1;
    return;
  }

  console.log('All print checks passed.');
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
