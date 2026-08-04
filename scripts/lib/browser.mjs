/**
 * Shared harness for the scripts that drive real Chrome.
 *
 * Both scripts need the same three things: a static server for the app, a
 * headless Chrome they can talk to, and a way to evaluate expressions in the
 * page. Keeping one copy means a fix to the Chrome lookup or the temp-profile
 * teardown lands in both.
 *
 * There is no third-party automation library here on purpose. The DevTools
 * protocol is a WebSocket and a JSON endpoint, both of which node has natively,
 * and the repo stays free of a heavyweight browser dependency.
 */

import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { existsSync, readFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { extname, join, normalize, resolve } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
};

/** Serves `rootDirectory` on an ephemeral port, refusing paths that escape it. */
export function startStaticServer(requestedRoot) {
  // Normalized so the containment check below compares like with like: a caller
  // passing forward slashes on Windows would otherwise fail every request.
  const rootDirectory = resolve(requestedRoot);

  const server = createServer((request, response) => {
    const requestPath = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
    const relativePath = requestPath === '/' ? '/index.html' : requestPath;
    const filePath = join(rootDirectory, normalize(relativePath).replace(/^([/\\])+/, ''));

    if (!filePath.startsWith(rootDirectory) || !existsSync(filePath)) {
      response.writeHead(404).end('not found');
      return;
    }

    response.writeHead(200, {
      'content-type': MIME_TYPES[extname(filePath)] ?? 'application/octet-stream',
    });
    response.end(readFileSync(filePath));
  });

  return new Promise((resolveServer) => {
    server.listen(0, '127.0.0.1', () => resolveServer({ server, port: server.address().port }));
  });
}

const CHROME_CANDIDATES = [
  process.env.CHROME_PATH,
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
].filter(Boolean);

export function findChrome() {
  const found = CHROME_CANDIDATES.find((candidate) => existsSync(candidate));

  if (!found) {
    throw new Error('Chrome not found. Set CHROME_PATH to the executable.');
  }

  return found;
}

/**
 * Starts headless Chrome on a throwaway profile and returns once it has written
 * out the DevTools port it chose.
 */
export async function launchChrome(extraArguments = []) {
  const userDataDir = mkdtempSync(join(tmpdir(), 'printable-calendar-'));

  const chrome = spawn(findChrome(), [
    '--headless=new',
    '--disable-gpu',
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-extensions',
    '--remote-debugging-port=0',
    `--user-data-dir=${userDataDir}`,
    ...extraArguments,
    'about:blank',
  ], { stdio: ['ignore', 'ignore', 'pipe'] });

  const portFile = join(userDataDir, 'DevToolsActivePort');

  for (let attempt = 0; attempt < 100; attempt += 1) {
    if (existsSync(portFile)) {
      const [port] = readFileSync(portFile, 'utf8').split('\n');

      if (port?.trim()) {
        return { chrome, userDataDir, port: Number(port.trim()) };
      }
    }

    await delay(100);
  }

  chrome.kill();
  throw new Error('Chrome did not expose a DevTools port.');
}

/**
 * Chrome keeps a handle on its crash-reporting files for a moment after being
 * killed, and on Windows that turns an immediate delete into EBUSY. The profile
 * lives in the OS temp directory, so a few retries and then giving up is the
 * right trade: never fail a run over leftover scratch files.
 */
export async function removeProfileDirectory(userDataDir) {
  for (let attempt = 0; attempt < 10; attempt += 1) {
    try {
      rmSync(userDataDir, { recursive: true, force: true });
      return;
    } catch {
      await delay(200);
    }
  }
}

/** Minimal CDP client: enough to navigate, evaluate, screenshot and print. */
export class DevToolsSession {
  constructor(socket) {
    this.socket = socket;
    this.nextId = 1;
    this.pending = new Map();

    socket.addEventListener('message', (event) => {
      const message = JSON.parse(event.data);
      const handler = this.pending.get(message.id);

      if (!handler) {
        return;
      }

      this.pending.delete(message.id);

      if (message.error) {
        handler.reject(new Error(message.error.message));
      } else {
        handler.resolve(message.result);
      }
    });
  }

  static async connect(port) {
    const targets = await fetch(`http://127.0.0.1:${port}/json/list`).then((response) =>
      response.json(),
    );
    const page = targets.find((target) => target.type === 'page') ?? targets[0];
    const socket = new WebSocket(page.webSocketDebuggerUrl);

    await new Promise((resolveOpen, rejectOpen) => {
      socket.addEventListener('open', resolveOpen, { once: true });
      socket.addEventListener('error', rejectOpen, { once: true });
    });

    const session = new DevToolsSession(socket);
    await session.send('Page.enable');
    await session.send('Runtime.enable');

    return session;
  }

  send(method, params = {}) {
    const id = this.nextId;
    this.nextId += 1;

    return new Promise((resolveCall, rejectCall) => {
      this.pending.set(id, { resolve: resolveCall, reject: rejectCall });
      this.socket.send(JSON.stringify({ id, method, params }));
    });
  }

  async evaluate(expression) {
    const result = await this.send('Runtime.evaluate', {
      expression,
      awaitPromise: true,
      returnByValue: true,
    });

    if (result.exceptionDetails) {
      throw new Error(result.exceptionDetails.exception?.description ?? 'evaluation failed');
    }

    return result.result.value;
  }

  /**
   * Navigates and waits until the calendar has rendered. The app renders
   * synchronously on module evaluation, so polling for the global it exports is
   * both sufficient and quick.
   */
  async loadCalendar(url) {
    await this.send('Page.navigate', { url });

    for (let attempt = 0; attempt < 200; attempt += 1) {
      const ready = await this
        .evaluate('Boolean(window.printableCalendar && document.querySelector(".page"))')
        .catch(() => false);

      if (ready) {
        return;
      }

      await delay(50);
    }

    throw new Error(`calendar never rendered: ${url}`);
  }

  close() {
    this.socket.close();
  }
}

/**
 * Runs `body` with a served app and a live Chrome session, and tears both down
 * afterwards whatever happens.
 */
export async function withBrowser(rootDirectory, body, chromeArguments = []) {
  const { server, port } = await startStaticServer(rootDirectory);
  const { chrome, userDataDir, port: devToolsPort } = await launchChrome(chromeArguments);
  const session = await DevToolsSession.connect(devToolsPort);

  try {
    return await body({ session, port });
  } finally {
    session.close();
    chrome.kill();
    server.close();
    await removeProfileDirectory(userDataDir);
  }
}
