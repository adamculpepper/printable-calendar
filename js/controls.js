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
  DAY_SIZES,
  DEFAULT_OPTIONS,
  GRID_COLORS,
  HOLIDAY_MODES,
  MONTH_NAMES,
  PAPER_SIZES,
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
 * Icons for the two options whose labels do not survive a half-width column.
 *
 * Drawn as inline SVG rectangles rather than pulled from an icon font: the app
 * loads no external assets, and these shapes say what they mean. Orientation is
 * the shape of the sheet. Day Size is a cell with the date number in its
 * corner, drawn at the size that option produces.
 */
const ICON_SHAPES = {
  landscape: [{ x: 1.5, y: 4.5, width: 17, height: 11, rx: 1.2 }],
  portrait: [{ x: 4.5, y: 1.5, width: 11, height: 17, rx: 1.2 }],
  'day-big': [
    { x: 2.5, y: 2.5, width: 15, height: 15, rx: 1.2 },
    { x: 6.6, y: 5, width: 8.6, height: 8.6, rx: 0.8, filled: true },
  ],
  'day-small': [
    { x: 2.5, y: 2.5, width: 15, height: 15, rx: 1.2 },
    { x: 10.4, y: 5, width: 4.8, height: 4.8, rx: 0.6, filled: true },
  ],
  'day-tiny': [
    { x: 2.5, y: 2.5, width: 15, height: 15, rx: 1.2 },
    { x: 12.8, y: 5, width: 2.4, height: 2.4, rx: 0.3, filled: true },
  ],
};

const SVG_NAMESPACE = 'http://www.w3.org/2000/svg';

function createIcon(name) {
  const shapes = ICON_SHAPES[name];

  if (!shapes) {
    return null;
  }

  const svg = document.createElementNS(SVG_NAMESPACE, 'svg');
  svg.setAttribute('class', 'option-icon');
  svg.setAttribute('viewBox', '0 0 20 20');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('focusable', 'false');

  for (const shape of shapes) {
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
    label: 'Months',
    labelHint: (options, result) =>
      `${result.pageCount} ${result.pageCount === 1 ? 'page' : 'pages'}`,
    controls: [
      { type: 'number', key: 'monthCount', min: 1, max: 120, step: 1, ariaLabel: 'Number of months' },
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
  daySize: {
    label: 'Day Size',
    controls: [
      {
        type: 'buttons',
        key: 'daySize',
        choices: [
          { value: 'big', label: 'Big', icon: 'day-big' },
          { value: 'small', label: 'Small', icon: 'day-small' },
          { value: 'tiny', label: 'Tiny', icon: 'day-tiny' },
        ],
      },
    ],
    describe: () => 'Scales the date numbers.',
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
    describe: (options) =>
      options.shadeWeekends ? 'Needs "Background graphics" on when printing.' : '',
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
    controls: [{ type: 'buttons', key: 'holidays', choices: toChoices(HOLIDAY_MODES) }],
    describe: (options) => (options.holidays === 'none' ? '' : 'US only, from holidate.'),
  },
};

/**
 * Rows, in panel order. Two fields on a row share it evenly; the narrow options
 * are paired off so the whole panel stays within a screen.
 */
const CONTROL_ROWS = [
  [FIELDS.calendarType, FIELDS.paperSize],
  [FIELDS.year],
  [FIELDS.startMonth, FIELDS.monthCount],
  [FIELDS.orientation, FIELDS.daySize],
  [FIELDS.weekStart, FIELDS.shadeWeekends],
  [FIELDS.gridLines, FIELDS.gridColor],
  [FIELDS.includeNotes, FIELDS.showAdjacentDays],
  [FIELDS.holidays],
];

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
  daySize: { kind: 'enum', values: Object.keys(DAY_SIZES) },
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

function createNumberInput(control, { options, onChange, disabled }) {
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

  return input;
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
   * Read-only text that annotates the label, such as how many pages the current
   * month count produces. It sits outside the labelled element on purpose, so
   * it does not end up inside the accessible name of the controls below.
   */
  const labelHint = field.labelHint?.(options, result);

  if (labelHint) {
    const hint = document.createElement('span');
    hint.className = 'control-label-hint';
    hint.textContent = labelHint;
    labelRow.append(hint);
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

/**
 * Rebuilds the panel from scratch on every change. The panel is a couple of
 * dozen nodes, so the simplicity of a full redraw beats diffing, and it removes
 * any chance of a control drifting out of sync with the options it edits. The
 * cost is that the focused node is destroyed mid-interaction, so focus is
 * captured and put back by control identity rather than by position.
 */
export function renderControls(container, options, result, onChange) {
  const captured = captureFocus(container);
  const fragment = document.createDocumentFragment();

  CONTROL_ROWS.forEach((row, rowIndex) => {
    const rowElement = document.createElement('div');
    rowElement.className = row.length > 1 ? 'control-row is-split' : 'control-row';

    row.forEach((field, fieldIndex) => {
      rowElement.append(
        renderField(field, `control-${rowIndex}-${fieldIndex}`, options, result, onChange),
      );
    });

    fragment.append(rowElement);
  });

  container.replaceChildren(fragment);
  restoreFocus(container, captured);
}
