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
  instructionsLead: document.getElementById('instructions-lead'),
  instructionsList: document.getElementById('instructions-list'),
  notice: document.getElementById('print-notice'),
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

const SVG_NAMESPACE = 'http://www.w3.org/2000/svg';

/** Matches the print dialog's own wording so the two can be read side by side. */
function buildInstructionRows() {
  const paper = PAPER_SIZES[options.paperSize];

  return [
    ['Destination', 'Save as PDF'],
    ['Paper size', `${paper.label} (${paper.note})`],
    ['Layout', options.orientation === 'landscape' ? 'Landscape' : 'Portrait'],
    ['Margins', 'Default'],
    ['Scale', '100%'],
  ];
}

function updateInstructions() {
  const isMac = /Mac|iPhone|iPad/.test(navigator.userAgent);

  elements.instructionsLead.replaceChildren();
  elements.instructionsLead.append(document.createTextNode('Press '));

  for (const key of isMac ? ['Cmd', 'P'] : ['Ctrl', 'P']) {
    if (elements.instructionsLead.childNodes.length > 1) {
      elements.instructionsLead.append(document.createTextNode(' + '));
    }

    const keyElement = document.createElement('kbd');
    keyElement.textContent = key;
    elements.instructionsLead.append(keyElement);
  }

  elements.instructionsLead.append(document.createTextNode(', then match these settings.'));

  const list = document.createDocumentFragment();

  for (const [setting, value] of buildInstructionRows()) {
    const term = document.createElement('dt');
    term.textContent = setting;

    const definition = document.createElement('dd');
    definition.textContent = value;

    list.append(term, definition);
  }

  elements.instructionsList.replaceChildren(list);
}

/**
 * Everything on the sheet is drawn with borders and text except two things:
 * weekend shading and the disc behind a holiday date. Chrome leaves background
 * graphics off by default, so whichever of those is switched on gets a notice
 * rather than a line of prose nobody reads.
 */
function listBackgroundDependentFeatures() {
  const features = [];

  if (options.shadeWeekends) {
    features.push('weekend shading');
  }

  if (options.holidays !== 'none') {
    features.push('holiday markers');
  }

  return features;
}

function updateNotice() {
  const features = listBackgroundDependentFeatures();

  if (!features.length) {
    elements.notice.hidden = true;
    elements.notice.replaceChildren();
    return;
  }

  const icon = document.createElementNS(SVG_NAMESPACE, 'svg');
  icon.setAttribute('class', 'notice-icon');
  icon.setAttribute('viewBox', '0 0 20 20');
  icon.setAttribute('aria-hidden', 'true');

  for (const shape of ['M10 3.4 L18.3 17.6 H1.7 Z', 'M10 8.4 V12.4', 'M10 15.1 h0.01']) {
    const path = document.createElementNS(SVG_NAMESPACE, 'path');
    path.setAttribute('d', shape);
    path.setAttribute('fill', 'none');
    path.setAttribute('stroke', 'currentColor');
    path.setAttribute('stroke-width', '1.6');
    path.setAttribute('stroke-linecap', 'round');
    path.setAttribute('stroke-linejoin', 'round');
    icon.append(path);
  }

  const message = document.createElement('p');
  message.className = 'notice-message';

  const heading = document.createElement('strong');
  heading.textContent = 'Turn on Background graphics';

  message.append(
    heading,
    document.createTextNode(` under More settings, or ${features.join(' and ')} won't print.`),
  );

  elements.notice.replaceChildren(icon, message);
  elements.notice.hidden = false;
}

/**
 * Scales the on-screen sheets down to fit the preview column. Print is
 * unaffected: the zoom lives behind an @media screen guard in calendar.css.
 */
function updatePreviewZoom() {
  if (!lastResult) {
    return;
  }

  // The screen preview draws the whole sheet, margins included, so the fit is
  // measured against the paper rather than the printable area.
  const pageWidthPx = (lastResult.layout.paper.widthMm / MM_PER_INCH) * CSS_PIXELS_PER_INCH;
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
  updateInstructions();
  updateNotice();
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
