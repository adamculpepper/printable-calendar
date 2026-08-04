/**
 * Turns a set of options into absolute page geometry.
 *
 * This module is the reason the printed output is trustworthy. Nothing here is
 * expressed as a percentage of the viewport: the page box comes from the paper
 * size, the printable area is the page box minus its margins, and every band
 * inside it (title, weekday strip, day grid, notes) is subtracted from that in
 * millimeters. The day grid is then handed an explicit height and told to
 * divide it with `grid-auto-rows: 1fr`, which is what makes a five-row month
 * stretch to the bottom margin exactly as a six-row month does.
 *
 * `vh`, `100%`-of-body and flex-fill would all measure the viewport rather than
 * the sheet, and none of them survive the trip into a print context.
 */

import {
  CALENDAR_TYPES,
  DATE_FONT_OVER_CELL_HEIGHT,
  FONT_FAMILIES,
  PAGE_HEIGHT_SAFETY_MM,
  POSSIBLE_WEEK_COUNTS,
  applyOrientation,
  getSizeScale,
} from './config.js';

function clamp(value, minimum, maximum) {
  return Math.min(Math.max(value, minimum), maximum);
}

/** Millimeters, rounded to a precision well below what any printer resolves. */
function mm(value) {
  return `${Math.round(value * 1000) / 1000}mm`;
}

/**
 * Relative luminance, used to keep weekend shading lighter than the grid lines.
 */
function relativeLuminance(hexColor) {
  const normalized = hexColor.replace('#', '');
  const expanded = normalized.length === 3
    ? normalized.split('').map((character) => character + character).join('')
    : normalized;

  const channels = [0, 2, 4].map((offset) => {
    const channel = parseInt(expanded.slice(offset, offset + 2), 16) / 255;
    return channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
  });

  return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
}

/**
 * Weekend shading has one job it must not break: the grid lines have to stay
 * visible through it. A mid-gray fill swallows a mid-gray hairline, which is
 * exactly the failure this avoids. The tint starts very light and is lightened
 * further if the chosen grid color is itself pale, so the hairline always wins.
 */
export function resolveWeekendShade(gridColor) {
  const BASE_SHADE_LUMINANCE = 0.9;
  const MINIMUM_LUMINANCE_GAP = 0.25;

  let shadeLuminance = BASE_SHADE_LUMINANCE;
  const gridLuminance = relativeLuminance(gridColor);

  if (shadeLuminance - gridLuminance < MINIMUM_LUMINANCE_GAP) {
    shadeLuminance = Math.min(0.97, gridLuminance + MINIMUM_LUMINANCE_GAP);
  }

  // Invert sRGB companding to get back to a channel value for a neutral gray.
  const linear = shadeLuminance;
  const channel = linear <= 0.0031308
    ? linear * 12.92
    : 1.055 * linear ** (1 / 2.4) - 0.055;

  const byteValue = clamp(Math.round(channel * 255), 0, 255);
  const hex = byteValue.toString(16).padStart(2, '0');

  return `#${hex}${hex}${hex}`;
}

/**
 * Computes the geometry for one sheet and everything nested inside it.
 *
 * Returns both a flat map of CSS custom properties (consumed by a generated
 * <style> block, never by inline attributes) and a few plain booleans the
 * renderer branches on, such as whether a cell is wide enough to spell out a
 * holiday name instead of marking it with a dot.
 */
export function computeLayout(options) {
  const calendarType = CALENDAR_TYPES[options.calendarType] ?? CALENDAR_TYPES.monthly;
  const paper = applyOrientation(options.paperSize, options.orientation);
  const arrangement = calendarType.arrangement[options.orientation];

  /*
   * Type scales multiply the measured defaults rather than replacing them with
   * absolute sizes, so every size still adapts to the paper and the cell and
   * cannot be set to something that will not fit.
   */
  const titleScale = getSizeScale(options.titleSize);
  const weekdayScale = getSizeScale(options.weekdaySize);
  const dateScale = getSizeScale(options.dateSize);
  const holidayScale = getSizeScale(options.holidaySize);

  const titleFontStack = (FONT_FAMILIES[options.titleFont] ?? FONT_FAMILIES.system).stack;
  const bodyFontStack = (FONT_FAMILIES[options.bodyFont] ?? FONT_FAMILIES.system).stack;

  const printableWidthMm = paper.widthMm - paper.marginMm * 2;
  const printableHeightMm = paper.heightMm - paper.marginMm * 2 - PAGE_HEIGHT_SAFETY_MM;

  const isSingleMonthPerPage = calendarType.monthsPerPage === 1;

  /*
   * Hairlines are specified in millimeters rather than pixels so a 27x40 poster
   * gets a proportionally visible line instead of an invisible one. The floor
   * is 0.25mm, which is what the reference sheet uses and is also the point
   * below which a line starts rendering unevenly on screen: at 96dpi a thinner
   * rule lands on a fraction of a pixel and some columns come out invisible.
   */
  const gridLineWidthMm = clamp(printableWidthMm * 0.0005, 0.25, 0.5);

  const gutterMm = isSingleMonthPerPage
    ? 0
    : clamp(printableWidthMm * 0.018, 2, 10);

  /**
   * Notes sit beside the grid when there is only one month on the sheet, and
   * drop to a strip along the bottom for multi-month layouts, where a side
   * column would squeeze the month blocks out of shape.
   */
  const notesPlacement = options.includeNotes
    ? (isSingleMonthPerPage ? 'column' : 'strip')
    : 'none';

  const notesColumnWidthMm = notesPlacement === 'column'
    ? clamp(printableWidthMm * 0.2, 30, 75)
    : 0;

  const notesStripHeightMm = notesPlacement === 'strip'
    ? clamp(printableHeightMm * 0.11, 14, 45)
    : 0;

  const bodyWidthMm = printableWidthMm - notesColumnWidthMm - (notesColumnWidthMm ? gutterMm || 6 : 0);
  const bodyHeightMm = printableHeightMm - notesStripHeightMm - (notesStripHeightMm ? gutterMm || 6 : 0);

  const blockWidthMm = (bodyWidthMm - gutterMm * (arrangement.columns - 1)) / arrangement.columns;
  const blockHeightMm = (bodyHeightMm - gutterMm * (arrangement.rows - 1)) / arrangement.rows;

  // Title and weekday strip take a share of each month block. Single-month
  // pages get a generous masthead; dense layouts get a compact caption.
  const titleHeightMm = isSingleMonthPerPage
    ? clamp(blockHeightMm * 0.1, 8, 26)
    : clamp(blockHeightMm * 0.13, 4.5, 16);

  const weekdayRowHeightMm = isSingleMonthPerPage
    ? clamp(blockHeightMm * 0.05, 4.5, 12)
    : clamp(blockHeightMm * 0.08, 3, 9);

  const dayGridHeightMm = blockHeightMm - titleHeightMm - weekdayRowHeightMm;
  const cellWidthMm = blockWidthMm / 7;

  // Six rows is the worst case for any month, so type is sized against it and
  // never overflows a six-row month.
  const worstCaseCellHeightMm = dayGridHeightMm / 6;

  const titleFontMm = isSingleMonthPerPage
    ? clamp(titleHeightMm * 0.66 * titleScale, 4, titleHeightMm * 0.95)
    : clamp(titleHeightMm * 0.6 * titleScale, 2.6, titleHeightMm * 0.95);

  const weekdayFontMm = clamp(
    Math.min(weekdayRowHeightMm * 0.72, cellWidthMm * 0.26) * weekdayScale,
    1.7,
    Math.min(weekdayRowHeightMm * 0.95, cellWidthMm * 0.34),
  );

  /**
   * Date numbers are sized against the cell they actually land in, not against
   * the six-row worst case, which is how the reference behaves: a five-row
   * month has taller cells and correspondingly larger numbers. One value per
   * possible week count is emitted and the stylesheet picks by `data-weeks`,
   * so the arithmetic stays here rather than leaking into CSS.
   */
  const dateFontByWeekCount = Object.fromEntries(
    POSSIBLE_WEEK_COUNTS.map((weekCount) => {
      const cellHeightMm = dayGridHeightMm / weekCount;

      return [
        weekCount,
        clamp(
          Math.min(cellHeightMm * DATE_FONT_OVER_CELL_HEIGHT, cellWidthMm * 0.3) * dateScale,
          1.9,
          // Never taller than half the cell, so a large scale on a dense layout
          // still leaves the cell usable rather than filling it with a numeral.
          Math.min(cellHeightMm * 0.5, cellWidthMm * 0.45),
        ),
      ];
    }),
  );

  // The six-row value is the safe default and the basis for anything derived.
  const dateFontMm = dateFontByWeekCount[6];

  // 0.077 puts the date number the same distance off the cell edge as the
  // reference sheet, measured at about 0.059 of the cell width.
  const cellPaddingMm = clamp(Math.min(cellWidthMm, worstCaseCellHeightMm) * 0.077, 0.5, 3.3);
  const holidayFontMm = clamp(dateFontMm * 0.42 * holidayScale, 1.4, 5);

  /*
   * A holiday name needs room in both directions. Width decides whether it can
   * be read at all; height decides whether it would be drawn and then clipped
   * by the cell, which looks like a rendering fault rather than a choice. The
   * name sits on one line along the bottom of the cell, so one line is what has
   * to fit clear of the date number.
   */
  const holidayNameMinimumCellWidthMm = 22;
  const holidayNameLineHeight = 1.2;
  const roomUnderDateMm = worstCaseCellHeightMm - cellPaddingMm * 2 - dateFontMm;

  const showHolidayNames =
    options.holidays !== 'none' &&
    cellWidthMm >= holidayNameMinimumCellWidthMm &&
    roomUnderDateMm >= holidayFontMm * holidayNameLineHeight;

  /*
   * Ruled lines take their pitch from the area they rule. The bottom strip is a
   * fixed slice of the sheet and has nothing to do with how tall a day cell
   * came out; only the side column has a reason to echo that rhythm.
   */
  const notesLineHeightMm = notesPlacement === 'strip'
    ? clamp(notesStripHeightMm / 5, 4, 9)
    : clamp(worstCaseCellHeightMm * 0.35, 5, 12);

  // Below roughly nine millimeters a three-letter label no longer fits the
  // column, so the header falls back to single initials.
  const weekdayLabelStyle = cellWidthMm >= 9 ? 'short' : 'minimal';

  return {
    calendarType,
    arrangement,
    monthsPerPage: calendarType.monthsPerPage,
    notesPlacement,
    showHolidayNames,
    weekdayLabelStyle,
    paper,
    /**
     * Raw millimeter values for the few decisions the renderer makes in JS,
     * such as how many ruled lines fit in the notes area.
     */
    metrics: {
      printableWidthMm,
      printableHeightMm,
      bodyWidthMm,
      bodyHeightMm,
      blockWidthMm,
      blockHeightMm,
      titleHeightMm,
      weekdayRowHeightMm,
      dayGridHeightMm,
      cellWidthMm,
      worstCaseCellHeightMm,
      titleFontMm,
      weekdayFontMm,
      dateFontMm,
      holidayFontMm,
      notesColumnWidthMm,
      notesStripHeightMm,
      notesLineHeightMm,
      gridLineWidthMm,
    },
    customProperties: {
      '--page-width': mm(paper.widthMm),
      '--page-height': mm(paper.heightMm),
      '--page-margin': mm(paper.marginMm),
      '--printable-width': mm(printableWidthMm),
      '--printable-height': mm(printableHeightMm),
      '--body-width': mm(bodyWidthMm),
      '--body-height': mm(bodyHeightMm),
      '--month-columns': String(arrangement.columns),
      '--month-rows': String(arrangement.rows),
      '--block-width': mm(blockWidthMm),
      '--block-height': mm(blockHeightMm),
      '--gutter': mm(gutterMm || 0),
      '--title-height': mm(titleHeightMm),
      '--weekday-row-height': mm(weekdayRowHeightMm),
      '--day-grid-height': mm(dayGridHeightMm),
      '--cell-padding': mm(cellPaddingMm),
      '--grid-line-width': mm(options.gridLines ? gridLineWidthMm : 0),
      // The reference draws its outer box at roughly twice the inner hairline,
      // which reads as a frame rather than just another grid line.
      '--grid-line-outer-width': mm(options.gridLines ? gridLineWidthMm * 2 : 0),
      '--grid-color': options.gridLines ? options.gridColor : 'transparent',
      '--weekend-shade': options.shadeWeekends
        ? resolveWeekendShade(options.gridColor)
        : 'transparent',
      '--title-family': titleFontStack,
      '--body-family': bodyFontStack,
      '--title-font': mm(titleFontMm),
      '--weekday-font': mm(weekdayFontMm),
      '--date-font': mm(dateFontMm),
      '--date-font-4': mm(dateFontByWeekCount[4]),
      '--date-font-5': mm(dateFontByWeekCount[5]),
      '--date-font-6': mm(dateFontByWeekCount[6]),
      '--holiday-font': mm(holidayFontMm),
      '--notes-column-width': mm(notesColumnWidthMm),
      '--notes-strip-height': mm(notesStripHeightMm),
      '--notes-line-height': mm(notesLineHeightMm),
      // Ruled note lines are their own feature: they stay visible even when the
      // day grid's lines are switched off.
      '--notes-rule-color': options.gridColor,
      '--notes-rule-width': mm(gridLineWidthMm),
      '--notes-gap': mm(notesPlacement === 'none' ? 0 : (gutterMm || 6)),
    },
  };
}

/**
 * The `@page` rule and the custom properties, as a stylesheet string.
 *
 * `size` is emitted with explicit width and height rather than the `landscape`
 * keyword so that every paper option, including the non-standard poster sizes,
 * describes an exact sheet to the print engine.
 */
export function buildPageStylesheet(layout) {
  const declarations = Object.entries(layout.customProperties)
    .map(([property, value]) => `  ${property}: ${value};`)
    .join('\n');

  return `@page {
  size: ${mm(layout.paper.widthMm)} ${mm(layout.paper.heightMm)};
  margin: ${mm(layout.paper.marginMm)};
}

:root {
${declarations}
}
`;
}
