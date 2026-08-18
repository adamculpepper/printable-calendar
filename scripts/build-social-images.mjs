/**
 * Renders the share images from the running app, so the picture people see in a
 * link preview is the real calendar rather than a mockup that drifts from it.
 *
 *   node scripts/build-social-images.mjs
 *
 * Writes assets/og-image.png (1200x630, used by Open Graph and Twitter) and
 * assets/social-preview.png (1280x640, the size GitHub wants for a repository
 * social preview). Both are committed, because the meta tags point at them.
 */

import { writeFileSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';

import { withBrowser } from './lib/browser.mjs';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const outputDir = resolve(repoRoot, 'assets');

const TARGETS = [
  { name: 'og-image.png', width: 1200, height: 630 },
  { name: 'social-preview.png', width: 1280, height: 640 },
];

/** The calendar shown in the shot. A six-row month fills the sheet best. */
const CALENDAR_QUERY = 'startYear=2026&startMonth=8&monthCount=1&holidays=federal&shadeWeekends=true';

/**
 * Lifts the rendered sheet out of the app and drops it into a composed banner.
 * Everything is inlined, so the shot does not depend on the app's own chrome.
 */
const COMPOSE = (width, height) => `(() => {
  const sheet = document.querySelector('.page').outerHTML;
  const pageCss = document.getElementById('page-style').textContent;

  document.body.innerHTML =
    '<div class="banner">' +
      '<div class="banner-copy">' +
        '<p class="banner-eyebrow">Free &middot; No sign-up &middot; No watermark</p>' +
        '<h1 class="banner-title">Printable Calendar</h1>' +
        '<p class="banner-sub">Make a calendar, print it, save it as a PDF. Monthly through year-at-a-glance, any paper size, US holidays.</p>' +
        '<p class="banner-url">calendar.adamculpepper.net</p>' +
      '</div>' +
      '<div class="banner-art">' + sheet + '</div>' +
    '</div>';

  const style = document.createElement('style');
  style.textContent = pageCss + \`
    html, body { margin: 0; padding: 0; background: #fff; }
    .banner {
      box-sizing: border-box;
      width: ${width}px; height: ${height}px;
      display: flex; align-items: center; gap: 44px;
      padding: 0 0 0 64px;
      background: linear-gradient(135deg, #ffffff 0%, #f6f6f7 100%);
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
      overflow: hidden;
    }
    .banner-copy { flex: 0 0 ${Math.round(width * 0.42)}px; }
    .banner-eyebrow {
      margin: 0 0 18px; color: #b3271f; font-size: 19px; font-weight: 700;
      letter-spacing: 0.08em; text-transform: uppercase;
    }
    .banner-title { margin: 0 0 16px; font-size: 66px; line-height: 1.02; letter-spacing: -0.03em; color: #16161a; }
    .banner-sub { margin: 0 0 26px; font-size: 24px; line-height: 1.42; color: #5c5c66; }
    .banner-url { margin: 0; font-size: 19px; font-weight: 600; color: #8b8b95; }
    /*
     * The sheet renders at real print size, so it is scaled to the art column
     * rather than dropped in as-is. It is allowed to bleed a little off the
     * right edge, which reads as a page continuing past the frame.
     */
    .banner-art {
      flex: 1 1 auto; display: flex; align-items: center; justify-content: center;
      min-width: 0; margin-right: -${Math.round(width * 0.05)}px;
    }
    .banner-art .page {
      zoom: 1;
      flex: none;
      transform: rotate(-2.5deg) scale(${((width * 0.55) / 988).toFixed(3)});
      transform-origin: center;
      box-shadow: 0 3px 8px rgb(0 0 0 / 12%), 0 26px 60px rgb(0 0 0 / 18%);
      border: 1px solid #e6e6e9;
    }
  \`;
  document.head.append(style);
  return true;
})()`;

mkdirSync(outputDir, { recursive: true });

await withBrowser(repoRoot, async ({ session, port }) => {
  for (const target of TARGETS) {
    await session.loadCalendar(`http://127.0.0.1:${port}/?${CALENDAR_QUERY}`);
    await session.evaluate(COMPOSE(target.width, target.height));
    await delay(400);

    const { data } = await session.send('Page.captureScreenshot', {
      format: 'png',
      captureBeyondViewport: true,
      clip: { x: 0, y: 0, width: target.width, height: target.height, scale: 1 },
    });

    writeFileSync(resolve(outputDir, target.name), Buffer.from(data, 'base64'));
    console.log(`wrote assets/${target.name} (${target.width}x${target.height})`);
  }
}, ['--window-size=1400,800', '--hide-scrollbars', '--force-device-scale-factor=1']);
