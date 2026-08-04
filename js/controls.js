/**
 * The options panel, and the URL round-trip that makes a configuration
 * shareable.
 *
 * The panel is described declaratively so index.html stays a shell and there is
 * exactly one list to edit when an option is added. A row holds one or two
 * fields; pairing the narrow ones keeps the sidebar short enough to read
 * without scrolling. A field can hold more than one control bound to the same
 * option, which is how Year offers both quick buttons and a free-entry box.
 */

import {
  CALENDAR_TYPES,
  DEFAULT_OPTIONS,
  FONT_FAMILIES,
  GRID_COLORS,
  HOLIDAY_MODES,
  MONTH_NAMES,
  PAPER_SIZES,
  SIZE_STEPS,
} from './config.js';

const QUICK_YEARS = [2025, 2026, 2027];

function toChoices(definitions) {
  return Object.entries(definitions).map(([value, definition]) => ({
    value,
    label: definition.label,
    note: definition.note,
  }));
}

/**
 * Panel icons, drawn as inline SVG rather than pulled from an icon font so they
 * cost nothing to load and cannot arrive late. Orientation is the shape of the
 * sheet, which survives a half-width column where the word does not; the
 * warning triangle marks a setting that needs something done in the print
 * dialog.
 */
const ICON_SHAPES = {
  // A sheet with lines of content on it, rather than a bare rectangle: the
  // ruling is what makes the shape read as a page turned one way or the other.
  landscape: [
    { x: 1.6, y: 4.4, width: 16.8, height: 11.2, rx: 1.4 },
    { path: 'M4.4 8 H15.6', strokeWidth: 1.1 },
    { path: 'M4.4 10.6 H15.6', strokeWidth: 1.1 },
    { path: 'M4.4 13.2 H12.2', strokeWidth: 1.1 },
  ],
  portrait: [
    { x: 4.4, y: 1.6, width: 11.2, height: 16.8, rx: 1.4 },
    { path: 'M7 5.8 H13', strokeWidth: 1.1 },
    { path: 'M7 8.8 H13', strokeWidth: 1.1 },
    { path: 'M7 11.8 H13', strokeWidth: 1.1 },
    { path: 'M7 14.8 H10.8', strokeWidth: 1.1 },
  ],
  /*
   * Solid, with the exclamation knocked out of it. A stroked outline of this
   * size loses the mark entirely at the 14px the label uses, and the hole keeps
   * it legible on the white card and the amber notice alike.
   */
  warning: [
    {
      fillPath:
        'M9.14 2.6 a1 1 0 0 1 1.72 0 l8.05 14.2 a1 1 0 0 1 -0.86 1.5 H1.95 a1 1 0 0 1 -0.86 -1.5 Z ' +
        'M9.1 7.3 h1.8 v5.1 h-1.8 Z ' +
        'M9.1 14 h1.8 v1.8 h-1.8 Z',
      fillRule: 'evenodd',
    },
  ],
  info: [
    { circle: { cx: 10, cy: 10, r: 7.4 } },
    { path: 'M10 9.4 V13.9' },
    { path: 'M10 6.4 h0.01' },
  ],
};

const SVG_NAMESPACE = 'http://www.w3.org/2000/svg';

export function createIcon(name, className = 'option-icon') {
  const shapes = ICON_SHAPES[name];

  if (!shapes) {
    return null;
  }

  const svg = document.createElementNS(SVG_NAMESPACE, 'svg');
  svg.setAttribute('class', className);
  svg.setAttribute('viewBox', '0 0 20 20');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('focusable', 'false');

  for (const shape of shapes) {
    if (shape.fillPath) {
      const path = document.createElementNS(SVG_NAMESPACE, 'path');
      path.setAttribute('d', shape.fillPath);
      path.setAttribute('fill', 'currentColor');
      path.setAttribute('fill-rule', shape.fillRule ?? 'nonzero');
      svg.append(path);
      continue;
    }

    if (shape.circle) {
      const circle = document.createElementNS(SVG_NAMESPACE, 'circle');
      circle.setAttribute('cx', String(shape.circle.cx));
      circle.setAttribute('cy', String(shape.circle.cy));
      circle.setAttribute('r', String(shape.circle.r));
      circle.setAttribute('fill', 'none');
      circle.setAttribute('stroke', 'currentColor');
      circle.setAttribute('stroke-width', '1.6');
      svg.append(circle);
      continue;
    }

    if (shape.path) {
      const path = document.createElementNS(SVG_NAMESPACE, 'path');
      path.setAttribute('d', shape.path);
      path.setAttribute('fill', 'none');
      path.setAttribute('stroke', 'currentColor');
      path.setAttribute('stroke-width', String(shape.strokeWidth ?? 1.6));
      path.setAttribute('stroke-linecap', 'round');
      path.setAttribute('stroke-linejoin', 'round');
      svg.append(path);
      continue;
    }

    const rect = document.createElementNS(SVG_NAMESPACE, 'rect');
    rect.setAttribute('x', String(shape.x));
    rect.setAttribute('y', String(shape.y));
    rect.setAttribute('width', String(shape.width));
    rect.setAttribute('height', String(shape.height));
    rect.setAttribute('rx', String(shape.rx));
    rect.setAttribute('fill', shape.filled ? 'currentColor' : 'none');

    if (!shape.filled) {
      rect.setAttribute('stroke', 'currentColor');
      rect.setAttribute('stroke-width', '1.5');
    }

    svg.append(rect);
  }

  return svg;
}

const FIELDS = {
  calendarType: {
    label: 'Calendar Type',
    controls: [
      {
        type: 'select',
        key: 'calendarType',
        ariaLabel: 'Calendar type',
        choices: toChoices(CALENDAR_TYPES),
      },
    ],
    describe: (options) => CALENDAR_TYPES[options.calendarType].note,
  },
  year: {
    label: 'Year',
    controls: [
      {
        type: 'buttons',
        key: 'startYear',
        choices: QUICK_YEARS.map((year) => ({ value: year, label: String(year) })),
      },
      { type: 'number', key: 'startYear', min: 1583, max: 4000, step: 1, ariaLabel: 'Start year' },
    ],
  },
  startMonth: {
    label: 'Starting Month',
    controls: [
      {
        type: 'select',
        key: 'startMonth',
        ariaLabel: 'Starting month',
        choices: MONTH_NAMES.map((name, index) => ({ value: index + 1, label: name })),
      },
    ],
  },
  monthCount: {
    label: 'Months to Print',
    controls: [
      {
        type: 'number',
        key: 'monthCount',
        min: 1,
        max: 120,
        step: 1,
        ariaLabel: 'Number of months',
        addon: (options, result) => (result.pageCount === 1 ? 'page' : 'pages'),
      },
    ],
  },
  paperSize: {
    label: 'Paper Size',
    controls: [
      {
        type: 'select',
        key: 'paperSize',
        ariaLabel: 'Paper size',
        choices: toChoices(PAPER_SIZES),
      },
    ],
    describe: (options) => PAPER_SIZES[options.paperSize].note,
  },
  orientation: {
    label: 'Orientation',
    controls: [
      {
        type: 'buttons',
        key: 'orientation',
        choices: [
          { value: 'landscape', label: 'Landscape', icon: 'landscape' },
          { value: 'portrait', label: 'Portrait', icon: 'portrait' },
        ],
      },
    ],
  },
  titleFont: {
    label: 'Title Font',
    labelInfo: () => 'Sets the month and year heading.',
    controls: [
      { type: 'select', key: 'titleFont', ariaLabel: 'Title font', choices: toChoices(FONT_FAMILIES) },
    ],
  },
  bodyFont: {
    label: 'Body Font',
    labelInfo: () => 'Sets the weekday names, the dates and any holiday names.',
    controls: [
      { type: 'select', key: 'bodyFont', ariaLabel: 'Body font', choices: toChoices(FONT_FAMILIES) },
    ],
  },
  titleSize: {
    label: 'Title Size',
    controls: [{ type: 'select', key: 'titleSize', ariaLabel: 'Title size', choices: toChoices(SIZE_STEPS) }],
  },
  weekdaySize: {
    label: 'Weekday Size',
    controls: [{ type: 'select', key: 'weekdaySize', ariaLabel: 'Weekday size', choices: toChoices(SIZE_STEPS) }],
  },
  dateSize: {
    label: 'Date Size',
    controls: [{ type: 'select', key: 'dateSize', ariaLabel: 'Date size', choices: toChoices(SIZE_STEPS) }],
  },
  holidaySize: {
    label: 'Holiday Size',
    controls: [{ type: 'select', key: 'holidaySize', ariaLabel: 'Holiday text size', choices: toChoices(SIZE_STEPS) }],
  },
  weekStart: {
    label: 'Weekday Starts',
    controls: [
      {
        type: 'buttons',
        key: 'weekStart',
        choices: [
          { value: 0, label: 'Sunday' },
          { value: 1, label: 'Monday' },
        ],
      },
    ],
  },
  includeNotes: {
    label: 'Notes',
    controls: [
      {
        type: 'buttons',
        key: 'includeNotes',
        choices: [
          { value: false, label: 'No' },
          { value: true, label: 'Yes' },
        ],
      },
    ],
    describe: (options) => {
      if (!options.includeNotes) {
        return '';
      }

      return CALENDAR_TYPES[options.calendarType].monthsPerPage === 1
        ? 'Ruled column beside the grid.'
        : 'Ruled strip along the bottom.';
    },
  },
  gridLines: {
    label: 'Grid Lines',
    controls: [
      {
        type: 'buttons',
        key: 'gridLines',
        choices: [
          { value: true, label: 'Yes' },
          { value: false, label: 'No' },
        ],
      },
    ],
  },
  gridColor: {
    label: 'Grid Color',
    // Kept in place rather than removed when the grid is off, so the panel does
    // not reflow underneath the pointer; it just stops being operable.
    disabledWhen: (options) => !options.gridLines,
    controls: [
      {
        type: 'buttons',
        key: 'gridColor',
        choices: Object.values(GRID_COLORS).map((color) => ({
          value: color.value,
          label: color.label,
        })),
      },
      { type: 'color', key: 'gridColor', ariaLabel: 'Custom grid color' },
    ],
  },
  shadeWeekends: {
    label: 'Weekends Shaded',
    // Shading is the one thing on the sheet that will not print unless a box is
    // ticked in the print dialog, so the label carries a mark when it is on and
    // the detail lives in the notice under the instructions.
    labelIcon: (options) =>
      options.shadeWeekends
        ? { name: 'warning', title: 'Needs "Background graphics" enabled in the print dialog' }
        : null,
    controls: [
      {
        type: 'buttons',
        key: 'shadeWeekends',
        choices: [
          { value: false, label: 'No' },
          { value: true, label: 'Yes' },
        ],
      },
    ],
  },
  showAdjacentDays: {
    label: 'Adjacent Days',
    controls: [
      {
        type: 'buttons',
        key: 'showAdjacentDays',
        choices: [
          { value: false, label: 'Hide' },
          { value: true, label: 'Show' },
        ],
      },
    ],
  },
  holidays: {
    label: 'Holidays',
    labelIcon: (options) =>
      options.holidays === 'none'
        ? null
        : { name: 'warning', title: 'Needs "Background graphics" enabled in the print dialog' },
    controls: [{ type: 'buttons', key: 'holidays', choices: toChoices(HOLIDAY_MODES) }],
    describe: (options) => (options.holidays === 'none' ? '' : 'US only, from holidate.'),
  },
};

/**
 * Tabs, each holding rows of one or two fields. Splitting the panel three ways
 * keeps every group short enough to take in at once: what the calendar covers,
 * how the sheet is marked up, and how it is set in type.
 */
const CONTROL_TABS = [
  {
    id: 'calendar',
    label: 'Calendar',
    rows: [
      [FIELDS.calendarType, FIELDS.paperSize],
      [FIELDS.orientation, FIELDS.weekStart],
      [FIELDS.year],
      [FIELDS.startMonth, FIELDS.monthCount],
    ],
  },
  {
    id: 'sheet',
    label: 'Sheet',
    rows: [
      [FIELDS.gridLines, FIELDS.gridColor],
      [FIELDS.shadeWeekends, FIELDS.showAdjacentDays],
      [FIELDS.includeNotes],
      [FIELDS.holidays],
    ],
  },
  {
    id: 'type',
    label: 'Type',
    rows: [
      [FIELDS.titleFont, FIELDS.bodyFont],
      [FIELDS.titleSize, FIELDS.weekdaySize],
      [FIELDS.dateSize, FIELDS.holidaySize],
    ],
  },
];

/** Which tab is open. Panel state, not calendar state, so it stays out of the URL. */
let activeTabId = CONTROL_TABS[0].id;

/**
 * Option types, used for both URL parsing and coercing values off DOM inputs.
 */
const OPTION_TYPES = {
  calendarType: { kind: 'enum', values: Object.keys(CALENDAR_TYPES) },
  startYear: { kind: 'integer', min: 1583, max: 4000 },
  startMonth: { kind: 'integer', min: 1, max: 12 },
  monthCount: { kind: 'integer', min: 1, max: 120 },
  weekStart: { kind: 'integer', min: 0, max: 1 },
  orientation: { kind: 'enum', values: ['landscape', 'portrait'] },
  paperSize: { kind: 'enum', values: Object.keys(PAPER_SIZES) },
  titleFont: { kind: 'enum', values: Object.keys(FONT_FAMILIES) },
  bodyFont: { kind: 'enum', values: Object.keys(FONT_FAMILIES) },
  titleSize: { kind: 'enum', values: Object.keys(SIZE_STEPS) },
  weekdaySize: { kind: 'enum', values: Object.keys(SIZE_STEPS) },
  dateSize: { kind: 'enum', values: Object.keys(SIZE_STEPS) },
  holidaySize: { kind: 'enum', values: Object.keys(SIZE_STEPS) },
  gridLines: { kind: 'boolean' },
  gridColor: { kind: 'color' },
  shadeWeekends: { kind: 'boolean' },
  includeNotes: { kind: 'boolean' },
  showAdjacentDays: { kind: 'boolean' },
  holidays: { kind: 'enum', values: Object.keys(HOLIDAY_MODES) },
};

function coerce(key, rawValue) {
  const type = OPTION_TYPES[key];

  if (!type) {
    return undefined;
  }

  if (type.kind === 'boolean') {
    if (typeof rawValue === 'boolean') {
      return rawValue;
    }
    return rawValue === 'true' || rawValue === '1';
  }

  if (type.kind === 'integer') {
    const parsed = Number.parseInt(rawValue, 10);

    if (Number.isNaN(parsed)) {
      return undefined;
    }

    return Math.min(Math.max(parsed, type.min), type.max);
  }

  if (type.kind === 'enum') {
    return type.values.includes(rawValue) ? rawValue : undefined;
  }

  if (type.kind === 'color') {
    return /^#[0-9a-f]{3}([0-9a-f]{3})?$/i.test(rawValue) ? rawValue : undefined;
  }

  return undefined;
}

/**
 * Day Size used to be its own three-step control before the type sizes covered
 * it. Links shared while it existed still carry it, so its values are mapped
 * onto the shared ladder rather than dropped.
 */
const RETIRED_DAY_SIZES = { big: 'largest', small: 'default', tiny: 'smallest' };

/** Merges any recognized query parameters over the defaults. */
export function readOptionsFromUrl(search = window.location.search) {
  const parameters = new URLSearchParams(search);
  const options = { ...DEFAULT_OPTIONS };

  for (const key of Object.keys(OPTION_TYPES)) {
    if (!parameters.has(key)) {
      continue;
    }

    const value = coerce(key, parameters.get(key));

    if (value !== undefined) {
      options[key] = value;
    }
  }

  const retiredDaySize = RETIRED_DAY_SIZES[parameters.get('daySize')];

  if (retiredDaySize && !parameters.has('dateSize')) {
    options.dateSize = retiredDaySize;
  }

  return options;
}

/**
 * Writes only the options that differ from the defaults, so a shared link stays
 * short and readable. Uses replaceState so tweaking controls does not pile up
 * history entries.
 */
export function writeOptionsToUrl(options) {
  const parameters = new URLSearchParams();

  for (const [key, value] of Object.entries(options)) {
    if (value !== DEFAULT_OPTIONS[key]) {
      parameters.set(key, String(value));
    }
  }

  const query = parameters.toString();
  const url = query ? `${window.location.pathname}?${query}` : window.location.pathname;

  window.history.replaceState(null, '', url);
}

/**
 * A stable identity for one control node, used to put keyboard focus back where
 * it was after the panel is redrawn. It has to survive a rebuild, so it is
 * derived from what the control edits rather than from its position.
 */
function toControlId(control, choiceValue) {
  return `${control.key}|${control.type}|${choiceValue ?? ''}`;
}

/**
 * Short option sets render as one segmented control rather than loose pills:
 * two or three mutually exclusive choices read better joined, and the group
 * fills its column instead of leaving a ragged edge.
 */
const MAXIMUM_SEGMENTED_CHOICES = 3;

function createButtonGroup(control, { options, onChange, labelId, disabled }) {
  const group = document.createElement('div');
  group.className = control.choices.length <= MAXIMUM_SEGMENTED_CHOICES
    ? 'option-group is-segmented'
    : 'option-group';
  group.setAttribute('role', 'group');
  group.setAttribute('aria-labelledby', labelId);

  for (const choice of control.choices) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'option-button';
    button.dataset.controlId = toControlId(control, choice.value);
    button.setAttribute('aria-pressed', String(options[control.key] === choice.value));
    button.disabled = disabled;

    const icon = choice.icon ? createIcon(choice.icon) : null;

    if (icon) {
      button.classList.add('has-icon');
      // The label can be visually hidden in a narrow column, so the title
      // keeps it reachable by pointer and the text keeps it in the a11y tree.
      button.title = choice.label;
      button.append(icon);
    }

    const text = document.createElement('span');
    text.className = 'option-button-text';
    text.textContent = choice.label;
    button.append(text);

    button.addEventListener('click', () => onChange(control.key, choice.value));
    group.append(button);
  }

  return group;
}

function createSelect(control, { options, onChange, disabled }) {
  const select = document.createElement('select');
  select.className = 'control-select';
  select.dataset.controlId = toControlId(control);
  select.setAttribute('aria-label', control.ariaLabel ?? control.key);
  select.disabled = disabled;

  for (const choice of control.choices) {
    const option = document.createElement('option');
    option.value = String(choice.value);
    option.textContent = choice.label;
    option.selected = options[control.key] === choice.value;
    select.append(option);
  }

  select.addEventListener('change', () => onChange(control.key, coerce(control.key, select.value)));

  return select;
}

function createNumberInput(control, { options, result, onChange, disabled }) {
  const input = document.createElement('input');
  input.type = 'number';
  input.className = 'control-number';
  input.min = String(control.min);
  input.max = String(control.max);
  input.step = String(control.step ?? 1);
  input.value = String(options[control.key]);
  input.dataset.controlId = toControlId(control);
  input.setAttribute('aria-label', control.ariaLabel ?? control.key);
  input.disabled = disabled;

  input.addEventListener('change', () => {
    const value = coerce(control.key, input.value);
    const accepted = value === undefined ? options[control.key] : value;

    /*
     * Show what was accepted, always. A typed value that clamps back onto the
     * value already in effect produces no change event downstream, so without
     * this the field would sit there displaying a number the app rejected.
     */
    input.value = String(accepted);

    onChange(control.key, accepted);
  });

  if (!control.addon) {
    return input;
  }

  /*
   * Joined to a read-only addon, so the consequence of the number sits against
   * the number itself rather than floating somewhere else in the field.
   */
  const group = document.createElement('div');
  group.className = 'input-group';

  const addon = document.createElement('span');
  addon.className = 'input-group-addon';
  addon.textContent = control.addon(options, result);

  group.append(input, addon);

  return group;
}

function createColorInput(control, { options, onChange, disabled }) {
  const input = document.createElement('input');
  input.type = 'color';
  input.className = 'control-color';
  input.value = options[control.key];
  input.dataset.controlId = toControlId(control);
  input.setAttribute('aria-label', control.ariaLabel ?? control.key);
  input.disabled = disabled;

  /*
   * `change` rather than `input`: the picker fires `input` continuously while
   * the user drags, and every one of those would redraw the panel underneath
   * the open picker and re-render the whole calendar between pointer samples.
   */
  input.addEventListener('change', () => onChange(control.key, input.value));

  return input;
}

const CONTROL_BUILDERS = {
  buttons: createButtonGroup,
  select: createSelect,
  number: createNumberInput,
  color: createColorInput,
};

/**
 * Captures which control has keyboard focus, and where the caret sits inside it
 * if it is a text field, so both can be restored after the panel is redrawn.
 */
function captureFocus(container) {
  const active = document.activeElement;

  if (!active || !container.contains(active) || !active.dataset.controlId) {
    return null;
  }

  const isTextLike = active.tagName === 'INPUT' && active.type === 'number';

  return {
    controlId: active.dataset.controlId,
    selectionStart: isTextLike ? active.selectionStart : null,
    selectionEnd: isTextLike ? active.selectionEnd : null,
  };
}

function restoreFocus(container, captured) {
  if (!captured) {
    return;
  }

  const target = container.querySelector(`[data-control-id="${CSS.escape(captured.controlId)}"]`);

  if (!target) {
    return;
  }

  target.focus();

  if (captured.selectionStart !== null && typeof target.setSelectionRange === 'function') {
    try {
      target.setSelectionRange(captured.selectionStart, captured.selectionEnd);
    } catch {
      // Some input types refuse selection ranges; focus alone is enough.
    }
  }
}

/**
 * A small marker beside a field label carrying a tooltip.
 *
 * The bubble is CSS on `data-tooltip`, so there is nothing to load and nothing
 * to position in script. It is focusable and carries the same text as a label,
 * so the tooltip is reachable by keyboard and read out rather than being purely
 * a hover affordance.
 */
function createLabelMarker(variant, iconName, text) {
  const marker = document.createElement('span');
  marker.className = `control-label-marker is-${variant}`;
  marker.dataset.tooltip = text;
  marker.tabIndex = 0;
  marker.setAttribute('role', 'note');
  marker.setAttribute('aria-label', text);
  marker.append(createIcon(iconName, 'control-label-marker-icon'));

  return marker;
}

function renderField(field, fieldId, options, result, onChange) {
  const disabled = Boolean(field.disabledWhen?.(options));

  const fieldElement = document.createElement('div');
  fieldElement.className = disabled ? 'control-field is-disabled' : 'control-field';

  const labelId = `${fieldId}-label`;
  const labelRow = document.createElement('div');
  labelRow.className = 'control-label-row';

  const label = document.createElement('div');
  label.className = 'control-label';
  label.id = labelId;
  label.textContent = field.label;
  labelRow.append(label);

  /*
   * A mark on the label for a setting that needs something done in the print
   * dialog. It sits outside the labelled element on purpose, so it does not end
   * up inside the accessible name of the controls below it.
   */
  const labelIcon = field.labelIcon?.(options);

  if (labelIcon) {
    labelRow.append(createLabelMarker('warning', labelIcon.name, labelIcon.title));
  }

  const labelInfo = field.labelInfo?.(options);

  if (labelInfo) {
    labelRow.append(createLabelMarker('info', 'info', labelInfo));
  }

  fieldElement.append(labelRow);

  const controlsCell = document.createElement('div');
  controlsCell.className = 'control-controls';

  const context = { options, result, onChange, labelId, disabled };

  for (const control of field.controls) {
    controlsCell.append(CONTROL_BUILDERS[control.type](control, context));
  }

  fieldElement.append(controlsCell);

  const note = disabled ? '' : field.describe?.(options, result);

  if (note) {
    const noteElement = document.createElement('p');
    noteElement.className = 'control-note';
    noteElement.textContent = note;
    fieldElement.append(noteElement);
  }

  return fieldElement;
}

function renderTabList(redraw) {
  const list = document.createElement('div');
  list.className = 'tab-list';
  list.setAttribute('role', 'tablist');
  list.setAttribute('aria-label', 'Option groups');

  CONTROL_TABS.forEach((tab, index) => {
    const isActive = tab.id === activeTabId;

    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'tab';
    button.id = `tab-${tab.id}`;
    button.textContent = tab.label;
    button.dataset.controlId = `tab|${tab.id}`;
    button.setAttribute('role', 'tab');
    button.setAttribute('aria-selected', String(isActive));
    button.setAttribute('aria-controls', `tabpanel-${tab.id}`);

    // Roving tabindex: one stop for the whole set, arrows move between them.
    button.tabIndex = isActive ? 0 : -1;

    button.addEventListener('click', () => {
      activeTabId = tab.id;
      redraw();
    });

    button.addEventListener('keydown', (event) => {
      const step = event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : 0;

      if (!step) {
        return;
      }

      event.preventDefault();
      activeTabId = CONTROL_TABS[(index + step + CONTROL_TABS.length) % CONTROL_TABS.length].id;
      redraw();
    });

    list.append(button);
  });

  return list;
}

/**
 * Rebuilds the panel from scratch on every change. The panel is a couple of
 * dozen nodes, so the simplicity of a full redraw beats diffing, and it removes
 * any chance of a control drifting out of sync with the options it edits. The
 * cost is that the focused node is destroyed mid-interaction, so focus is
 * captured and put back by control identity rather than by position.
 */
export function renderControls(container, options, result, onChange) {
  const captured = captureFocus(container);
  const redraw = () => renderControls(container, options, result, onChange);
  const fragment = document.createDocumentFragment();

  fragment.append(renderTabList(redraw));

  const activeTab = CONTROL_TABS.find((tab) => tab.id === activeTabId) ?? CONTROL_TABS[0];

  const panel = document.createElement('div');
  panel.className = 'tab-panel';
  panel.id = `tabpanel-${activeTab.id}`;
  panel.setAttribute('role', 'tabpanel');
  panel.setAttribute('aria-labelledby', `tab-${activeTab.id}`);

  activeTab.rows.forEach((row, rowIndex) => {
    const rowElement = document.createElement('div');
    rowElement.className = row.length > 1 ? 'control-row is-split' : 'control-row';

    row.forEach((field, fieldIndex) => {
      rowElement.append(
        renderField(field, `control-${activeTab.id}-${rowIndex}-${fieldIndex}`, options, result, onChange),
      );
    });

    panel.append(rowElement);
  });

  fragment.append(panel);

  container.replaceChildren(fragment);
  restoreFocus(container, captured);
}
