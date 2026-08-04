/**
 * Wires the options panel to the renderer, keeps the URL in sync, and handles
 * the two output paths: print (which is where a PDF comes from) and a
 * self-contained HTML download.
 */

import { CALENDAR_TYPES, MM_PER_INCH, MONTH_NAMES, PAPER_SIZES } from './config.js';
import { readOptionsFromUrl, renderControls, writeOptionsToUrl } from './controls.js';
import { addMonths } from './date-utils.js';
import { buildPageStylesheet } from './layout.js';
import { renderCalendar } from './render.js';

const CSS_PIXELS_PER_INCH = 96;

const elements = {
  pages: document.getElementById('calendar-pages'),
  controls: document.getElementById('controls'),
  summary: document.getElementById('preview-summary'),
  recipe: document.getElementById('print-recipe'),
  pageStyle: document.getElementById('page-style'),
  previewStyle: document.getElementById('preview-style'),
  previewFrame: document.getElementById('preview-frame'),
  printButton: document.getElementById('print-button'),
  downloadButton: document.getElementById('download-button'),
};

let options = readOptionsFromUrl();
let lastResult = null;

function formatMonthLabel(year, monthIndex) {
  return `${MONTH_NAMES[monthIndex]} ${year}`;
}

function describeRange(currentOptions) {
  const first = { year: currentOptions.startYear, monthIndex: currentOptions.startMonth - 1 };
  const last = addMonths(first.year, first.monthIndex, currentOptions.monthCount - 1);

  if (currentOptions.monthCount === 1) {
    return formatMonthLabel(first.year, first.monthIndex);
  }

  return `${formatMonthLabel(first.year, first.monthIndex)} to ${formatMonthLabel(last.year, last.monthIndex)}`;
}

function updateSummary(result) {
  const paper = PAPER_SIZES[options.paperSize];
  const pageWord = result.pageCount === 1 ? 'page' : 'pages';

  elements.summary.replaceChildren();

  const count = document.createElement('span');
  count.className = 'preview-count';
  count.textContent = `${result.pageCount} ${pageWord}`;

  const detail = document.createElement('span');
  detail.textContent = `${describeRange(options)} · ${paper.label} ${options.orientation} · ${CALENDAR_TYPES[options.calendarType].label}`;

  elements.summary.append(count, document.createTextNode(' · '), detail);
}

function updatePrintRecipe() {
  const paper = PAPER_SIZES[options.paperSize];

  elements.recipe.replaceChildren();

  const heading = document.createElement('strong');
  heading.textContent = 'To save a PDF: ';

  const body = document.createTextNode(
    `press Ctrl+P (Cmd+P on a Mac), choose "Save as PDF", set paper to ${paper.label} (${paper.note}), ` +
      `orientation to ${options.orientation}, margins to Default and scale to 100%. ` +
      (options.shadeWeekends
        ? 'Weekend shading needs "Background graphics" switched on; the grid lines print either way.'
        : 'Leave "Background graphics" off if you like; the grid lines are borders and print regardless.'),
  );

  elements.recipe.append(heading, body);
}

/**
 * Scales the on-screen sheets down to fit the preview column. Print is
 * unaffected: the zoom lives behind an @media screen guard in calendar.css.
 */
function updatePreviewZoom() {
  if (!lastResult) {
    return;
  }

  const pageWidthPx =
    (lastResult.layout.metrics.printableWidthMm / MM_PER_INCH) * CSS_PIXELS_PER_INCH;
  const availableWidthPx = elements.previewFrame.clientWidth - 8;
  const zoom = Math.min(1, availableWidthPx / pageWidthPx);

  elements.previewStyle.textContent = `.calendar-pages { --preview-zoom: ${zoom.toFixed(4)}; }`;
}

function update() {
  const result = renderCalendar(elements.pages, options);
  lastResult = result;

  elements.pageStyle.textContent = buildPageStylesheet(result.layout);

  renderControls(elements.controls, options, result, handleOptionChange);
  updateSummary(result);
  updatePrintRecipe();
  updatePreviewZoom();
  writeOptionsToUrl(options);
}

function handleOptionChange(key, value) {
  if (value === undefined || options[key] === value) {
    return;
  }

  options = { ...options, [key]: value };
  update();
}

let cachedCalendarStylesheet = null;

/**
 * Re-serializing the sheet through the CSSOM looks equivalent and is not: the
 * browser drops declarations it does not recognize, which is exactly the legacy
 * `page-break-*` fallbacks the print rules deliberately double up. Reading the
 * file gives the exported page the same bytes this one is using.
 */
function serializeStylesheetFromCssom() {
  for (const sheet of document.styleSheets) {
    if (sheet.ownerNode?.id !== 'calendar-stylesheet') {
      continue;
    }

    try {
      return Array.from(sheet.cssRules)
        .map((rule) => rule.cssText)
        .join('\n');
    } catch {
      return '';
    }
  }

  return '';
}

/**
 * Pulls the calendar stylesheet back out so the downloaded file can carry its
 * own styles. Only the calendar sheet is taken; the app chrome has no business
 * in the exported page.
 */
async function readCalendarStylesheetText() {
  if (cachedCalendarStylesheet !== null) {
    return cachedCalendarStylesheet;
  }

  const link = document.getElementById('calendar-stylesheet');

  try {
    const response = await fetch(link.href);
    cachedCalendarStylesheet = await response.text();
  } catch {
    // A sheet missing its legacy fallbacks still beats no sheet at all.
    cachedCalendarStylesheet = serializeStylesheetFromCssom();
  }

  return cachedCalendarStylesheet;
}

async function buildStandaloneDocument() {
  const title = `Calendar ${describeRange(options)}`;

  const document_ = [
    '<!doctype html>',
    '<html lang="en">',
    '<head>',
    '<meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width, initial-scale=1">',
    `<title>${title}</title>`,
    '<style>',
    'html, body { margin: 0; padding: 0; background: #fff; }',
    '@media screen { body { background: #f1f1f3; padding: 28px 0; } }',
    elements.pageStyle.textContent,
    await readCalendarStylesheetText(),
    '</style>',
    '</head>',
    '<body>',
    `<div class="calendar-pages">${elements.pages.innerHTML}</div>`,
    '</body>',
    '</html>',
    '',
  ].join('\n');

  return { title, html: document_ };
}

async function handleDownload() {
  const { html } = await buildStandaloneDocument();
  const last = addMonths(options.startYear, options.startMonth - 1, options.monthCount - 1);
  const startTag = `${options.startYear}-${String(options.startMonth).padStart(2, '0')}`;
  const endTag = `${last.year}-${String(last.monthIndex + 1).padStart(2, '0')}`;

  const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');

  link.href = url;
  link.download = `calendar-${startTag}-to-${endTag}.html`;
  document.body.append(link);
  link.click();
  link.remove();

  URL.revokeObjectURL(url);
}

elements.printButton.addEventListener('click', () => window.print());
elements.downloadButton.addEventListener('click', handleDownload);

let resizeFrame = 0;
window.addEventListener('resize', () => {
  cancelAnimationFrame(resizeFrame);
  resizeFrame = requestAnimationFrame(updatePreviewZoom);
});

update();

/**
 * Exposed for the headless verification script in scripts/verify-print.mjs,
 * which drives the page through option combinations and counts the resulting
 * PDF pages.
 */
window.printableCalendar = {
  getOptions: () => ({ ...options }),
  setOptions: (patch) => {
    options = { ...options, ...patch };
    update();
    return lastResult.pageCount;
  },
  getResult: () => ({
    pageCount: lastResult.pageCount,
    monthCount: lastResult.monthCount,
    metrics: lastResult.layout.metrics,
  }),
  // Lets the verification script print the exported file and confirm it comes
  // out identical to the live page, rather than trusting that it would.
  exportStandaloneHtml: async () => (await buildStandaloneDocument()).html,
};
