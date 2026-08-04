/**
 * Renders option combinations to PNG so the layout can be reviewed by eye
 * rather than only by assertion. Development aid; output is gitignored.
 *
 *   node scripts/capture-preview.mjs
 *   node scripts/capture-preview.mjs "startYear=2027&startMonth=6&holidays=all"
 *
 * With a query string it shoots just that one configuration, which is the quick
 * way to look at a specific month you are suspicious of.
 */

import { writeFileSync, mkdirSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';

import { withBrowser } from './lib/browser.mjs';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const outputDir = resolve(repoRoot, '.tmp/preview');

const SHOTS = [
  { name: '01-monthly-default', query: '' },
  { name: '02-monthly-shaded-holidays', query: 'shadeWeekends=true&holidays=all&showAdjacentDays=true' },
  { name: '03-monthly-notes-big', query: 'includeNotes=true&daySize=big' },
  { name: '04-two-month', query: 'calendarType=two-month' },
  { name: '05-four-month-notes', query: 'calendarType=four-month&includeNotes=true' },
  { name: '06-six-month', query: 'calendarType=six-month&shadeWeekends=true' },
  { name: '07-yearly', query: 'calendarType=yearly&holidays=federal' },
  { name: '08-portrait-a4', query: 'orientation=portrait&paperSize=a4&weekStart=0' },
  { name: '09-grid-black-shaded', query: 'gridColor=%23000000&shadeWeekends=true' },
  { name: '10-app-chrome', query: 'shadeWeekends=true&holidays=all', fullPage: true },
];

const requestedQuery = process.argv[2];
const shots = requestedQuery ? [{ name: 'custom', query: requestedQuery }] : SHOTS;

async function run() {
  mkdirSync(outputDir, { recursive: true });

  await withBrowser(
    repoRoot,
    async ({ session, port }) => {
      for (const shot of shots) {
        await session.loadCalendar(`http://127.0.0.1:${port}/?${shot.query}`);

        // Lets fonts settle before the frame is grabbed.
        await delay(250);

        // Framing: the first sheet on its own, or the whole app shell.
        const clip = shot.fullPage
          ? null
          : await session.evaluate(`(() => {
              const box = document.querySelector('.page').getBoundingClientRect();
              return { x: box.x, y: box.y, width: box.width, height: box.height, scale: 1 };
            })()`);

        const { data } = await session.send('Page.captureScreenshot', {
          format: 'png',
          captureBeyondViewport: true,
          ...(clip ? { clip } : {}),
        });

        writeFileSync(join(outputDir, `${shot.name}.png`), Buffer.from(data, 'base64'));
        console.log(`captured ${shot.name}`);
      }
    },
    ['--hide-scrollbars', '--force-device-scale-factor=2', '--window-size=1600,1200'],
  );

  console.log(`\nPNGs in ${outputDir}`);
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
