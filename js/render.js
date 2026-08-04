/**
 * Builds the calendar DOM.
 *
 * Plain document.createElement throughout: no template strings injected as
 * innerHTML, so holiday names coming out of the data layer can never be parsed
 * as markup. Geometry is never written to element style attributes; it all
 * arrives through the custom properties emitted by layout.js.
 *
 * The month is also exposed to assistive technology as a table. The wrapper and
 * week elements that make that possible are `display: contents`, so they add
 * nothing to the box tree and the printed geometry is exactly what layout.js
 * computed.
 */

import {
  MONTH_NAMES,
  WEEKDAY_NAMES_LONG,
  WEEKDAY_NAMES_MINIMAL,
  WEEKDAY_NAMES_SHORT,
} from './config.js';
import { buildMonthSequence, orderWeekdays, paginateMonths } from './date-utils.js';
import { buildHolidayLookup, getFullHolidayNames, getPrimaryHolidayName } from './holidays.js';
import { computeLayout } from './layout.js';

function createElement(tagName, className, textContent) {
  const element = document.createElement(tagName);

  if (className) {
    element.className = className;
  }

  if (textContent !== undefined) {
    element.textContent = textContent;
  }

  return element;
}

function describeDate(date) {
  return `${WEEKDAY_NAMES_LONG[date.getDay()]}, ${MONTH_NAMES[date.getMonth()]} ${date.getDate()}, ${date.getFullYear()}`;
}

function renderWeekdayRow(weekStart, labelStyle) {
  const names = labelStyle === 'minimal' ? WEEKDAY_NAMES_MINIMAL : WEEKDAY_NAMES_SHORT;
  const row = createElement('div', 'weekday-row');
  row.setAttribute('role', 'row');

  const abbreviated = orderWeekdays(names, weekStart);
  const spelledOut = orderWeekdays(WEEKDAY_NAMES_LONG, weekStart);

  abbreviated.forEach((name, column) => {
    const label = createElement('abbr', 'weekday-label', name);
    label.title = spelledOut[column];
    label.setAttribute('role', 'columnheader');
    row.append(label);
  });

  return row;
}

function renderDayCell(cell, options, layout, holidayLookup) {
  const dayCell = createElement('div', 'day-cell');
  dayCell.setAttribute('role', 'cell');

  if (cell.isWeekend) {
    dayCell.classList.add('is-weekend');
  }

  if (!cell.inMonth) {
    dayCell.classList.add('is-adjacent');

    if (!options.showAdjacentDays) {
      return dayCell;
    }
  }

  dayCell.append(createElement('span', 'day-number', String(cell.dayOfMonth)));

  const holidays = holidayLookup.get(cell.dateKey);

  if (holidays && cell.inMonth) {
    const fullNames = getFullHolidayNames(holidays);

    if (layout.showHolidayNames) {
      dayCell.append(createElement('span', 'day-holiday', getPrimaryHolidayName(holidays)));
    } else {
      /*
       * Too narrow to spell the name out. The ring marks the date visually and
       * a hidden label carries the name for anyone not reading the print, since
       * a title attribute is neither keyboard reachable nor reliably announced.
       */
      dayCell.append(createElement('span', 'day-holiday-marker'));
      dayCell.append(createElement('span', 'calendar-visually-hidden', fullNames));
      dayCell.title = fullNames;
    }

    dayCell.classList.add('is-holiday');
  }

  return dayCell;
}

function renderMonth(month, options, layout, holidayLookup, titleId) {
  const article = createElement('article', 'month');

  const title = createElement('h2', 'month-title');
  title.id = titleId;
  title.append(createElement('span', 'month-name', MONTH_NAMES[month.monthIndex]));
  title.append(createElement('span', 'month-year', String(month.year)));
  article.append(title);

  const table = createElement('div', 'month-table');
  table.setAttribute('role', 'table');
  table.setAttribute('aria-labelledby', titleId);

  table.append(renderWeekdayRow(options.weekStart, layout.weekdayLabelStyle));

  const dayGrid = createElement('div', 'day-grid');
  dayGrid.dataset.weeks = String(month.weekCount);
  dayGrid.setAttribute('role', 'rowgroup');

  for (let week = 0; week < month.weekCount; week += 1) {
    const weekRow = createElement('div', 'week');
    weekRow.setAttribute('role', 'row');

    for (const cell of month.cells.slice(week * 7, week * 7 + 7)) {
      weekRow.append(renderDayCell(cell, options, layout, holidayLookup));
    }

    dayGrid.append(weekRow);
  }

  table.append(dayGrid);
  article.append(table);

  return article;
}

function renderNotes(className, lineCount) {
  const notes = createElement('aside', className);
  notes.append(createElement('h3', 'notes-title', 'Notes'));

  const lines = createElement('div', 'notes-lines');

  for (let index = 0; index < lineCount; index += 1) {
    lines.append(createElement('div', 'notes-line'));
  }

  notes.append(lines);

  return notes;
}

function countNotesLines(availableMm, lineHeightMm, titleAllowanceMm) {
  return Math.max(1, Math.floor((availableMm - titleAllowanceMm) / lineHeightMm));
}

function renderPage(monthsOnPage, options, layout, holidayLookup, pageIndex) {
  const page = createElement('section', 'page');
  page.dataset.calendarType = options.calendarType;

  const pageInner = createElement('div', 'page-inner');
  const monthGrid = createElement('div', 'month-grid');

  monthsOnPage.forEach((month, indexOnPage) => {
    const titleId = `month-title-${pageIndex}-${indexOnPage}`;
    monthGrid.append(renderMonth(month, options, layout, holidayLookup, titleId));
  });

  pageInner.append(monthGrid);

  if (layout.notesPlacement === 'column') {
    const lineCount = countNotesLines(
      layout.metrics.bodyHeightMm,
      layout.metrics.notesLineHeightMm,
      layout.metrics.titleHeightMm,
    );
    pageInner.append(renderNotes('notes notes-column', lineCount));
  }

  page.append(pageInner);

  if (layout.notesPlacement === 'strip') {
    const lineCount = countNotesLines(
      layout.metrics.notesStripHeightMm,
      layout.metrics.notesLineHeightMm,
      layout.metrics.notesLineHeightMm,
    );
    page.append(renderNotes('notes notes-strip', lineCount));
  }

  return page;
}

/**
 * Renders the whole calendar into `container`, replacing whatever was there.
 * Returns the layout and the page count so callers can report and verify it.
 */
export function renderCalendar(container, options) {
  const layout = computeLayout(options);

  const months = buildMonthSequence(
    options.startYear,
    options.startMonth,
    options.monthCount,
    options.weekStart,
  );

  const holidayLookup = buildHolidayLookup(months, options.holidays);
  const pages = paginateMonths(months, layout.monthsPerPage);

  const fragment = document.createDocumentFragment();

  pages.forEach((monthsOnPage, pageIndex) => {
    fragment.append(renderPage(monthsOnPage, options, layout, holidayLookup, pageIndex));
  });

  container.replaceChildren(fragment);

  return { layout, pageCount: pages.length, monthCount: months.length };
}
