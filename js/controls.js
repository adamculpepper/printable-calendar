/**
 * The options panel, and the URL round-trip that makes a configuration
 * shareable.
 *
 * Rows are described declaratively so index.html stays a shell and there is
 * exactly one list to edit when an option is added. Each row can hold more than
 * one control bound to the same option, which is how Year offers both quick
 * buttons and a free-entry field.
 */

import {
  CALENDAR_TYPES,
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

const CONTROL_ROWS = [
  {
    label: 'Calendar Type',
    controls: [{ type: 'buttons', key: 'calendarType', choices: toChoices(CALENDAR_TYPES) }],
    describe: (options) => CALENDAR_TYPES[options.calendarType].note,
  },
  {
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
  {
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
  {
    label: 'Months',
    controls: [
      { type: 'number', key: 'monthCount', min: 1, max: 120, step: 1, ariaLabel: 'Number of months' },
    ],
    describe: (options, result) =>
      `${options.monthCount} months across ${result.pageCount} ${result.pageCount === 1 ? 'page' : 'pages'}`,
  },
  {
    label: 'Day Size',
    controls: [
      {
        type: 'buttons',
        key: 'daySize',
        choices: [
          { value: 'big', label: 'Big' },
          { value: 'small', label: 'Small' },
        ],
      },
    ],
    describe: () => 'Scales the date numbers. The grid fills the sheet either way.',
  },
  {
    label: 'Orientation',
    controls: [
      {
        type: 'buttons',
        key: 'orientation',
        choices: [
          { value: 'landscape', label: 'Landscape' },
          { value: 'portrait', label: 'Portrait' },
        ],
      },
    ],
  },
  {
    label: 'Paper Size',
    controls: [{ type: 'buttons', key: 'paperSize', choices: toChoices(PAPER_SIZES) }],
    describe: (options) => PAPER_SIZES[options.paperSize].note,
  },
  {
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
        : 'Ruled strip along the bottom of the sheet.';
    },
  },
  {
    label: 'Weekends',
    controls: [
      {
        type: 'buttons',
        key: 'shadeWeekends',
        choices: [
          { value: false, label: 'Not Shaded' },
          { value: true, label: 'Shaded' },
        ],
      },
    ],
    describe: (options) =>
      options.shadeWeekends
        ? 'A light tint, kept well clear of the grid color so the lines stay visible. Needs "Background graphics" enabled when printing.'
        : '',
  },
  {
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
  {
    label: 'Grid Color',
    visibleWhen: (options) => options.gridLines,
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
  {
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
  {
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
    describe: (options) =>
      options.showAdjacentDays ? 'Grayed-out dates from the neighboring months.' : '',
  },
  {
    label: 'Holidays',
    controls: [{ type: 'buttons', key: 'holidays', choices: toChoices(HOLIDAY_MODES) }],
    describe: (options) =>
      options.holidays === 'none' ? '' : 'US holidays only, from the holidate package.',
  },
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
  daySize: { kind: 'enum', values: ['big', 'small'] },
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

/** Merges any recognised query parameters over the defaults. */
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

function createButtonGroup(control, options, onChange, labelId) {
  const group = document.createElement('div');
  group.className = 'control-options';
  group.setAttribute('role', 'group');
  group.setAttribute('aria-labelledby', labelId);

  for (const choice of control.choices) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'option-button';
    button.textContent = choice.label;
    button.dataset.controlId = toControlId(control, choice.value);
    button.setAttribute('aria-pressed', String(options[control.key] === choice.value));
    button.addEventListener('click', () => onChange(control.key, choice.value));
    group.append(button);
  }

  return group;
}

function createSelect(control, options, onChange) {
  const select = document.createElement('select');
  select.className = 'control-select';
  select.dataset.controlId = toControlId(control);
  select.setAttribute('aria-label', control.ariaLabel ?? control.key);

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

function createNumberInput(control, options, onChange) {
  const input = document.createElement('input');
  input.type = 'number';
  input.className = 'control-number';
  input.min = String(control.min);
  input.max = String(control.max);
  input.step = String(control.step ?? 1);
  input.value = String(options[control.key]);
  input.dataset.controlId = toControlId(control);
  input.setAttribute('aria-label', control.ariaLabel ?? control.key);

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

function createColorInput(control, options, onChange) {
  const input = document.createElement('input');
  input.type = 'color';
  input.className = 'control-color';
  input.value = options[control.key];
  input.dataset.controlId = toControlId(control);
  input.setAttribute('aria-label', control.ariaLabel ?? control.key);

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
    if (row.visibleWhen && !row.visibleWhen(options)) {
      return;
    }

    const rowElement = document.createElement('div');
    rowElement.className = 'control-row';

    const labelId = `control-label-${rowIndex}`;
    const label = document.createElement('div');
    label.className = 'control-label';
    label.id = labelId;
    label.textContent = row.label;
    rowElement.append(label);

    const controlsCell = document.createElement('div');
    controlsCell.className = 'control-options';

    for (const control of row.controls) {
      controlsCell.append(CONTROL_BUILDERS[control.type](control, options, onChange, labelId));
    }

    rowElement.append(controlsCell);

    const note = row.describe?.(options, result);

    if (note) {
      const noteElement = document.createElement('p');
      noteElement.className = 'control-note';
      noteElement.textContent = note;
      rowElement.append(noteElement);
    }

    fragment.append(rowElement);
  });

  container.replaceChildren(fragment);
  restoreFocus(container, captured);
}
