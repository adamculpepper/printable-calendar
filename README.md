# Printable Calendar

A calendar generator that produces clean PDFs from the browser's own print dialog. Nothing gets
printed except the calendar itself: no watermark, no site name down in the corner. Just the grid
and as much blank writing space per day as the paper allows.

It is a static site with no build step and no framework. Two things reach the network: a font, if
you pick one other than System, and Google Analytics. Neither of them affects what prints. Open
`index.html` from a local server and everything works.

## Quick start

```bash
npm install     # holidate, plus browser-sync and pdf-lib for local dev and verification
npm run vendor  # regenerates vendor/holidate/holidate.js from the installed package
npm start       # serves the app at http://localhost:3000
```

The app uses ES modules, so it needs to be served over HTTP. Opening `index.html` straight off
the filesystem will not work, because Chrome blocks module scripts on `file://`.

To get a PDF: set the options, press Print, then choose "Save as PDF" in the dialog. The panel
tells you which paper size and orientation to pick for whatever you have configured.

## Options

| Option | Values |
| --- | --- |
| Calendar Type | Monthly (1 month per page), Two Month, Four Month, Six Months, Yearly (12 on one sheet) |
| Year | 2025, 2026, 2027, or anything you type |
| Starting Month | Any month. The run continues from there and rolls over the year boundary. |
| Months | 1 to 120 |
| Title Font | System, or any of 17 Google families. Applies to the month and year heading. |
| Everything Else | Same list, applied to weekdays, dates and holiday names. |
| Title / Weekday / Date / Holiday Size | Five steps from Smallest to Largest. These scale the measured defaults rather than setting absolute sizes, so type still adapts to the paper and the cell and cannot be pushed to something that will not fit. |
| Orientation | Landscape or Portrait |
| Paper Size | Letter, 11x17, Legal, Poster, Movie Poster, A4 |
| Notes | Ruled column beside the grid on single-month sheets, ruled strip along the bottom on multi-month sheets |
| Weekends | Plain or shaded |
| Grid Lines | On or off |
| Grid Color | Gray, black, or a custom color |
| Weekday Starts | Sunday or Monday |
| Adjacent Days | Hide, or print the neighboring months' dates grayed out |
| Holidays | Off, US federal only, or federal plus common observances and the Easter dates |

Every option is written to the query string, so a configuration is a link you can bookmark or
send to someone. Only the values that differ from the defaults appear, which keeps the URL short.

## How the print layout works

This is the part that decides whether the output is usable, so it is worth explaining.

In a print context the viewport is not the page. Anything sized with `vh`, or with `100%` of the
body, or with a flex-fill trick that leans on viewport height, measures the wrong box and falls
apart the moment it reaches a printer. So none of that is used here.

Instead `js/layout.js` starts from the physical sheet. Paper dimensions live in `js/config.js` in
exact millimeters, and every measurement downstream stays in millimeters, so no calculation ever
mixes inches with millimeters inside a `calc()`. The printable area is the sheet minus its
margins. The title block, the weekday strip and the notes area are each subtracted from that, and
whatever remains is handed to the day grid as an explicit height. The grid then divides it with
`grid-auto-rows: 1fr`.

That last detail is what makes a five-row month stretch to the same bottom edge as a six-row
month, with taller cells. It looks different from month to month and that is intended: the sheet
always fills to the bottom margin.

A few other things that matter on paper:

- Grid lines are borders, never background fills, so they still print when "Background graphics"
  is switched off in the dialog. Weekend shading is the one exception, since a fill is the only
  way to shade a column, and the panel says so when you turn it on.
- Weekend shading is kept much lighter than the grid color. A mid gray fill swallows a mid gray
  hairline, which is the failure mode you see on a lot of printable calendars. The tint is
  derived from the grid color's luminance, so it stays out of the way even if you pick a custom
  color.
- Only the sheets between pages force a page break. The last one does not, which is what stops a
  blank thirteenth page appearing at the end of a twelve month run.
- Four tenths of a millimeter is trimmed off the printable height of every page. A page sized to
  exactly the printable area is a coin flip in Chrome, because any sub-pixel rounding tips it over
  the page box and emits a blank trailer. The trim is invisible on paper and removes the question.
- System font stack only, so there is no font to load and nothing to go wrong mid-print.
- Type is sized against the cell it sits in, not against a fixed scale, so a five-row month gets
  larger date numbers than a six-row one. The ratios come from measuring print-a-calendar.com's
  own rendered sheet: date numbers at about 0.21 of the cell height on Small and 0.29 on Big,
  weekday labels slightly larger than the date numbers, and a month title about 2.5 times the
  date numbers. Everything here lands within a few percent of those.
- `css/calendar.css` stands alone. It carries its own box-sizing reset and its own print rules
  rather than borrowing them from the app stylesheet, because the downloaded file ships that one
  sheet and nothing else.

## Verification

Claims about print output are worth very little unless something actually prints, so
`scripts/verify-print.mjs` drives real headless Chrome over the DevTools protocol. It serves the
app, navigates to each configuration, asks Chrome for a PDF the same way "Save as PDF" does, and
then checks the bytes that come back.

```bash
npm run verify       # 24 configurations plus the download path
npm run verify:full  # adds every calendar type x orientation x paper size
```

Each case asserts that the PDF has exactly the expected page count with no blank trailer, that
every sheet measures the paper size that was requested (checked in PDF points), that nothing
overflows a sheet, that content reaches the bottom margin, and that the day grid rows came out
equal height. Date arithmetic is checked separately by importing `js/date-utils.js` straight into
node, including leap years, both week starts, and every month from 2024 through 2028. Easter is
checked against dates a real calendar agrees on, at both ends of the range it can fall in.

The downloaded file gets printed too, across six layouts. That last part is not padding. An
earlier version of this code passed 576 assertions while every multi-month download quietly came
out a page long, because the day grid was relying on a box-sizing reset that lived in the app
stylesheet and the export does not ship that file. A single-row monthly sheet absorbs the extra
hairline; anything denser does not. The only thing that catches it is printing the exported file
and counting pages, so that is what the harness now does.

Type scales are checked without a browser too. Pushing every size to its largest on every calendar
type and paper size has to leave the date inside half the cell height and the title and weekday
labels inside their bands, which is what stops a size control from being able to produce a sheet
that does not fit.

The full matrix is 80 configurations and 700 assertions. It passes.

There is also `scripts/capture-preview.mjs`, which renders a handful of configurations to PNG in
`.tmp/preview` so the layout can be reviewed by eye rather than only by assertion.

## Fonts

Type is set in the system font stack by default, and nothing is fetched in that state. Pick a
family from the Type tab and the page adds a `<link>` to Google Fonts for the one or two families
in use, dropping it again if you go back to System.

Two things follow from that. Every stack ends in the system fonts, so a blocked or missing network
degrades to the original typography rather than to nothing. And the Print button waits on
`document.fonts.ready` (capped at a second and a half) before opening the dialog, because Chrome
will otherwise happily print a page whose webfont is still in flight, which puts fallback metrics
on the paper.

The downloaded HTML carries the same `<link>`, so it keeps the typography you chose. That link is
the only thing in the file that needs a network; without it the calendar falls back to the system
fonts and still prints correctly.

Sizes are scales rather than absolute values. Each control multiplies the measured default, so
type continues to adapt to the paper and the cell, and the bounds hold whatever combination is
selected.

## Holidays

Holiday data comes from [holidate](https://github.com/zachnology/holidate), an MIT-licensed
library by Zachary Gomez, installed from npm and vendored into `vendor/holidate/holidate.js` by
`npm run vendor`. The copyright notice in the generated file is lifted from the upstream license
rather than retyped. The package ships as
CommonJS across three files, so the vendor script wraps the sources verbatim in a small module
shim rather than copying them by hand and letting them drift. File hashes are recorded in the
generated header.

holidate covers the United States only, so the Holidays control is US only by definition. It
handles the observed-date rule, which is why you will see both June 19 2027 and the Friday before
it marked: Juneteenth falls on a Saturday that year.

Two things are corrected on the way through, both in `js/holidays.js`:

Easter is recomputed. holidate derives it from a fixed golden-number table with no century
correction, which is right for roughly 1900 to 2199 and wrong outside that, and the year field
accepts a much wider range than that. Easter and the four dates that hang off it (Good Friday,
Palm Sunday, Ash Wednesday, Mardi Gras) are all a fixed number of days from it, so one corrected
anchor moves the whole set.

Where two holidays share a date, the federal one wins the cell. June 19 2022 was both Juneteenth
and Father's Day, and without an explicit precedence rule the cell printed as Father's Day.

Holiday names print small and light along the bottom of the cell, on a single line, truncated
rather than wrapped. Two federal holidays have names long enough to swamp a cell even so, and
those are shortened. Where cells are too narrow for a name at all, the date is bolded and given a
small ring, with the full name available to screen readers and on hover.

## Assumptions

Worth stating plainly, since the reference site does not publish its own:

Poster is taken as 18 x 24 in, and Movie Poster as 27 x 40 in, the US one sheet. Neither size has
a single standard, so both live in `PAPER_SIZES` in `js/config.js` if you want different numbers.

Margins are 0.35 in where the reference uses 0.5 in. That is a deliberate difference: the point of
this calendar is writing space, and the reference also stops its grid short of the bottom margin
where this one fills to it.

Day Size controls the typographic scale of the date numbers. It does not shrink the grid, because
the grid filling the sheet is a hard requirement here.

Download HTML saves a self-contained file with no scripts in it, not a PDF. Generating a real PDF
would mean pulling in a PDF library, and the browser already makes better ones. Print is the PDF
path.

## Files

```
index.html                    markup shell
css/app.css                   the options panel, screen only
css/calendar.css              the printed artifact, screen preview and print
js/analytics.js               Google Analytics config, loaded as a classic script
js/config.js                  paper sizes, calendar types, defaults
js/date-utils.js              month grids, week starts, leap years, rollover
js/holidays.js                adapter over vendored holidate, date-keyed lookups
js/layout.js                  page box arithmetic, the @page rule, weekend tint
js/render.js                  DOM generation
js/controls.js                the options panel and the URL round trip
js/app.js                     wiring, print, download
scripts/lib/browser.mjs       static server, headless Chrome, minimal CDP client
scripts/vendor-holidate.mjs   npm package to browser module
scripts/verify-print.mjs      headless Chrome, real PDFs, assertions
scripts/capture-preview.mjs   PNG renders for eyeballing
vendor/holidate/              generated, MIT, do not edit by hand
```
